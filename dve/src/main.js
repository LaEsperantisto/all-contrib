// Main-thread glue: Babylon scene + vlox renderer wired to the All Contribute
// server world. Loaded dynamically by app.js (./dve/dist/dve-view.js) when the
// player enters the 3D game; the app owns placement/breaking through the API,
// this module paints/erases voxels from server-authoritative edits and drives
// the first-person camera (look + WASD + walk/fly), nothing else.
import { Engine, Scene, FreeCamera, Vector3, Color4 } from "@babylonjs/core";
import InitDVEBRClassic from "@divinevoxel/vlox-babylon/Init/Classic/InitDVEBRClassic";
import { StartRenderer } from "@divinevoxel/vlox/Init/StartRenderer";
import { VoxelBuildSpace } from "@divinevoxel/vlox/Builder/VoxelBuildSpace";
import { PaintVoxelData } from "@divinevoxel/vlox/Voxels";
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
  // opts.settings: { sensitivity, fov, renderDistance, speed, flySpeed, cameraMode }
  // opts.cellAt:   (x, y, z) => blockId | "air" — live server-authoritative
  //                state, used by walk mode to find the surface under the
  //                player. y grows upward, matching the server world.
  const settings = {
    sensitivity: SENS_DEFAULT,
    fov: 0.95,
    renderDistance: 900,
    speed: 7.5,
    flySpeed: 16,
    cameraMode: "walk",
    ...(opts.settings || {}),
  };
  const cellAt = opts.cellAt || ((x, y, z) => baseBlock(x, y, z));

  const engine = new Engine(canvas, true, { stencil: false, preserveDrawingBuffer: false });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.075, 0.095, 0.135, 1);

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

  // ---- input: pointer lock (preferred) or drag-look fallback, WASD + fly ----
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
  const tick = () => {
    const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
    camera.rotation.y = yaw; camera.rotation.x = pitch;
    const fly = settings.cameraMode === "fly";
    const speed = (fly ? settings.flySpeed : settings.speed) * (keys.has("ControlLeft") || keys.has("ControlRight") ? 2 : 1);
    let mx = 0, mz = 0, my = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) mz += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) mz -= 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
    if (mz) { camera.position.x += Math.sin(yaw) * mz * speed * dt; camera.position.z += Math.cos(yaw) * mz * speed * dt; }
    if (mx) { camera.position.x += Math.cos(yaw) * mx * speed * dt; camera.position.z += -Math.sin(yaw) * mx * speed * dt; }
    if (fly) {
      if (keys.has("Space")) my += 1;
      if (keys.has("ShiftLeft") || keys.has("ShiftRight")) my -= 1;
      camera.position.y += my * settings.flySpeed * dt;
      camera.position.y = clamp(camera.position.y, 0.4, SLAB.Y1 + 12);
    } else {
      camera.position.y = surfaceEye(camera.position.x, camera.position.z);
    }
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

  engine.runRenderLoop(() => { tick(); scene.render(); });
  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);
  // Diagnostics/testing handle (pixel reads, mesh counts, camera in checks).
  window.__dve = { engine, scene, camera, DVER, buildSpace, counts: __dveCounts, errors: __dveErrors };

  return {
    /** Apply one server-authoritative edit to a single voxel. */
    async applyEdit(x, y, z, blockId) {
      if (x < SLAB.X0 || x >= SLAB.X1 || y < SLAB.Y0 || y >= SLAB.Y1 || z < SLAB.Z0 || z >= SLAB.Z1) return;
      await (blockId === "air"
        ? buildSpace.eraseVoxel([x, y, z])
        : buildSpace.paintVoxel([x, y, z], PaintVoxelData.Create({ id: voxelIdFor(blockId) })));
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

    /** Update live settings (sensitivity/fov/render distance/speed/mode). */
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
