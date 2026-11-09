// Main-thread glue: Babylon scene + vlox renderer wired to the All Contribute
// server world. Loaded dynamically by app.js (./dve/dist/dve-view.js) when the
// player enters the 3D game; the app owns placement/breaking through the API,
// this module paints/erases voxels from server-authoritative edits and drives
// the first-person camera (look + WASD + gravity/jump), nothing else.
import { Engine, Scene, FreeCamera, Vector3, Color4, Matrix, MeshBuilder, Mesh, TransformNode, StandardMaterial, Color3, DynamicTexture, Texture, GlowLayer } from "@babylonjs/core";
import { DVE_REV } from "../dist/rev.js";
import InitDVEBRClassic from "@divinevoxel/vlox-babylon/Init/Classic/InitDVEBRClassic";
import { StartRenderer } from "@divinevoxel/vlox/Init/StartRenderer";
import { healVoxelTags } from "./lut-repair.js";
import { VoxelBuildSpace } from "@divinevoxel/vlox/Builder/VoxelBuildSpace";
import { PaintVoxelData } from "@divinevoxel/vlox/Voxels";
import { VoxelLUT } from "@divinevoxel/vlox/Voxels/Data/VoxelLUT";
import { GeometryLUT } from "@divinevoxel/vlox/Voxels/Data/GeometryLUT";
import { SLAB, SEA_LEVEL, voxelIdFor, baseBlock, heightAt } from "./world.js";
// Re-exported so app.js can resolve live cells (walk surface, blockAt) with
// the same terrain mirror the generator uses.
export { SLAB, SEA_LEVEL, baseBlock, heightAt };

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

// Models a published block may ask for. vlox ships a closed set (InitVoxelData
// hardcodes it), so anything outside this list crashes client init — the Studio
// offers exactly these and the Worker refuses the rest. Each entry is safe with
// no voxel states set: the default state renders the base shape.
export const BLOCK_MODELS = [
  "dve_simple_cube",              // the whole block, one texture
  "dve_full_texture_cube",        // six face slots (fed the same texture here)
  "dve_transparent_simple_cube",  // glass: faces culled only against equals
  "dve_no_cull_simple_cube",      // always-drawn cube
  "dve_simple_half_cube",         // slab
  "dve_simple_stair",             // stair
  "dve_simple_thin_panel",        // 3/16 panel
  "dve_simple_crossed_panels",    // X-shaped plant
  "dve_pillar_cube",              // connect-aware pillar texture
  "dve_carpet",                   // 1/16 carpet
];
// Light travels through everything except a full cube. Glass draws with a
// transparent model, plants and panels with shaped ones, so all of them let a
// torch's light (and the open sky) through — which is the difference between a
// lit greenhouse and a sealed box.
export const OPAQUE_MODELS = new Set(["dve_simple_cube", "dve_full_texture_cube"]);
const MODEL_IDS = new Set(BLOCK_MODELS);

// A texture payload must be a small PNG data URL; anything else falls back to
// the block's registry colour.
const isTexture = (value) =>
  typeof value === "string" && value.length < 200_000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value);

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
  // surface at a spawn column of their own.
  // A brand-new account has no saved position, and every such player used to
  // be dropped on the exact same cell: the other player's body then stands
  // inside your own camera, which is what "other players never appear" looks
  // like. New spawns are spread over a ring of columns, chosen by a stable
  // hash of the account, and only accepted where the ground is as flat as the
  // origin's.
  const SPREAD = [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, 2], [2, -2], [-2, -2],
    [5, 0], [-5, 0], [0, 5], [0, -5], [4, 3], [-4, 3], [4, -3], [-4, -3], [7, 0], [-7, 0], [0, 7], [0, -7]];
  const seed = typeof opts.spawnSeed === "string" ? opts.spawnSeed : "";
  let seedHash = 2166136261;
  for (let i = 0; i < seed.length; i++) { seedHash ^= seed.charCodeAt(i); seedHash = Math.imul(seedHash, 16777619); }
  const originEye = surfaceEye(0.5, 0.5);
  let spread = SPREAD[0];
  for (let k = 0; k < SPREAD.length; k++) {
    const c = SPREAD[((seedHash >>> 1) + k) % SPREAD.length];
    if (Math.abs(surfaceEye(0.5 + c[0], 0.5 + c[1]) - originEye) <= 1.2) { spread = c; break; }
  }
  const spawn = opts.spawn || {};
  const spawnX = typeof spawn.x === "number" ? spawn.x : 0.5 + spread[0];
  const spawnZ = typeof spawn.z === "number" ? spawn.z : 0.5 + spread[1];
  const spawnY = typeof spawn.y === "number" ? spawn.y : surfaceEye(spawnX, spawnZ);
  const camera = new FreeCamera("dve-cam", new Vector3(spawnX, spawnY, spawnZ), scene);
  camera.rotation.set(typeof spawn.pitch === "number" ? spawn.pitch : 0.12,
    typeof spawn.yaw === "number" ? spawn.yaw : 0, 0);
  camera.minZ = 0.08;
  camera.inertia = 0;
  camera.angularSensibility = 1e9; // we drive rotation ourselves (lock or drag)

  // Third-person state lives here because `applySettings` runs immediately and
  // has to keep the orbit camera in step (declaring it further down would put
  // it in the temporal dead zone of that first call).
  let selfAvatar = null, selfLook = null, third = false, cam3 = null;
  const applySettings = next => {
    Object.assign(settings, next || {});
    camera.fov = clamp(settings.fov, 0.4, 1.5);
    camera.maxZ = clamp(settings.renderDistance, 40, 4000);
    // The orbit camera reads the same window; a settings change mid-view has to
    // reach it too, not just the eye camera.
    if (cam3) { cam3.fov = camera.fov; cam3.maxZ = camera.maxZ; }
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
    // Water fills cells but is not solid: you walk through it and sink.
    return id !== undefined && id !== null && id !== "air" && id !== "builtin:water";
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

    // Swimming: the cell at the body's middle (waist-ish) decides buoyancy.
    // In water horizontal drive is damped, gravity is quartered with a slow
    // sink cap, and Space is a short upward stroke. No drowning: the sea is
    // still water over a sandy floor that is always within a slow sink.
    const bodyCell = cellAt(Math.floor(camera.position.x), Math.floor(camera.position.y - 0.5), Math.floor(camera.position.z));
    const inWater = bodyCell === "builtin:water";
    if (inWater) { dx *= 0.6; dz *= 0.6; }

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

    if (keys.has("Space") && (grounded || inWater)) { vy = inWater ? 3.2 : JUMP_V; grounded = false; }
    vy = Math.max(inWater ? -2 : -MAX_FALL, vy - (inWater ? GRAVITY * 0.25 : GRAVITY) * dt);
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

  // One voxel + one texture per registered block. The registry snapshot is
  // taken when the view is created; publish a new block, then re-enter the game
  // to see it (vlox textures are compiled at init).
  // "Flat colours" (the default) paints every block its registry colour. With
  // the other setting a block that ships a texture uses it, and a block that
  // names a model gets that shape instead of a cube.
  const textured = opts.settings?.render === "detailed";
  const textureData = [];
  const voxels = [];
  const seen = new Set();
  // Light is a property of the block, not of the picture on it: the registry's
  // `light` value becomes vlox's own light-source tags (so the mesher stops
  // shadowing a lit block's own faces), and light travels through anything that
  // is not an opaque cube — air and blocks that drew with a transparent model.
  const seeThru = new Set(["dve_air"]);
  const emits = new Map(); // voxel id -> light level from the registry
  for (const b of blocks) {
    const vid = voxelIdFor(b.id);
    if (seen.has(vid)) continue;
    seen.add(vid);
    const useTexture = textured && isTexture(b.texture);
    const light = Math.max(0, Math.min(15, Number(b.light) || 0));
    // A block may name a different image for its top and bottom faces; the four
    // sides keep the block's own texture. Grass is why this exists: one image on
    // all six faces put the dirt-and-grass-side picture on the top of every hill.
    const top = textured && isTexture(b.texture_top) ? b.texture_top : null;
    const bottom = textured && isTexture(b.texture_bottom) ? b.texture_bottom : null;
    textureData.push({ id: `tex_${vid}`, base64: useTexture ? b.texture : solidColourTexture(b.colour) });
    if (top) textureData.push({ id: `tex_${vid}_top`, base64: top });
    if (bottom) textureData.push({ id: `tex_${vid}_bottom`, base64: bottom });
    let model = textured && MODEL_IDS.has(b.model) ? b.model : "dve_simple_cube";
    // `dve_full_texture_cube` is the shipped cube that reads six face slots
    // rather than one, so it is the only model that can show the extra images.
    // Only the plain cube is swapped: shaped and transparent blocks keep the
    // model they asked for (and their own culling rules).
    if ((top || bottom) && model === "dve_simple_cube") model = "dve_full_texture_cube";
    // Every texture slot the shipped models might read, filled with this block's
    // images: the models differ in which names they ask for, and unused keys
    // cost nothing.
    const t = `tex_${vid}`;
    const slots = {
      texture: t,
      upTex: top ? `tex_${vid}_top` : t,
      downTex: bottom ? `tex_${vid}_bottom` : t,
      northTex: t, southTex: t, eastTex: t, westTex: t,
      upDownTextures: t, sideTextures: t, topBottomTex: t, sideTex: t,
    };
    voxels.push({
      id: vid,
      name: vid,
      properties: {
        dve_model_data: {
          id: model,
          modSchema: [],
          modRelationSchema: [],
          inputs: { "*": slots },
        },
        // `dve_light_value` is read for its value (0..15) only when
        // `dve_is_light_source` is set; declaring the level for every block is
        // how a player-published lamp block starts emitting the moment it is
        // placed, with nothing else to configure.
        dve_is_light_source: light > 0,
        dve_light_value: light,
      },
    });
    if (light > 0) emits.set(vid, light);
    // Light stops at a full cube — unless the block says it is transparent,
    // which is the Studio's own word for "you can see through this".
    if (b.behaviour === "transparent" || !OPAQUE_MODELS.has(model)) seeThru.add(vid);
  }

  // ---- Glow layer ------------------------------------------------------------
  // Nothing glows any more: a bright block is bright because it puts light into
  // the voxel light grid around it (see world.worker.js), and its own faces are
  // drawn by the mesher like any other block. The layer stays for beacon beams,
  // which are a column of light rather than a block.
  // vlox renders every voxel section in Babylon rendering group 1 and Babylon
  // clears the depth buffer between groups — anything we draw must be in that
  // group or voxels behind it will paint over it.
  const VOXEL_GROUP = 1;
  const glowLayer = new GlowLayer("glow", scene, { mainTextureSamples: 2 });

  // ---- Beacon beams --------------------------------------------------------
  // A scripted block (today: the beacon) can ask for a column of light that
  // runs from its own cell to the top of the world. The object owns who has a
  // beam and in what colour; the client just draws what it is told, so a beam
  // cannot be conjured locally. One translucent emissive box per source cell,
  // in the bloom layer for the halo.
  const beams = new Map();               // "x,y,z" -> Mesh
  const setBeam = (x, y, z, colour) => {
    const key = `${x},${y},${z}`;
    const old = beams.get(key);
    const hex = typeof colour === "string" && /^#[0-9a-f]{6}$/i.test(colour) ? colour : null;
    if (!hex) {
      if (old) {
        try { glowLayer.removeIncludedOnlyMesh(old); } catch { /* already gone */ }
        old.dispose(false, true);
        beams.delete(key);
      }
      return;
    }
    let m = old;
    if (!m) {
      const height = Math.max(1, SLAB.Y1 - y);
      m = MeshBuilder.CreateBox("beam", { width: 0.5, depth: 0.5, height }, scene);
      m.position.set(x + 0.5, y + height / 2, z + 0.5);
      m.renderingGroupId = VOXEL_GROUP;
      const mat = new StandardMaterial("beam-mat", scene);
      mat.emissiveColor = Color3.FromHexString(hex);
      mat.diffuseColor = Color3.Black();
      mat.disableLighting = true;
      mat.alpha = 0.4;
      m.material = mat;
      glowLayer.addIncludedOnlyMesh(m);
      beams.set(key, m);
    } else {
      m.material.emissiveColor = Color3.FromHexString(hex);
    }
  };

  const renderer = await InitDVEBRClassic({
    textureTypes: [],
    substances: [],
    scene,
    textureData,
  });

  // The generator worker fetches initial edits from the API; threadcomm owns
  // postMessage, so hand it the API base through the worker URL fragment. The
  // world id rides along for the same reason: /api/world answers for a world,
  // and a page joined to a private or staging world must replay THAT world's
  // edits, never the global one's.
  const workerURL = name => {
    const url = new URL(`./${name}`, import.meta.url);
    url.search = `h=${DVE_REV[name]}`;
    url.hash = encodeURIComponent(`${apiBase}\u0000${opts.serverId || "global"}`);
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
    // Light is real here: the world thread fills each section's voxel light
    // grid (sky from the open ceiling, block light from every emitting block),
    // and the mesher packs that grid into every face.
    mesher: { doSunLight: true },
  });

  // StartRenderer registered every published block, so the palette is final
  // from here on. Repair the encode for the names vlox's thread sync left
  // unencoded before any thread paints or meshes one, and before the pick
  // raycast starts decoding cells on this thread.
  healVoxelTags();

  // The world thread owns the voxel data, so it owns the light: hand it the two
  // per-block facts it cannot read from the raw ids — how much light a block
  // gives off, and whether light passes through it.
  DVER.threads.world.runTask("light-tables", [...seen].map(vid => [vid, emits.get(vid) || 0, seeThru.has(vid) ? 1 : 0]));

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
  // The phase is the world's, not the browser's. Until the server sends a clock
  // (`time` frame, or the reading taken at join) every client reads the same
  // phase off its own wall clock, which needs zero sync traffic. Once the
  // server has one, the phase is wherever the admin left it, advanced by the
  // same DAY_MS period — and never advanced at all when the cycle is stopped.
  let clockPhase = null, clockEpoch = 0, clockRunning = true;
  const dayT = () => {
    const now = Date.now();
    if (clockPhase === null) return (now % DAY_MS) / DAY_MS;
    if (!clockRunning) return clockPhase;
    const t = (clockPhase + (now - clockEpoch) / DAY_MS) % 1;
    return t < 0 ? t + 1 : t;
  };

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
  // The parts every body in the world is made of: legs, torso, a head hanging
  // off a pivot (so it can tilt to match the sender's pitch), eyes, a held-item
  // cube and a name card. `withLabel:false` skips the card - your own body in
  // third person has no card to read.
  const buildAvatar = (name, withLabel) => {
    const root = new Mesh("player", scene);
    root.renderingGroupId = VOXEL_GROUP;
    const parts = [];
    const part = (w, h, d, y, key, x = 0, z = 0, parent = root) => {
      const m = MeshBuilder.CreateBox("part", { width: w, height: h, depth: d }, scene);
      m.position.set(x, y, z);
      m.parent = parent;
      m.renderingGroupId = VOXEL_GROUP;
      const mat = new StandardMaterial("part-mat", scene);
      m.material = mat;
      parts.push({ mat, key });
      return m;
    };
    part(0.5, 0.9, 0.3, 0.45, "accent_colour");   // legs
    part(0.6, 0.55, 0.35, 1.22, "body_colour");   // body
    // The head (and the eyes on it) hangs off a pivot so the avatar can tilt
    // its head to match the sender's pitch, the way the local camera does.
    const head = new TransformNode("head", scene);
    head.parent = root;
    head.position.set(0, 1.67, 0);
    part(0.4, 0.35, 0.35, 0, "head_colour", 0, 0, head);
    // Eyes sit on the +Z face of the head (rotation.y = the sender's camera
    // yaw, so yaw 0 faces +Z). They are the facing cue for other players and
    // the fourth customisable colour.
    part(0.11, 0.1, 0.06, 0.05, "eye_colour", 0.1, 0.19, head);
    part(0.11, 0.1, 0.06, 0.05, "eye_colour", -0.1, 0.19, head);
    // The held item: a small cube in the item's own colour, gripped at the
    // side of the body. Null until a pose frame says what is in hand. Its key
    // is null because its colour comes from pose frames, not the appearance.
    const held = part(0.3, 0.3, 0.3, 1.02, null, 0.48, 0.22);
    held.setEnabled(false);
    let label = null;
    if (withLabel) {
      label = MeshBuilder.CreatePlane("name", { width: Math.min(2.2, 0.25 + String(name).length * 0.13), height: 0.34 }, scene);
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
    }
    return { root, parts, head, held, label };
  };
  const ensureRemote = (name, appearance) => {
    let r = remotes.get(name);
    if (r) return r;
    r = {
      ...buildAvatar(name, true),
      look: null, lit: [], pitch: 0, heldColour: null, heldIcon: null, heldWas: null,
      rx: NaN, ry: 0, target: null, last: 0, vx: 0, vy: 0, vz: 0,
      hitAt: 0, flashWas: -1, down: false,
    };
    remotes.set(name, r);
    applyLook(r, appearance);
    return r;
  };
  const applyLook = (r, appearance) => {
    const look = JSON.stringify(lookOf(appearance));
    if (r.look === look) return;
    r.look = look;
    const parsed = JSON.parse(look);
    r.lit = [];
    for (const { mat, key } of r.parts) {
      if (!key) continue;                 // the held cube is coloured per pose
      const col = Color3.FromHexString(parsed[key]);
      mat.diffuseColor = col;
      // Eyes carry a little more self-illumination so the facing cue survives
      // the night, when diffuse shading is nearly black.
      r.lit.push({ mat, glow: col.scale(key === "eye_colour" ? 0.6 : 0.3) });
    }
    r.flashWas = -1;                      // re-apply the current flash level
  };
  // The cube in a body's hand is whatever its owner selected: the item's own
  // icon when the registry has one, its colour otherwise. Remote bodies take
  // both from pose frames (the app decorates the frame with the icon data-URL
  // from its registry copy); the body you control takes them from
  // setSelfHeld, so third person shows your own body exactly as others see it.
  const heldTextures = new Map();   // icon data-URL -> one shared Texture
  const heldTexture = url => {
    let t = heldTextures.get(url);
    if (!t) {
      t = new Texture(url, scene, false, false);
      t.hasAlpha = true;
      heldTextures.set(url, t);
    }
    return t;
  };
  const ICON_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
  const paintHeld = r => {
    const icon = ICON_URL.test(String(r.heldIcon ?? "")) ? r.heldIcon : null;
    const colour = /^#[0-9a-f]{6}$/i.test(String(r.heldColour ?? "")) ? r.heldColour : null;
    const what = icon || colour;
    if (r.heldWas === what && !!r.held.isEnabled() === !!what) return;
    r.heldWas = what;
    r.held.setEnabled(!!what);
    if (!what) return;
    const mat = r.held.material;
    if (icon) {
      // The icon rides the cube's own faces, alpha and all, self-lit so the
      // item silhouette reads at night as well as day.
      const tex = heldTexture(icon);
      mat.diffuseTexture = tex;
      mat.emissiveTexture = tex;
      mat.opacityTexture = tex;
      mat.disableLighting = true;
      return;
    }
    mat.diffuseTexture = null;
    mat.emissiveTexture = null;
    mat.opacityTexture = null;
    mat.disableLighting = false;
    const col = Color3.FromHexString(colour);
    mat.diffuseColor = col;
    mat.emissiveColor = col.scale(0.35);
  };
  // White hit flash: a body that was just struck burns to white for a moment,
  // for everyone watching, not only on the victim's own screen.
  const WHITE = Color3.White();
  const flashRemote = (r, now) => {
    const f = Math.max(0, 0.6 - (now - r.hitAt) / 450);
    if (r.flashWas === f) return;
    r.flashWas = f;
    for (const { mat, glow } of r.lit) mat.emissiveColor = Color3.Lerp(glow, WHITE, f);
  };
  const advanceRemotes = () => {
    const now = Date.now();
    const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
    for (const [name, r] of remotes) {
      // Stale: player left or went silent. The server's own staleness window
      // is 100 s, sized for a hidden, timer-throttled tab (Chrome wakes it
      // once a minute); the client must not prune a remote the server still
      // considers present, or the avatar flickers back every wake-up.
      if (now - r.last > 150_000) {
        r.root.dispose(false, true);
        remotes.delete(name);
        continue;
      }
      // Head tilt, held item, hit flash and the death pose all come straight
      // off the pose frame, so they stay right even when the body is not
      // moving (a player who stands still and looks around still reads right).
      r.head.rotation.x = r.pitch;
      r.root.rotation.x = r.down ? -1.4 : 0;
      paintHeld(r);
      flashRemote(r, now);
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

  // ---- your own body, and the third-person camera in front of it ----------
  // First person never draws the player you control (there is nothing to see).
  // Third person needs a body to look at, so the same parts as a remote avatar
  // are built here and pinned to the physics camera every frame. The rule that
  // keeps this safe: `camera.position` is the authoritative body - the avatar
  // is a shadow of it, never the other way round - and the orbit camera is a
  // *second* camera that only replaces `scene.activeCamera`. All physics, all
  // picking and every pose frame keep reading the first-person camera, so
  // switching views cannot move or desync the player.
  const THIRD_DIST = 3.4;
  const selfRecord = () => {
    if (selfAvatar) return selfAvatar;
    selfAvatar = { ...buildAvatar("", false), look: null, lit: [], flashWas: -1, heldColour: null, heldIcon: null, heldWas: null };
    // The colours may have been set long before this body existed (the app
    // paints your body as soon as the view is ready); carry them over.
    if (selfLook) applyLook(selfAvatar, selfLook);
    selfAvatar.root.setEnabled(false);
    return selfAvatar;
  };
  const setThirdPerson = on => {
    third = !!on;
    selfRecord().root.setEnabled(third);
    if (third) {
      if (!cam3) {
        cam3 = new FreeCamera("dve-cam3", camera.position.clone(), scene);
        cam3.inertia = 0;
        cam3.angularSensibility = 1e9;   // rotation is driven here, like the eye camera
        cam3.minZ = 0.08;
      }
      cam3.fov = camera.fov;
      cam3.maxZ = camera.maxZ;
      scene.activeCamera = cam3;
    } else if (scene.activeCamera !== camera) {
      scene.activeCamera = camera;
    }
    return third;
  };
  const advanceSelf = () => {
    if (!third) return;
    const a = selfAvatar, p = camera.position;
    a.root.position.set(p.x, p.y - EYE, p.z);   // root is at the feet; the eye is EYE above them
    a.root.rotation.y = yaw;
    a.head.rotation.x = pitch;
    paintHeld(a);
    // Orbit behind the shoulders along the look direction, pulled in when a
    // wall would stand between the body and the eye (otherwise the body
    // disappears behind the wall and the view reads as broken).
    const cp = Math.cos(pitch);
    const ox = -Math.sin(yaw) * cp, oy = Math.sin(pitch), oz = -Math.cos(yaw) * cp;
    const fx = p.x, fy = p.y - 0.35, fz = p.z;
    let d = THIRD_DIST;
    try {
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * THIRD_DIST;
        if (solidVoxel(Math.round(fx + ox * t), Math.round(fy + oy * t), Math.round(fz + oz * t))) {
          d = Math.max(0.7, ((i - 1) / steps) * THIRD_DIST);
          break;
        }
      }
    } catch { d = THIRD_DIST; }
    cam3.position.set(fx + ox * d, fy + oy * d, fz + oz * d);
    cam3.rotation.set(pitch, yaw, 0);
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
      // Recent hit: the body burns to white for a moment, the same language as
      // a player's avatar, so an attack reads without a health bar.
      const flash = Math.max(0, 0.6 - (now - m.hitAt) / 450);
      if (m.flashWas !== flash) {
        m.flashWas = flash;
        for (const child of m.root.getChildren()) {
          if (child.material && child.name === "mob-part")
            child.material.emissiveColor = Color3.Lerp(child.material.diffuseColor.scale(0.22), WHITE, flash);
        }
      }
    }
  };

  const frame = () => {
    tick();
    applyDayNight();
    advanceRemotes();
    advanceSelf();
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
    aim: (y, p) => { yaw = y; pitch = clamp(p, -1.52, 1.52); camera.rotation.y = yaw; camera.rotation.x = pitch; },
    // What the compiled geometry record for a voxel says each face wears.
    dbgVoxel: (name) => {
      const V = VoxelLUT, G = GeometryLUT;
      let id;
      try { id = V.voxelIds.getNumberId(name); } catch { return ["lookup-threw", String(name)]; }
      if (id === undefined || id === null) return ["no-voxel", (V.voxelIds._palette || []).filter(k => String(k).includes(String(name).slice(0, 6))).slice(0, 12)];
      const gidx = V.geometryIndex[id];
      return [[id, gidx, V.models._palette[V.modelsIndex[id]], V.totalStates && V.totalStates[id],
        G.compiledGeometry[gidx] && G.compiledGeometry[gidx].length,
        G.geometryInputs[gidx], G.geometryInputs[G.geometryInputsIndex[gidx]]]];
    },
    dbgTexIds: () => textureData.map(t => t.id).slice(0, 40) };

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
      const painted = await DVER.threads.world.runTaskAsync("paint-direct", [[0, x, y, z], raw, id]);
      // The world thread re-lights the touched sections as part of the same
      // edit (the lamp that starts emitting, the wall that starts blocking).
      // Keep the generator's edit map current, so cells that activate AFTER
      // this edit still generate the edited block (far-cell streaming).
      try {
        const gen = DVER.threads.generators.getThreads()[0];
        if (gen) gen.runTaskAsync("note-edit", { x, y, z, block_id: blockId });
      } catch { /* generator restart will re-fetch from the API anyway */ }
      // "ok" / "fail" from the world thread: the worker reads the cell back, so
      // "fail" means the voxel really is not in the client's world.
      return painted;
    },

    /**
     * Re-read the authoritative edit snapshot inside the generator thread.
     * Called after a world resync: chunks that activate later must be built
     * from the same truth the loaded chunks were rebuilt from.
     */
    reloadGeneratorEdits() {
      try {
        const gen = DVER.threads.generators.getThreads()[0];
        if (gen) gen.runTaskAsync("reload-edits");
      } catch { /* a generator restart re-fetches from the API anyway */ }
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
     * Place or update a remote player's avatar from a presence pose frame
     * `{name,x,y,z,yaw,pitch,held,appearance,vx,vy,vz}`. vx/vy/vz (optional,
     * blocks/sec) let advanceRemotes dead-reckon the avatar along its velocity
     * between pose frames; `pitch` tilts the head and `held` (a #rrggbb) is the
     * item in their hand.
     */
    setRemote(frame) {
      const name = String(frame.name ?? "");
      if (!name) return;
      const r = ensureRemote(name, frame.appearance);
      applyLook(r, frame.appearance);
      const num = v => (typeof v === "number" && Number.isFinite(v) ? v : 0);
      r.target = { x: num(frame.x), y: num(frame.y), z: num(frame.z), yaw: num(frame.yaw) };
      r.pitch = clamp(num(frame.pitch), -1.6, 1.6);
      r.heldColour = /^#[0-9a-f]{6}$/i.test(String(frame.held ?? "")) ? frame.held : null;
      // The app decorates pose frames with the held item's icon data-URL
      // (resolved from its own registry copy); the view never fetches.
      r.heldIcon = /^data:image\//.test(String(frame.heldIcon ?? "")) ? String(frame.heldIcon) : null;
      const vel = v => (typeof v === "number" && Number.isFinite(v) ? clamp(v, -30, 30) : 0);
      r.vx = vel(frame.vx); r.vy = vel(frame.vy); r.vz = vel(frame.vz);
      r.last = Date.now();
    },
    /** Start a white hit flash on a remote avatar (the object says it was hit). */
    flashPlayer(name) {
      const r = remotes.get(String(name ?? ""));
      if (r) r.hitAt = Date.now();
    },
    /** A dead player's avatar lies down instead of standing there upright. */
    setDown(name, down) {
      const r = remotes.get(String(name ?? ""));
      if (r) r.down = !!down;
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

    /**
     * The other player the crosshair is over, within melee reach (or null).
     * Same ray/AABB test as pickMob; the object is the authority on whether the
     * swing lands, so this only decides who the client meant to hit.
     */
    pickPlayer() {
      const dir = camera.getForwardRay().direction;
      const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
      let best = null, bestT = 6;
      for (const [name, r] of remotes) {
        if (r.down) continue;                     // a body on the ground is not a target
        const p = r.root.position;
        const minX = p.x - 0.35, maxX = p.x + 0.35;
        const minY = p.y, maxY = p.y + 1.95;
        const minZ = p.z - 0.35, maxZ = p.z + 0.35;
        let t0 = 0, t1 = bestT;
        let ok = true;
        for (const [o, d, lo, hi] of [[ox, dir.x, minX, maxX], [oy, dir.y, minY, maxY], [oz, dir.z, minZ, maxZ]]) {
          if (Math.abs(d) < 1e-8) { if (o < lo || o > hi) { ok = false; break; } continue; }
          let a = (lo - o) / d, b = (hi - o) / d;
          if (a > b) { const s = a; a = b; b = s; }
          t0 = Math.max(t0, a); t1 = Math.min(t1, b);
          if (t0 > t1) { ok = false; break; }
        }
        if (ok && t0 >= 0 && t0 < bestT) { bestT = t0; best = { name, distance: t0 }; }
      }
      return best;
    },

    /** Start a white hit flash on a mob body (the object says it was hit). */
    flashMob(id) {
      const m = mobs.get(String(id ?? ""));
      if (m) m.hitAt = Date.now();
    },

    /** A scripted block's light column. `colour` is #rrggbb, or null to remove. */
    setBeam(x, y, z, colour) { setBeam(x, y, z, colour); },

    /** Every column this engine is drawing right now, as [x,y,z]. Asked when a
     *  resync needs to know what to clear — the caller's own list of beams can
     *  itself be out of date, so only the renderer knows what is on screen. */
    beamCells() { return [...beams.keys()].map(k => k.split(",").map(Number)); },

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

    /** Paint the body you control with the Character dialog's colours. */
    setSelfAppearance(appearance) {
      selfLook = appearance;
      applyLook(selfRecord(), appearance);
    },
    /**
     * What the body you control holds: the selected item's icon (a data-URL
     * from the app's registry copy) and colour, the same values other players
     * get in their pose frames. Null for both clears the hand.
     */
    setSelfHeld(colour, icon) {
      const r = selfRecord();
      r.heldColour = /^#[0-9a-f]{6}$/i.test(String(colour ?? "")) ? String(colour) : null;
      r.heldIcon = /^data:image\//.test(String(icon ?? "")) ? String(icon) : null;
    },
    /**
     * The world's clock: `phase` is 0..1 through the day (0 = midnight, 0.5 =
     * noon), or null to fall back on the wall clock; `running` false stops the
     * cycle wherever it stands.
     */
    setClock(phase, running) {
      const p = Number(phase);
      if (phase === null || phase === undefined || !Number.isFinite(p)) clockPhase = null;
      else clockPhase = Math.min(1, Math.max(0, p));
      clockEpoch = Date.now();
      clockRunning = running !== false;
    },
    get clock() {
      return { phase: dayT(), running: clockRunning, set: clockPhase !== null };
    },
    /** Third person (true) shows your own body from behind; returns the state. */
    setThirdPerson(on) {
      return setThirdPerson(on);
    },
    get thirdPerson() { return third; },

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
