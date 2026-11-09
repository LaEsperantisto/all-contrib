// Generator thread: paints the deterministic 3D terrain mirror plus the
// player edits fetched from the world API. Coordinates are 1:1 with the
// server (x, y-up, z). Sectors outside the world stay empty.
import { StartGenerator } from "@divinevoxel/vlox/Init/StartGenerator";
import { WorldGeneration } from "@divinevoxel/vlox/Tasks/WorldGeneration/WorldGeneration";
import { WorldSpaces } from "@divinevoxel/vlox/World/WorldSpaces";
import { Threads } from "@amodx/threads";
import { SLAB, baseBlock, voxelIdFor } from "./world.js";
import { healVoxelTags, installLUTSync } from "./lut-repair.js";

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
// so don't send our config through it). The fragment is `apiBase \0 worldId`:
// the region fetch must replay the joined world's edits, not the global one's.
const [API_BASE, WORLD_ID] = decodeURIComponent(location.hash.slice(1)).split("\u0000");

class ACWorldGen {
  static instance;
  edits = null;
  pendingNotes = [];

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
      const url = `${API_BASE}/api/world?x0=${SLAB.X0}&y0=${SLAB.Y0}&z0=${SLAB.Z0}&x1=${SLAB.X1 - 1}&y1=${SLAB.Y1 - 1}&z1=${SLAB.Z1 - 1}&server=${encodeURIComponent(WORLD_ID || "global")}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      for (const edit of data.edits) {
        // 'air' edits (mined blocks) must override the base terrain too —
        // dropping them re-rendered pre-join digs as solid.
        this.edits.set(`${edit.x},${edit.y},${edit.z}`, edit.block_id);
      }
    } catch {
      // Offline API: render base terrain only. Live WS edits still arrive.
    }
    // WS echoes that raced ahead of this fetch: replay them over the snapshot.
    for (const n of this.pendingNotes) this.edits.set(`${n.x},${n.y},${n.z}`, n.block_id);
    this.pendingNotes.length = 0;
  }

  async generate(dimension, sx, sy, sz) {
    if (!this.edits) await this.loadEdits();
    const b = WorldSpaces.sector.bounds;
    const xLo = Math.max(sx, SLAB.X0), xHi = Math.min(sx + b.x, SLAB.X1);
    const zLo = Math.max(sz, SLAB.Z0), zHi = Math.min(sz + b.z, SLAB.Z1);
    const yLo = Math.max(sy, SLAB.Y0), yHi = Math.min(sy + b.y, SLAB.Y1);
    if (xHi <= xLo || zHi <= zLo || yHi <= yLo) return;
    const brush = this.brush;
    for (let x = xLo; x < xHi; x++) {
      for (let z = zLo; z < zHi; z++) {
        for (let y = yLo; y < yHi; y++) {
          const id = this.edits.get(`${x},${y},${z}`) ?? baseBlock(x, y, z);
          if (id === "air") continue;
          brush.setId(voxelIdFor(id)).setXYZ(x, y, z).paint();
        }
      }
    }
  }

  async decorate() {}
}

const gen = new ACWorldGen();
WorldGeneration.setWorldGen(gen);
gen.init();
installLUTSync(e => { if (gerrs.length < 8) gerrs.push("shift:" + String(e.message).slice(0, 90)); });

await StartGenerator({});

// The terrain mirror paints published blocks (server edits replayed into the
// generator's world), and an unencoded palette id writes air silently here just
// as it does in the world thread. installLUTSync aligns this thread to main's
// ids when the payload lands; the interval catches late publishes.
setInterval(() => { try { healVoxelTags(); } catch { /* mid-transfer */ } }, 2000);

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

// Keep the generator's edit mirror current with the live world: cells that
// generate AFTER an edit (far cells streamed in later) must see it too.
Threads.registerTask("note-edit", (d) => {
  const g = ACWorldGen.instance;
  if (!g.edits) { g.pendingNotes.push(d); return [true]; }
  g.edits.set(`${d.x},${d.y},${d.z}`, d.block_id);
  return [true];
});

// The admin re-ran the edit table: throw this mirror away and re-read it, so
// cells that stream in later are built from the same snapshot the loaded chunks
// were just rebuilt from. Notes that land mid-fetch are replayed by loadEdits.
Threads.registerTask("reload-edits", async () => {
  const g = ACWorldGen.instance;
  await g.loadEdits();
  return [g.edits ? g.edits.size : 0];
});
