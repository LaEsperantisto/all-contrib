// Main-thread glue: Babylon scene + vlox renderer wired to the All Contribute
// server world. Loaded dynamically by app.js (./dve/dist/dve-view.js) when the
// player opens the 3D view; the app owns placement/breaking through the API,
// this module only paints/erases voxels from server-authoritative edits.
import { Engine, Scene, ArcRotateCamera, Vector3 } from "@babylonjs/core";
import InitDVEBRClassic from "@divinevoxel/vlox-babylon/Init/Classic/InitDVEBRClassic";
import { StartRenderer } from "@divinevoxel/vlox/Init/StartRenderer";
import { VoxelBuildSpace } from "@divinevoxel/vlox/Builder/VoxelBuildSpace";
import { PaintVoxelData } from "@divinevoxel/vlox/Voxels";
import { SLAB, y3d, y2d, voxelIdFor } from "./world.js";
// Re-exported so app.js can map 3D picks back to 2D grid coords.
export { SLAB, y3d, y2d };

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

export async function createDVEView(canvas, blocks, apiBase) {
  const engine = new Engine(canvas, true, { stencil: false, preserveDrawingBuffer: false });
  const scene = new Scene(engine);

  const camera = new ArcRotateCamera(
    "dve-cam",
    -Math.PI / 2,
    1.05,
    78,
    new Vector3(0, y3d(12), SLAB.DEPTH / 2),
    scene
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 10;
  camera.upperRadiusLimit = 260;
  camera.useAutoRotationBehavior = false;

  // One voxel + one solid-colour texture per registered block. The registry
  // snapshot is taken when the view opens; publish a new block, then re-open
  // the 3D view to see it (vlox textures are compiled at init).
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

  engine.runRenderLoop(() => scene.render());
  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);
  // Diagnostics/testing handle (pixel reads, mesh counts in headless checks).
  window.__dve = { engine, scene, DVER, buildSpace, counts: __dveCounts, errors: __dveErrors };

  return {
    /** Apply one server-authoritative edit (2D coords) across the slab depth. */
    async applyEdit(x, yGrid, blockId) {
      if (x < SLAB.X0 || x >= SLAB.X1 || yGrid < SLAB.Y0 || yGrid >= SLAB.Y1) return;
      const y = y3d(yGrid);
      const jobs = [];
      for (let z = 0; z < SLAB.DEPTH; z++) {
        jobs.push(
          blockId === "air"
            ? buildSpace.eraseVoxel([x, y, z])
            : buildSpace.paintVoxel([x, y, z], PaintVoxelData.Create({ id: voxelIdFor(blockId) }))
        );
      }
      await Promise.all(jobs);
    },

    /**
     * Cast a ray from a screen point into the voxel world.
     * Returns { position, normalPosition } in 3D coords, or null.
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

    dispose() {
      window.__dve = null;
      window.removeEventListener("resize", onResize);
      engine.stopRenderLoop();
      for (const w of [worldWorker, ...mesherWorkers, ...generatorWorkers]) w.terminate();
      scene.dispose();
      engine.dispose();
    },
  };
}
