// Main-thread glue: Babylon scene + vlox renderer wired to the All Contribute
// server world. Loaded dynamically by app.js (./dve/dist/dve-view.js) when the
// player enters the 3D game; the app owns placement/breaking through the API,
// this module paints/erases voxels from server-authoritative edits and drives
// the first-person camera (look + WASD + gravity/jump), nothing else.
import { Engine, Scene, FreeCamera, Vector3, Color4 } from "@babylonjs/core";
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
  const camera = new FreeCamera("dve-cam", new Vector3(0.5, surfaceEye(0.5, 0.5), 0.5), scene);
  camera.rotation.set(0.12, 0, 0);
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
    if (!locked && canvas.requestPointerLock) {
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
    const speed = settings.speed * (keys.has("ControlLeft") || keys.has("ControlRight") ? 2 : 1);
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

    if (keys.has("Space") && grounded) { vy = JUMP_V; grounded = false; }
    vy = Math.max(-MAX_FALL, vy - GRAVITY * dt);
    let ny = camera.position.y + vy * dt;
    if (bodyBlocked(camera.position.x, ny - EYE, camera.position.z)) {
      if (vy <= 0) {
        ny = Math.floor(ny - EYE) + 1 + EYE; // land: feet on the block top
        vy = 0;
      } else {
        vy = 0; // head bump: undo the step
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
  const frame = () => {
    tick();
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

  return {
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

    /** Release input grabs when leaving the game screen. */
    releaseInput() {
      keys.clear();
      dragging = false;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },

    /** Re-fit the engine after the game overlay is un-hidden. */
    resize() {
      engine.resize();
    },

    /** Live camera state for the HUD. */
    get pose() {
      const p = camera.position;
      return { x: p.x, y: p.y, z: p.z, yaw, pitch, surfaceY: surfaceEye(p.x, p.z) };
    },
  };
}
