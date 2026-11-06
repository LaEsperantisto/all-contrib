// Generator thread: paints the deterministic terrain mirror plus the player
// edits fetched from the world API. Coordinates: x3d = x2d, y3d = Y1-1-y2d,
// z3d in [0, DEPTH). Sectors outside the slab stay empty.
import { StartGenerator } from "@divinevoxel/vlox/Init/StartGenerator";
import { WorldGeneration } from "@divinevoxel/vlox/Tasks/WorldGeneration/WorldGeneration";
import { WorldSpaces } from "@divinevoxel/vlox/World/WorldSpaces";
import { Threads } from "@amodx/threads";
import { SLAB, baseBlock, y2d, voxelIdFor } from "./world.js";

// Diagnostics: count engine pipeline tasks on this thread, capture throws.
const gcounts = {};
const gerrs = [];
self.addEventListener("error", e => gerrs.push("worker-error: " + (e.message || "unknown")));
self.addEventListener("unhandledrejection", e => gerrs.push("rejection: " + String(e.reason && e.reason.message || e.reason)));
// Missed binary task ids (dropped dispatches): patch the lookup map.
import { InternalTasks } from "@amodx/threads/Internal/InternalTasks.js";
const misses = [];
const _tmGet = InternalTasks._taskMap.get.bind(InternalTasks._taskMap);
InternalTasks._taskMap.get = k => {
  const v = _tmGet(k);
  if (!v && misses.length < 30) misses.push(InternalTasks._taskRecord.get(k) || k);
  return v;
};
const wrapB = Threads.registerBinaryTask.bind(Threads);
const wrapT = Threads.registerTask.bind(Threads);
const counted = (name, cb) => (...a) => {
  gcounts[name] = (gcounts[name] || 0) + 1;
  try { return cb(...a); }
  catch (e) { gerrs.push(`${name}: ${e && e.message || e}`); throw e; }
};
Threads.registerBinaryTask = (name, cb) => wrapB(typeof name == "string" ? { id: name } : name, counted(name && name.id ? name.id : name, cb));
Threads.registerTask = (name, cb) => wrapT(name, counted(name, cb));

// API base is passed as the worker URL fragment (threadcomm owns postMessage,
// so don't send our config through it).
const API_BASE = decodeURIComponent(location.hash.slice(1));

class ACWorldGen {
  static instance;
  edits = null;

  constructor() {
    if (ACWorldGen.instance) return ACWorldGen.instance;
    ACWorldGen.instance = this;
  }

  init() {
    this.brush = WorldGeneration.getBrush();
  }

  async loadEdits() {
    this.edits = new Map();
    try {
      const url = `${API_BASE}/api/world?x0=${SLAB.X0}&y0=${SLAB.Y0}&x1=${SLAB.X1 - 1}&y1=${SLAB.Y1 - 1}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      for (const edit of data.edits) {
        if (edit.block_id !== "air") this.edits.set(`${edit.x},${edit.y}`, edit.block_id);
      }
    } catch {
      // Offline API: render base terrain only. Live WS edits still arrive.
    }
  }

  async generate(dimension, sx, sy, sz) {
    if (!this.edits) await this.loadEdits();
    const b = WorldSpaces.sector.bounds;
    const xLo = Math.max(sx, SLAB.X0), xHi = Math.min(sx + b.x, SLAB.X1);
    const zLo = Math.max(sz, 0), zHi = Math.min(sz + b.z, SLAB.DEPTH);
    const yLo = Math.max(sy, 0), yHi = Math.min(sy + b.y, SLAB.Y1);
    if (xHi <= xLo || zHi <= zLo || yHi <= yLo) return;
    const brush = this.brush;
    for (let y3 = yLo; y3 < yHi; y3++) {
      const y = y2d(y3);
      for (let x = xLo; x < xHi; x++) {
        const id = this.edits.get(`${x},${y}`) ?? baseBlock(x, y);
        if (id === "air") continue;
        const voxel = voxelIdFor(id);
        for (let z = zLo; z < zHi; z++) brush.setId(voxel).setXYZ(x, y3, z).paint();
      }
    }
  }

  async decorate() {}
}

const gen = new ACWorldGen();
WorldGeneration.setWorldGen(gen);
gen.init();
await StartGenerator({});

Threads.registerTask("gen-stats", () => {
  const binKeys = [];
  const seen = [];
  for (const [name, c] of Object.entries(gcounts)) {
    binKeys.push(name);
  }
  try {
    // @amodx/threads internals probe: which binary task ids can this thread run?
    const t = Threads.thread || Threads.self || null;
    return [[gcounts, gerrs.slice(0, 8), binKeys, misses]];
  } catch {
    return [[gcounts, gerrs.slice(0, 8), binKeys, misses]];
  }
});
