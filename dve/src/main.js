// Main-thread glue: Babylon scene + vlox renderer wired to the All Contribute
// server world. Loaded dynamically by app.js (./dve/dist/dve-view.js) when the
// player enters the 3D game; the app owns placement/breaking through the API,
// this module paints/erases voxels from server-authoritative edits and drives
// the first-person camera (look + WASD + gravity/jump), nothing else.
import { Engine, Scene, FreeCamera, Vector3, Color4, Matrix, MeshBuilder, Mesh, StandardMaterial, Color3, DynamicTexture, GlowLayer } from "@babylonjs/core";
import { DVE_REV } from "../dist/rev.js";
import InitDVEBRClassic from "@divinevoxel/vlox-babylon/Init/Classic/InitDVEBRClassic";
import { StartRenderer } from "@divinevoxel/vlox/Init/StartRenderer";
import { VoxelBuildSpace } from "@divinevoxel/vlox/Builder/VoxelBuildSpace";
import { PaintVoxelData } from "@divinevoxel/vlox/Voxels";
import { VoxelLUT } from "@divinevoxel/vlox/Voxels/Data/VoxelLUT";
import { SLAB, voxelIdFor, baseBlock } from "./world.js";
// Re-exported so app.js can resolve live cells (walk surface, blockAt) with
// the same terrain mirror the generator uses.
export { SLAB, baseBlock };

// Headless diagnostics: count mesher→renderer deliveries, capture cb throws
// (a throwing cb silently never responds, pinning the sender's in-flight cap).
import { Threads as _T } from "@amodx/threads";
export const __dveCounts = { "set-section": 0, "remove-sector": 0 };
export const __dveErrors = [];
const _rt = _T.registerTask.bind(_T);
_T.registerTask = (name, cb) => _rt(name, (...a) => {
  if (name in __dveCounts) __dveCounts[name]++;
  try {
    return cb(...a);
  } catch (e) {
    if (__dveErrors.length < 8) __dveErrors.push(String(name) + ":" + String(e && e.stack || e).slice(0, 300));
    throw e;
  }
});

function solidColourTexture(hex) {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 16;
  const g = c.getContext("2d");
  g.fillStyle = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#4a5158";
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = "rgba(255,255,255,0.08)";
  g.fillRect(0, 0, 16, 4);
  g.fillStyle = "rgba(0,0,0,0.10)";
  g.fillRect(0, 12, 16, 4);
  return c.toDataURL("image/png");
}

const EYE = 1.7;          // camera eye height above the surface voxel
const SENS_DEFAULT = 0.0023;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export async function createDVEView(canvas, blocks, apiBase, opts = {}) {
  // opts.settings: { sensitivity, fov, renderDistance, speed }
  // opts.cellAt:   (x, y, z) => blockId | "air" — live server-authoritative
  //                state; walk physics collides against it. y grows upward,
  //                matching the server world.
  const settings = {
    sensitivity: SENS_DEFAULT,
    fov: 0.95,
    renderDistance: 900,
    speed: 7.5,
    ...(opts.settings || {}),
  };
  const cellAt = opts.cellAt || ((x, y, z) => baseBlock(x, y, z));

  const engine = new Engine(canvas, true, { stencil: false, preserveDrawingBuffer: false });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.561, 0.662, 0.761, 1); // matches #game backdrop

  // First-person camera, spawned on the terrain surface at the world centre.
  const surfaceEye = (wx, wz) => {
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    for (let y = SLAB.Y1 - 1; y >= 0; y--) {
      const id = cellAt(x, y, z);
      if (id !== undefined && id !== null && id !== "air") return y + 1 + EYE;
    }
    return EYE; // fully dug-out column: stand on the bedrock floor plane
  };
  // opts.spawn: optional { x, z, y?, yaw?, pitch? } — server-persisted
  // respawn point; without it (or y) the player stands on the terrain
  // surface at the spawn column.
  const spawn = opts.spawn || {};
  const spawnX = typeof spawn.x === "number" ? spawn.x : 0.5;
  const spawnZ = typeof spawn.z === "number" ? spawn.z : 0.5;
  const spawnY = typeof spawn.y === "number" ? spawn.y : surfaceEye(spawnX, spawnZ);
  const camera = new FreeCamera("dve-cam", new Vector3(spawnX, spawnY, spawnZ), scene);
  camera.rotation.set(typeof spawn.pitch === "number" ? spawn.pitch : 0.12,
    typeof spawn.yaw === "number" ? spawn.yaw : 0, 0);
  camera.minZ = 0.08;
  camera.inertia = 0;
  camera.angularSensibility = 1e9; // we drive rotation ourselves (lock or drag)

  const applySettings = next => {
    Object.assign(settings, next || {});
    camera.fov = clamp(settings.fov, 0.4, 1.5);
    camera.maxZ = clamp(settings.renderDistance, 40, 4000);
  };
  applySettings({});

  // ---- input: pointer lock (preferred) or drag-look fallback, WASD + jump ----
  const keys = new Set();
  let yaw = camera.rotation.y, pitch = camera.rotation.x;
  let dragging = false, lastX = 0, lastY = 0;
  let locked = false;

  const look = (dx, dy) => {
    yaw += dx * settings.sensitivity;
    pitch = clamp(pitch + dy * settings.sensitivity, -1.52, 1.52);
  };

  canvas.addEventListener("pointerdown", e => {
    if (e.button > 2) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    // A dead player keeps the cursor free: clicking the canvas (or through the
    // death screen's gaps) must not take the pointer lock back.
    if (!locked && !frozen && canvas.requestPointerLock) {
      try { canvas.requestPointerLock(); } catch { /* fall back to drag-look */ }
    }
  });
  window.addEventListener("pointerup", () => { dragging = false; });
  document.addEventListener("pointerlockchange", () => {
    locked = document.pointerLockElement === canvas;
    if (locked) dragging = false;
  });
  document.addEventListener("pointerlockerror", () => { locked = false; });
  document.addEventListener("mousemove", e => {
    if (locked) look(e.movementX || 0, e.movementY || 0);
    else if (dragging) {
      look(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY;
    }
  });
  const gameKey = e => {
    const t = document.activeElement;
    if (t && ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)) return false;
    if (!document.getElementById("game") || document.getElementById("game").hidden) return false;
    return true;
  };
  document.addEventListener("keydown", e => { if (gameKey(e)) keys.add(e.code); });
  document.addEventListener("keyup", e => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());

  // ---- movement in the render loop ------------------------------------------
  // Walking is physics-driven: gravity pulls the body down, Space jumps, and
  // the body AABB collides against solid voxels from the client's live cell
  // mirror (cellAt = server base terrain + synced edits). The eye sits at
  // EYE above the feet; the player falls into caves, stands on placed
  // blocks, and pops up when a block rises into the feet. No teleporting.
  const HALF = 0.3;   // body half-width
  const HEIGHT = 1.8; // body height
  const GRAVITY = 30; // m/s^2 (gamey)
  const JUMP_V = 9.4; // apex ~1.4 blocks: clears a one-block ledge
  const MAX_FALL = 42;

  let vy = 0;
  let grounded = false;
  // A dead body is parked: the object ignores a dead player's pose frames,
  // so the client must not walk away from where it fell.
  let frozen = false;

  const solidVoxel = (bx, by, bz) => {
    if (by < SLAB.Y0 || by >= SLAB.Y1) return false;
    const id = cellAt(bx, by, bz);
    return id !== undefined && id !== null && id !== "air";
  };
  const bodyBlocked = (x, feetY, z) => {
    const x0 = Math.floor(x - HALF), x1 = Math.floor(x + HALF);
    const z0 = Math.floor(z - HALF), z1 = Math.floor(z + HALF);
    const y0 = Math.floor(feetY + 0.002), y1 = Math.floor(feetY + HEIGHT - 0.002);
    for (let bx = x0; bx <= x1; bx++)
      for (let bz = z0; bz <= z1; bz++)
        for (let by = y0; by <= y1; by++)
          if (solidVoxel(bx, by, bz)) return true;
    return false;
  };
  // Solid ground directly beneath the feet (feet rest exactly on a top face).
  const footSupport = (x, feetY, z) => {
    const y = Math.floor(feetY - 0.01);
    for (let bx = Math.floor(x - HALF); bx <= Math.floor(x + HALF); bx++)
      for (let bz = Math.floor(z - HALF); bz <= Math.floor(z + HALF); bz++)
        if (solidVoxel(bx, y, bz)) return true;
    return false;
  };

  const tick = () => {
    const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
    camera.rotation.y = yaw; camera.rotation.x = pitch;
    if (frozen) { vy = 0; return; }
    // Hold Shift (or Ctrl) to sprint.
    const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight") ||
      keys.has("ControlLeft") || keys.has("ControlRight");
    const speed = settings.speed * (sprint ? 2 : 1);
    let mx = 0, mz = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) mz += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) mz -= 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
    let dx = 0, dz = 0;
    if (mz) { dx += Math.sin(yaw) * mz * speed * dt; dz += Math.cos(yaw) * mz * speed * dt; }
    if (mx) { dx += Math.cos(yaw) * mx * speed * dt; dz += -Math.sin(yaw) * mx * speed * dt; }

    // Axis-wise AABB resolution against the voxel grid: slide along walls,
    // snap flush to the face we hit.
    if (dx) {
      const nx = camera.position.x + dx;
      if (!bodyBlocked(nx, camera.position.y - EYE, camera.position.z)) camera.position.x = nx;
      else if (dx > 0) camera.position.x = Math.floor(nx + HALF) - HALF - 0.001;
      else camera.position.x = Math.floor(nx - HALF) + 1 + HALF + 0.001;
    }
    if (dz) {
      const nz = camera.position.z + dz;
      if (!bodyBlocked(camera.position.x, camera.position.y - EYE, nz)) camera.position.z = nz;
      else if (dz > 0) camera.position.z = Math.floor(nz + HALF) - HALF - 0.001;
      else camera.position.z = Math.floor(nz - HALF) + 1 + HALF + 0.001;
    }

    // Stuck recovery: a remote edit can paint a block into the body
    // (mirror lag included). Stand on top of the highest overlapping solid
    // instead of wobbling inside it.
    const feetNow = camera.position.y - EYE;
    if (bodyBlocked(camera.position.x, feetNow, camera.position.z)) {
      let f = Math.floor(feetNow);
      while (f < SLAB.Y1 && bodyBlocked(camera.position.x, f + 0.001, camera.position.z)) f++;
      if (f < SLAB.Y1) { camera.position.y = f + EYE + 0.001; vy = 0; }
    }

    if (keys.has("Space") && grounded) { vy = JUMP_V; grounded = false; }
    vy = Math.max(-MAX_FALL, vy - GRAVITY * dt);
    let ny = camera.position.y + vy * dt;
    if (bodyBlocked(camera.position.x, ny - EYE, camera.position.z)) {
      if (vy <= 0) {
        ny = Math.floor(ny - EYE) + 1 + EYE; // land: feet on the block top
        vy = 0;
      } else {
        // Head bump: undo the step entirely. Advancing into the blocked
        // cell (even briefly) put the body INSIDE the ceiling block, which
        // then ejected the player through it on the next tick.
        vy = 0;
        ny = camera.position.y;
      }
    }
    camera.position.y = ny;
    grounded = vy <= 0 && footSupport(camera.position.x, camera.position.y - EYE, camera.position.z);

    // The world is finite: keep the player inside with a small lip.
    camera.position.x = clamp(camera.position.x, SLAB.X0 + 0.4, SLAB.X1 - 0.4);
    camera.position.z = clamp(camera.position.z, SLAB.Z0 + 0.4, SLAB.Z1 - 0.4);
  };

  // One voxel + one solid-colour texture per registered block. The registry
  // snapshot is taken when the view is created; publish a new block, then
  // re-enter the game to see it (vlox textures are compiled at init).
  const textureData = [];
  const voxels = [];
  const seen = new Set();
  for (const b of blocks) {
    const vid = voxelIdFor(b.id);
    if (seen.has(vid)) continue;
    seen.add(vid);
    textureData.push({ id: `tex_${vid}`, base64: solidColourTexture(b.colour) });
    voxels.push({
      id: vid,
      name: vid,
      properties: {
        dve_model_data: {
          id: "dve_simple_cube",
          modSchema: [],
          modRelationSchema: [],
          inputs: { "*": { texture: `tex_${vid}` } },
        },
      },
    });
  }

  // ---- Glowing blocks --------------------------------------------------------
  // The vlox light pipeline does not run here (faces would multiply by empty
  // light data), so a block's registry `light` value is rendered the Babylon
  // way: an emissive cube on the cell, collected into a GlowLayer bloom.
  // vlox renders every voxel section in Babylon rendering group 1 and Babylon
  // clears the depth buffer between groups — anything we draw must be in that
  // group or voxels behind it will paint over it.
  const VOXEL_GROUP = 1;
  const glowLayer = new GlowLayer("glow", scene, { mainTextureSamples: 2 });
  const glowInfo = new Map(); // voxel id -> { colour, light }
  const glowMeshes = new Map(); // "x,y,z" -> Mesh
  for (const b of blocks) {
    const light = Number(b.light) || 0;
    if (light > 0 && !glowInfo.has(voxelIdFor(b.id))) {
      glowInfo.set(voxelIdFor(b.id), { colour: Color3.FromHexString(b.colour || "#ffffff"), light });
    }
  }
  const syncGlow = (x, y, z, blockId) => {
    const key = `${x},${y},${z}`;
    const info = glowInfo.get(voxelIdFor(blockId || ""));
    let m = glowMeshes.get(key);
    if (!info) {
      if (m) { m.dispose(); glowMeshes.delete(key); }
      return;
    }
    if (!m) {
      m = MeshBuilder.CreateBox("glow", { size: 1.001 }, scene);
      m.position.set(x + 0.5, y + 0.5, z + 0.5);
      m.renderingGroupId = VOXEL_GROUP;
      const mat = new StandardMaterial("glow-mat", scene);
      const k = 0.6 + 0.4 * (info.light / 15);
      mat.emissiveColor = info.colour.scale(k);
      mat.diffuseColor = info.colour.scale(0.01);
      mat.disableLighting = true;
      m.material = mat;
      glowLayer.addIncludedOnlyMesh(m);
      glowMeshes.set(key, m);
    }
  };

  const renderer = await InitDVEBRClassic({
    textureTypes: [],
    substances: [],
    scene,
    textureData,
  });

  // The generator worker fetches initial edits from the API; threadcomm owns
  // postMessage, so hand it the API base through the worker URL fragment.
  const workerURL = name => {
    const url = new URL(`./${name}`, import.meta.url);
    url.search = `h=${DVE_REV[name]}`;
    url.hash = encodeURIComponent(apiBase);
    return url;
  };
  const worldWorker = new Worker(workerURL("world.worker.js"), { type: "module" });
  const mesherWorkers = [new Worker(workerURL("mesher.worker.js"), { type: "module" })];
  const generatorWorkers = [new Worker(workerURL("generator.worker.js"), { type: "module" })];

  const DVER = await StartRenderer({
    renderer,
    worldWorker,
    mesherWorkers,
    generatorWorkers,
    voxels,
    // The slab world never runs the light pipeline (stages are flag-driven),
    // so mesher sun shading would multiply faces by empty light data.
    mesher: { doSunLight: false },
  });

  DVER.threads.world.runTask("start-world", []);

  const rayProvider = { origin: { x: 0, y: 16, z: 0 }, direction: { x: 0, y: 0, z: 1 }, length: 200 };
  const buildSpace = new VoxelBuildSpace(DVER, rayProvider);

  let genCell = "";
  // ---- Day-night cycle -------------------------------------------------------
  // One in-game day = 24 real minutes, clocked off Date.now() so every client
  // renders the same phase with zero sync traffic. Keyframes interpolate sky
  // colour and scene brightness (the mesher is unlit, so brightness rides on
  // Babylon's default image-processing colour transform).
  const DAY_MS = 24 * 60 * 1000;
  const SKY = [
    // [t, r, g, b, brightness]
    [0.00, 0.03, 0.05, 0.12, 0.30], // midnight
    [0.22, 0.05, 0.07, 0.15, 0.40],
    [0.28, 0.75, 0.45, 0.35, 0.80], // dawn
    [0.35, 0.561, 0.662, 0.761, 1], // day
    [0.70, 0.561, 0.662, 0.761, 1],
    [0.76, 0.80, 0.40, 0.30, 0.75], // dusk
    [0.82, 0.03, 0.05, 0.12, 0.30],
    [1.00, 0.03, 0.05, 0.12, 0.30],
  ];
  const dayT = () => (Date.now() % DAY_MS) / DAY_MS;

  // ---- Sun & Moon ------------------------------------------------------------
  // Two emissive discs on one empty root. infiniteDistance only takes effect
  // on an UNPARENTED node (Babylon ignores it on children), so the camera-
  // pinning lives on the root and both discs inherit it. Their rendering
  // group is 0 ON PURPOSE — the opposite of the avatar/glow rule (VOXEL_GROUP
  // = 1): Babylon clears the depth buffer between groups, group 0 draws
  // before the voxels, so terrain occludes the sky bodies instead of the
  // discs burning through the world.
  const skyRoot = new Mesh("sky-root", scene);
  skyRoot.infiniteDistance = true;
  const skyDisc = (name, radius, hex) => {
    const m = MeshBuilder.CreateDisc(name, { radius, tessellation: 32 }, scene);
    m.parent = skyRoot;
    m.billboardMode = Mesh.BILLBOARDMODE_ALL;
    m.applyFog = false;
    m.isPickable = false;
    m.infiniteDistance = true; // inert while parented; documents intent
    m.renderingGroupId = 0;
    const mat = new StandardMaterial(`${name}-mat`, scene);
    const c = Color3.FromHexString(hex);
    mat.emissiveColor = c;
    mat.diffuseColor = c;
    mat.disableLighting = true;
    m.material = mat;
    return m;
  };
  const sun = skyDisc("sun", 18, "#ffd27a");
  const moon = skyDisc("moon", 13, "#dfe6f2");
  const SKY_TILT = 0.41; // ~23.5 deg obliquity: the orbit leans, rise/set sit off-vertical
  const placeSkyBodies = t => {
    // Orbit on a tilted axis, sun and moon on opposite ends: sun overhead at
    // t=0.5 (noon), moon overhead at t=0 (midnight). Distance rides the
    // camera's far plane so the discs always sit inside the frustum.
    const d = clamp(camera.maxZ * 0.4, 200, 700);
    const a = 2 * Math.PI * t;
    const ux = Math.sin(a), uy = -Math.cos(a);
    const x = ux * Math.cos(SKY_TILT) - uy * Math.sin(SKY_TILT);
    const y = ux * Math.sin(SKY_TILT) + uy * Math.cos(SKY_TILT);
    sun.position.set(x * d, y * d, 0);
    moon.position.set(-x * d, -y * d, 0);
  };

  const applyDayNight = () => {
    const t = dayT();
    let a = SKY[SKY.length - 2], b = SKY[SKY.length - 1];
    for (let i = 0; i < SKY.length - 1; i++) {
      if (t >= SKY[i][0] && t < SKY[i + 1][0]) { a = SKY[i]; b = SKY[i + 1]; break; }
    }
    const f = (t - a[0]) / (b[0] - a[0]);
    const mix = (i) => a[i] + (b[i] - a[i]) * f;
    scene.clearColor.set(mix(1), mix(2), mix(3), 1);
    const L = mix(4);
    scene.imageProcessingConfiguration.colorTransform = Matrix.FromArray([
      L, 0, 0, 0,
      0, L, 0, 0,
      0, 0, L, 0,
      0, 0, 0, 1,
    ]);
    placeSkyBodies(t);
  };
  // ---- Remote players --------------------------------------------------------
  // Presence fan-out (WS "pose" frames from the WorldLive object) draws a
  // blocky body + name card for every other player. Positions lerp toward the
  // last pose so 5 Hz updates look smooth. The body colours come from the
  // player's saved appearance.
  const hexColour = v => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null);
  const lookOf = a => ({
    body_colour: hexColour(a && a.body_colour) || "#3b6ea5",
    head_colour: hexColour(a && a.head_colour) || "#d9a06b",
    accent_colour: hexColour(a && a.accent_colour) || "#2f8f4f",
    eye_colour: hexColour(a && a.eye_colour) || "#1d2430",
  });
  const remotes = new Map();
  const ensureRemote = (name, appearance) => {
    let r = remotes.get(name);
    if (r) return r;
    const root = new Mesh("player", scene);
    root.renderingGroupId = VOXEL_GROUP;
    const parts = [];
    const part = (w, h, d, y, key, x = 0, z = 0) => {
      const m = MeshBuilder.CreateBox("part", { width: w, height: h, depth: d }, scene);
      m.position.set(x, y, z);
      m.parent = root;
      m.renderingGroupId = VOXEL_GROUP;
      const mat = new StandardMaterial("part-mat", scene);
      m.material = mat;
      parts.push({ mat, key });
      return m;
    };
    part(0.5, 0.9, 0.3, 0.45, "accent_colour");   // legs
    part(0.6, 0.55, 0.35, 1.22, "body_colour");   // body
    part(0.4, 0.35, 0.35, 1.67, "head_colour");   // head
    // Eyes sit on the +Z face of the head (rotation.y = the sender's camera
    // yaw, so yaw 0 faces +Z). They are the facing cue for other players and
    // the fourth customisable colour.
    part(0.11, 0.1, 0.06, 1.72, "eye_colour", 0.1, 0.19);
    part(0.11, 0.1, 0.06, 1.72, "eye_colour", -0.1, 0.19);
    const label = MeshBuilder.CreatePlane("name", { width: Math.min(2.2, 0.25 + String(name).length * 0.13), height: 0.34 }, scene);
    label.position.y = 2.15;
    label.parent = root;
    label.renderingGroupId = VOXEL_GROUP;
    label.billboardMode = Mesh.BILLBOARDMODE_ALL;
    const tex = new DynamicTexture("name-tex", { width: 256, height: 64 }, scene, true);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = "rgba(20,20,30,0.55)";
    ctx.fillRect(0, 8, 256, 48);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 30px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(name).slice(0, 24), 128, 34);
    tex.update();
    const lmat = new StandardMaterial("name-mat", scene);
    lmat.emissiveTexture = tex;
    lmat.opacityTexture = tex;
    lmat.disableLighting = true;
    label.material = lmat;
    r = { root, parts, look: null, rx: NaN, ry: 0, target: null, last: 0, vx: 0, vy: 0, vz: 0 };
    remotes.set(name, r);
    applyLook(r, appearance);
    return r;
  };
  const applyLook = (r, appearance) => {
    const look = JSON.stringify(lookOf(appearance));
    if (r.look === look) return;
    r.look = look;
    const parsed = JSON.parse(look);
    for (const { mat, key } of r.parts) {
      const col = Color3.FromHexString(parsed[key]);
      mat.diffuseColor = col;
      // Eyes carry a little more self-illumination so the facing cue survives
      // the night, when diffuse shading is nearly black.
      mat.emissiveColor = col.scale(key === "eye_colour" ? 0.6 : 0.3);
    }
  };
  const advanceRemotes = () => {
    const now = Date.now();
    const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
    for (const [name, r] of remotes) {
      if (now - r.last > 60_000) { // stale: player left or went silent
        r.root.dispose(false, true);
        remotes.delete(name);
        continue;
      }
      if (!r.target) continue;
      const t = r.target;
      // Dead-reckon: while waiting for the next 5 Hz pose frame, coast the
      // avatar along its reported velocity (blocks/sec) so motion stays
      // fluid between frames. Capped at 0.6 s: a player who stops
      // broadcasting freezes near their last true pose instead of running
      // away forever.
      let px = t.x, py = t.y, pz = t.z;
      const drift = Math.min(0.6, (now - r.last) / 1000);
      if (drift > 0 && (r.vx || r.vy || r.vz)) {
        px += r.vx * drift; py += r.vy * drift; pz += r.vz * drift;
        // Keep the extrapolated body above ground using the same surface
        // walk as the local player — but only near the local player, so a
        // column scan per distant avatar per frame costs nothing.
        const dxc = px - camera.position.x, dzc = pz - camera.position.z;
        if (dxc * dxc + dzc * dzc < 2304) py = Math.max(py, surfaceEye(px, pz));
        // Never let extrapolation shove the avatar through the camera: if
        // the predicted body would engulf the eye, keep the last true pose.
        if (dxc * dxc + dzc * dzc < 1 && py - 1.8 < camera.position.y && py > camera.position.y - HEIGHT) {
          px = t.x; py = t.y; pz = t.z;
        }
      }
      if (Number.isNaN(r.rx)) {
        r.rx = px; r.ry = t.yaw;
        r.root.position.set(px, py - EYE, pz);
      } else {
        // Smooth-correct toward the (possibly extrapolated) true pose when
        // a frame arrives — no snapping: normal blend is gentle, but a
        // larger position error (late/distant frame) corrects faster.
        const ey = py - EYE - r.root.position.y;
        const err = Math.hypot(px - r.rx, pz - r.root.position.z, ey);
        const k = 1 - Math.exp((err > 4 ? -16 : -8) * dt);
        r.rx += (px - r.rx) * k;
        const rz = r.root.position.z;
        r.root.position.set(r.rx, r.root.position.y + ey * k, rz + (pz - rz) * k);
        let dy = t.yaw - r.ry;
        while (dy > Math.PI) dy -= 2 * Math.PI;
        while (dy < -Math.PI) dy += 2 * Math.PI;
        r.ry += dy * 0.25;
        r.root.rotation.y = r.ry;
      }
    }
  };

  // ---- Mobs --------------------------------------------------------------
  // The WorldLive object simulates mobs; the client only ever receives full
  // snapshots ({type:"mobs",mobs:[...]}) and lerps toward them, so no mob
  // motion here can desync authority. Bodies live in VOXEL_GROUP like the
  // avatars — the render-group rule that keeps terrain occluding them.
  const MOB_LOOKS = {
    zombie: { body: "#4f7a3a", head: "#6f9a52", accent: "#31512f", h: 1.85, w: 0.65, d: 0.35 },
    pig: { body: "#e39aa6", head: "#f0b3bd", accent: "#a96b76", h: 0.75, w: 0.8, d: 1.1, quadruped: true },
    // Fallback shape for any kind the object spawns later.
    slime: { body: "#4fae5e", head: "#79c986", accent: "#2f7a3c", h: 0.8, w: 0.9, d: 0.9 },
  };
  const mobs = new Map();
  const ensureMob = (id, kind, hostile) => {
    let m = mobs.get(id);
    if (m) return m;
    const look = MOB_LOOKS[kind] || MOB_LOOKS.slime;
    const root = new Mesh("mob", scene);
    root.renderingGroupId = VOXEL_GROUP;
    const mat = key => {
      const mm = new StandardMaterial("mob-mat", scene);
      const col = Color3.FromHexString(look[key]);
      mm.diffuseColor = col;
      mm.emissiveColor = col.scale(0.22);
      return mm;
    };
    const box = (w, h, d, x, y, z, key) => {
      const b = MeshBuilder.CreateBox("mob-part", { width: w, height: h, depth: d }, scene);
      b.position.set(x, y, z);
      b.parent = root;
      b.renderingGroupId = VOXEL_GROUP;
      b.material = mat(key);
      return b;
    };
    if (look.quadruped) {
      box(look.w, look.h * 0.6, look.d, 0, look.h * 0.55, 0, "body");           // torso
      box(look.w * 0.7, look.h * 0.55, look.w * 0.6, 0, look.h * 0.72, look.d * 0.62, "head"); // head forward
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]])
        box(0.22, look.h * 0.5, 0.22, sx * look.w * 0.3, look.h * 0.24, sz * look.d * 0.36, "accent");
    } else if (kind === "slime") {
      box(look.w, look.h, look.d, 0, look.h / 2, 0, "body");
      box(look.w * 0.45, look.h * 0.22, look.d * 0.2, 0, look.h * 0.62, look.d * 0.5, "accent");
    } else {
      box(0.42, 0.85, 0.28, 0, 0.43, 0, "accent");                              // legs
      box(look.w, 0.6, look.d, 0, 1.15, 0, "body");                             // torso
      box(0.4, 0.36, 0.36, 0, 1.63, 0, "head");                                 // head
      if (kind === "zombie") {                                                  // arms out, Minecraft-style
        box(0.2, 0.55, 0.2, -look.w * 0.42, 1.2, look.d * 0.5, "accent");
        box(0.2, 0.55, 0.2, look.w * 0.42, 1.2, look.d * 0.5, "accent");
      }
    }
    m = { root, kind, hostile, w: look.w, h: look.h, d: look.d,
      target: null, last: 0, mx: NaN, my: 0, hp: null, hitAt: 0, phase: Math.random() * 6 };
    mobs.set(id, m);
    return m;
  };
  const advanceMobs = () => {
    const now = Date.now();
    const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
    for (const [id, m] of mobs) {
      if (now - m.last > 5_000) { // snapshot gap: the object stopped listing it
        m.root.dispose(false, true);
        mobs.delete(id);
        continue;
      }
      if (!m.target) continue;
      const t = m.target;
      // Snapshots are ~4 Hz; glide between them (the object's own walk is
      // slower than a player's, so a gentle blend reads as smooth walking).
      const err = Math.hypot(t.x - m.mx, t.z - m.root.position.z, t.y - m.root.position.y);
      const k = err > 3 ? 1 - Math.exp(-14 * dt) : 1 - Math.exp(-7 * dt);
      if (Number.isNaN(m.mx)) {
        m.mx = t.x; m.my = t.yaw;
        m.root.position.set(t.x, t.y, t.z);
      } else {
        m.root.position.set(
          m.mx + (t.x - m.mx) * k,
          m.root.position.y + (t.y - m.root.position.y) * k,
          m.root.position.z + (t.z - m.root.position.z) * k
        );
        m.mx += (t.x - m.mx) * k;
        let dy = t.yaw - m.my;
        while (dy > Math.PI) dy -= 2 * Math.PI;
        while (dy < -Math.PI) dy += 2 * Math.PI;
        m.my += dy * 0.3;
        m.root.rotation.y = m.my;
      }
      // Walking bob: quadrupeds and humanoids get a subtle leg/limb swing
      // keyed to travelled distance so idle mobs stand still.
      const speed = Math.hypot(t.x - m.root.position.x, t.z - m.root.position.z);
      m.phase += dt * (1.5 + speed * 3);
      const swing = Math.min(0.45, speed * 0.35) * Math.sin(m.phase * 3);
      for (const child of m.root.getChildren()) {
        if (child.name === "mob-part" && child.position.y < m.h * 0.55) child.rotation.x = swing;
      }
      // Recent hit: brief brightening so an attack reads without a health bar.
      const flash = Math.max(0, 0.35 - (now - m.hitAt) / 400);
      if (m.flashWas !== flash) {
        m.flashWas = flash;
        for (const child of m.root.getChildren()) {
          if (child.material && child.name === "mob-part") child.material.emissiveColor = child.material.diffuseColor.scale(0.22 + flash * 1.6);
        }
      }
    }
  };

  const frame = () => {
    tick();
    applyDayNight();
    advanceRemotes();
    advanceMobs();
    // Chunk streaming: when the player crosses a 16-block cell, move the
    // world thread's generator focus so vlox re-rings its active sectors
    // (new chunks generate ahead, far ones drop out).
    const cell = (camera.position.x >> 4) + "," + (camera.position.z >> 4);
    if (cell !== genCell) {
      genCell = cell;
      DVER.threads.world.runTask("move-generator", [camera.position.x, camera.position.y, camera.position.z]);
    }
    scene.render();
  };
  engine.runRenderLoop(frame);
  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);
  // Diagnostics/testing handle (pixel reads, mesh counts, camera in checks).
  // `frame` lets a harness drive physics without depending on rAF scheduling.
  window.__dve = { engine, scene, camera, DVER, buildSpace, counts: __dveCounts, errors: __dveErrors, genCell: () => genCell, frame,
    aim: (y, p) => { yaw = y; pitch = clamp(p, -1.52, 1.52); camera.rotation.y = yaw; camera.rotation.x = pitch; } };

  const view = {
    /** Apply one server-authoritative edit to a single voxel. */
    async applyEdit(x, y, z, blockId) {
      if (x < SLAB.X0 || x >= SLAB.X1 || y < SLAB.Y0 || y >= SLAB.Y1 || z < SLAB.Z0 || z >= SLAB.Z1) return;
      // The vlox Builder paint/erase tasks await LockSectors, which wedges on
      // sectors checkedOut for mesher transfer (they never check back in).
      // Simulation-brush painting is synchronous, so it is atomic in the
      // single-threaded world worker; drive that task directly instead.
      const id = blockId === "air" ? "dve_air" : voxelIdFor(blockId);
      const raw = PaintVoxelData.ToRaw(PaintVoxelData.Create({ id }));
      await DVER.threads.world.runTaskAsync("paint-direct", [[0, x, y, z], raw, id]);
      syncGlow(x, y, z, blockId);
      // Keep the generator's edit map current, so cells that activate AFTER
      // this edit still generate the edited block (far-cell streaming).
      try {
        const gen = DVER.threads.generators.getThreads()[0];
        if (gen) gen.runTaskAsync("note-edit", { x, y, z, block_id: blockId });
      } catch { /* generator restart will re-fetch from the API anyway */ }
    },

    /**
     * Cast a ray from a screen point into the voxel world.
     * Returns { position, normalPosition } in 3D coords, or null.
     * Crosshair picking: app passes the canvas centre.
     */
    async pickAt(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const ray = scene.createPickingRay(
        clientX - rect.left,
        clientY - rect.top,
        null,
        camera
      );
      const hit = await buildSpace.pick(
        { x: ray.origin.x, y: ray.origin.y, z: ray.origin.z },
        { x: ray.direction.x, y: ray.direction.y, z: ray.direction.z },
        200
      );
      return hit;
    },

    /** Crosshair pick without screen coords. */
    pickCenter() {
      const rect = canvas.getBoundingClientRect();
      return this.pickAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
    },

    /** Update live settings (sensitivity/fov/render distance/speed). */
    setSettings(next) { applySettings(next); },
    /**
     * Place or update a remote player's avatar from a presence pose frame.
     * vx/vy/vz (optional, blocks/sec) let advanceRemotes dead-reckon the
     * avatar along its velocity between pose frames.
     */
    setRemote(name, x, y, z, yaw, appearance, vx, vy, vz) {
      const r = ensureRemote(name, appearance);
      applyLook(r, appearance);
      r.target = { x, y, z, yaw };
      const vel = v => (typeof v === "number" && Number.isFinite(v) ? clamp(v, -30, 30) : 0);
      r.vx = vel(vx); r.vy = vel(vy); r.vz = vel(vz);
      r.last = Date.now();
    },
    removeRemote(name) {
      const r = remotes.get(name);
      if (r) { r.root.dispose(false, true); remotes.delete(name); }
    },

    /** One entry from a WorldLive mob snapshot (y = feet on the surface). */
    setMob(id, kind, x, y, z, yaw, hostile, hp) {
      const m = ensureMob(id, kind, hostile === true);
      if (typeof hp === "number" && m.hp !== null && hp < m.hp) m.hitAt = Date.now();
      if (typeof hp === "number") m.hp = hp;
      m.target = { x, y, z, yaw };
      m.last = Date.now();
    },
    removeMob(id) {
      const m = mobs.get(id);
      if (m) { m.root.dispose(false, true); mobs.delete(id); }
    },
    /**
     * The mob the crosshair is over, within melee reach (or null). A ray/AABB
     * test against the snapshot bodies — picking is presentation; the object
     * re-checks distance and only accepts weapon/tool items.
     */
    pickMob() {
      const dir = camera.getForwardRay().direction;
      const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
      let best = null, bestT = 6;
      for (const [id, m] of mobs) {
        const p = m.root.position;
        const minX = p.x - m.w / 2, maxX = p.x + m.w / 2;
        const minY = p.y, maxY = p.y + m.h;
        const minZ = p.z - m.d / 2, maxZ = p.z + m.d / 2;
        let t0 = 0, t1 = bestT;
        let ok = true;
        for (const [o, d, lo, hi] of [[ox, dir.x, minX, maxX], [oy, dir.y, minY, maxY], [oz, dir.z, minZ, maxZ]]) {
          if (Math.abs(d) < 1e-8) { if (o < lo || o > hi) { ok = false; break; } continue; }
          let a = (lo - o) / d, b = (hi - o) / d;
          if (a > b) { const s = a; a = b; b = s; }
          t0 = Math.max(t0, a); t1 = Math.min(t1, b);
          if (t0 > t1) { ok = false; break; }
        }
        if (ok && t0 >= 0 && t0 < bestT) { bestT = t0; best = { id, kind: m.kind, hostile: m.hostile, distance: t0 }; }
      }
      return best;
    },

    /** Teleport the local body (respawn). y is eye height, like `pose`. */
    setPose(state) {
      if (!state) return false;
      const x = Number(state.x), y = Number(state.y), z = Number(state.z);
      if (![x, y, z].every(Number.isFinite)) return false;
      camera.position.set(x, y, z);
      yaw = Number(state.yaw) || 0;
      pitch = Math.max(-1.52, Math.min(1.52, Number(state.pitch) || 0));
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
      return true;
    },

    /** Release input grabs when leaving the game screen. */
    releaseInput() {
      keys.clear();
      dragging = false;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },

    /** Grab the cursor (pointer lock) for FPS look. False if refused. */
    grabPointer() {
      if (!canvas.requestPointerLock) return false;
      try { canvas.requestPointerLock(); return true; } catch { return false; }
    },

    /** Re-fit the engine after the game overlay is un-hidden. */
    resize() {
      engine.resize();
    },

    /** Park (or release) the local body — used for the death state. */
    setFrozen(v) {
      frozen = !!v;
      if (frozen) { keys.clear(); vy = 0; }
    },

    /** True when a block at (cx,cy,cz) would intersect the player body. */
    bodyCellOverlap(cx, cy, cz) {
      const p = camera.position;
      const feet = p.y - EYE;
      return cx + 1 > p.x - HALF && cx < p.x + HALF &&
        cz + 1 > p.z - HALF && cz < p.z + HALF &&
        cy + 1 > feet && cy < feet + HEIGHT;
    },

    /** Live camera state for the HUD. */
    get pose() {
      const p = camera.position;
      return { x: p.x, y: p.y, z: p.z, yaw, pitch, surfaceY: surfaceEye(p.x, p.z) };
    },
  };
  window.__dve.view = view;
  return view;
}
