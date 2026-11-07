// World thread: runs the vlox world simulation for the procedural world
// (256x32x256 walkable field, see world.js). The world is far larger than
// the generator radius budget, so the generator focus follows the player:
// main.js posts "move-generator" whenever the player crosses a 16-block
// cell, and vlox re-rings active sectors — chunks stream in ahead and are
// dropped behind.
import { StartWorld } from "@divinevoxel/vlox/Init/StartWorld";
import { WorldSimulation } from "@divinevoxel/vlox/WorldSimulation";
import { TickInterval } from "@divinevoxel/vlox/Util/TickInterval";
import { Threads } from "@amodx/threads";
import { VoxelBuildSpaceWorld } from "@divinevoxel/vlox/Builder/World/VoxelBuildSpaceWorld";
import { WorldSpaces } from "@divinevoxel/vlox/World/WorldSpaces";
import { WorldRegister } from "@divinevoxel/vlox/World/WorldRegister";
import { Sector } from "@divinevoxel/vlox/World/Sector";
import { WorldSimulationTasks } from "@divinevoxel/vlox/WorldSimulation/Internal/WorldSimulationTasks.js";
import { SnapShots } from "@divinevoxel/vlox/World/SnapShot/SnapShots";
import { VoxelLUT } from "@divinevoxel/vlox/Voxels/Data/VoxelLUT";
import { VoxelTagsRegister } from "@divinevoxel/vlox/Voxels/Data/VoxelTagsRegister";

// vlox's sync-data payload carries LUTs + properties for all published
// voxels but BuildTagData can skip custom entries, leaving VoxelTags sparse
// (indices 0..9 only). Brush.paint then reads VoxelTags[id] -> undefined and
// throws, wedging paint-voxel tasks (locks never released). Rebuild the
// missing entries in-thread from the synced properties + model registry.
import { BuildTagAndPaletteData } from "@divinevoxel/vlox/Voxels/Functions/BuildTagData";
// sync-data's StringPalette.load APPENDS the imported voxel/model palettes
// onto the world thread's own builtin registrations, but every positional
// table (modelsIndex, totalStates, voxelModMaps, VoxelTags, ...) is assigned
// verbatim from the main-side arrays — so data sits at 0..n-1 while the
// matching palette names sit at off..off+n-1. Shift the trueId/model-keyed
// tables by the palette offset so lookups line up.
function shiftLUTToPalette(data) {
  const V = VoxelLUT;
  const srcIds = data && data.luts && data.luts.voxel ? data.luts.voxel.voxelIds : null;
  if (!srcIds || !srcIds.length) return false;
  const pal = V.voxelIds._palette;
  const off = pal.indexOf(srcIds[0]);
  if (off <= 0) return false;
  const already = V.voxelModMaps && V.voxelModMaps[off + srcIds.length - 1] !== undefined && V.voxelModMaps[off] !== undefined;
  if (!already) {
    // Duplicate rather than move: name-keyed lookups resolve to the palette
    // slots (off..off+n-1) while composite-voxel-id decode hits the main-space
    // trueIds (0..n-1). Both must carry the same encoding.
    const shift = arr => {
      if (!arr) return arr;
      const a = new Array(Math.max(arr.length, srcIds.length + off));
      for (let s = 0; s < arr.length; s++) a[s] = arr[s];
      for (let s = 0; s < srcIds.length && s < arr.length; s++) a[s + off] = arr[s];
      return a;
    };
    const shiftTyped = (arr, Ctor) => {
      if (!arr) return arr;
      const a = new Ctor(Math.max(arr.length, srcIds.length + off));
      for (let s = 0; s < arr.length; s++) a[s] = arr[s];
      for (let s = 0; s < srcIds.length && s < arr.length; s++) a[s + off] = arr[s];
      return a;
    };
    V.modelsIndex = shift(V.modelsIndex);
    V.voxelModMaps = shift(V.voxelModMaps);
    V.voxelRelationalModMaps = shift(V.voxelRelationalModMaps);
    V.totalStates = shiftTyped(V.totalStates, Uint16Array);
    V.totalMods = shiftTyped(V.totalMods, Uint16Array);
    V.totalReltionalStates = shiftTyped(V.totalReltionalStates, Uint16Array);
    V.totalReltionalMods = shiftTyped(V.totalReltionalMods, Uint16Array);
    V.voxelRecordStartIndex = shiftTyped(V.voxelRecordStartIndex, Uint16Array);
    VoxelTagsRegister.VoxelTags = shift(VoxelTagsRegister.VoxelTags);
  }
  // Model-keyed maps shift by the models-palette offset; remap modelsIndex.
  const srcModels = data.luts.voxel.models;
  const moff = srcModels && srcModels.length ? V.models._palette.indexOf(srcModels[0]) : 0;
  if (moff > 0) {
    const alreadyM = V.modelStateMaps && V.modelStateMaps[moff + srcModels.length - 1] !== undefined;
    if (!alreadyM) {
      const shift = arr => { const a = new Array(Math.max(arr.length, srcModels.length + moff)); for (let s = 0; s < arr.length; s++) a[s] = arr[s]; for (let s = 0; s < srcModels.length && s < arr.length; s++) a[s + moff] = arr[s]; return a; };
      V.modelStateMaps = shift(V.modelStateMaps);
      V.modelRelationalStateMaps = shift(V.modelRelationalStateMaps);
      for (let i = 0; i < V.modelsIndex.length; i++) if (Number.isFinite(V.modelsIndex[i])) V.modelsIndex[i] += moff;
    }
  }
  return true;
}
function healVoxelTags() {
  const pal = VoxelLUT.voxelIds._palette || [];
  const first = {};
  for (let i = 0; i < pal.length; i++) if (pal[i] && first[pal[i]] === undefined) first[pal[i]] = i;
  let n = 0;
  // Mirror missing LUT entries from the real (imported) slot of the same name.
  // Worker threads pre-register vlox builtin voxel ids (dve_* and defaults)
  // before sync-data's load() appends the imported palette, so imported ids
  // live at an offset; polluted runtime ids sit past both.
  const src = i => (VoxelLUT.voxelIds._palette || []).findIndex(p => p === VoxelLUT.voxelIds._palette[i] && VoxelLUT.voxelModMaps[p] !== undefined && p < i);
  // Palette pollution: threads auto-register duplicate ids past the imported
  // ones (brush/sim string lookups), but the encoding tables only cover the
  // imported prefix. Brush.paint then reads voxelModMaps[i] -> undefined and
  // throws, wedging paint-voxel tasks (locks never released). Duplicate each
  // polluted id's encoding onto its original: same model/state/mod maps and a
  // record entry pointing at the original composite voxel id, so raw bytes
  // stay identical to what generators and the mesher already understand.
  let recExtra = [];
  for (let i = 0; i < pal.length; i++) {
    const name = pal[i];
    if (!name) continue;
    const complete = VoxelLUT.voxelModMaps[i] && VoxelLUT.modelsIndex[i] !== undefined &&
      (VoxelLUT.voxelRecordStartIndex[i] > 0 || (i === 0 && VoxelLUT.voxelRecordStartIndex.length > i)) && VoxelLUT.totalStates[i];
    if (complete) continue;
    const m = first[name];
    if (m === undefined) continue;
    VoxelLUT.voxelModMaps[i] = new Map([[0, 0]]);
    VoxelLUT.voxelRelationalModMaps[i] = new Map([[0, 0]]);
    VoxelLUT.modelsIndex[i] = VoxelLUT.modelsIndex[m];
    if (VoxelLUT.totalStates.length <= i) {
      const grow = (arr, Ctor) => { const a = new Ctor(Math.max(i + 1, arr.length + 8)); a.set(arr); return a; };
      VoxelLUT.totalStates = grow(VoxelLUT.totalStates, Uint16Array);
      VoxelLUT.totalMods = grow(VoxelLUT.totalMods, Uint16Array);
      VoxelLUT.voxelRecordStartIndex = grow(VoxelLUT.voxelRecordStartIndex, Uint32Array);
    }
    VoxelLUT.totalStates[i] = VoxelLUT.totalStates[m];
    VoxelLUT.totalMods[i] = VoxelLUT.totalMods[m];
    if (!(VoxelLUT.voxelRecordStartIndex[i] > 0)) {
      VoxelLUT.voxelRecordStartIndex[i] = VoxelLUT.voxelRecord.length + recExtra.length;
      recExtra.push(VoxelLUT.voxelRecord[VoxelLUT.voxelRecordStartIndex[m]]);
    }
    if (VoxelTagsRegister.VoxelTags[m] && !VoxelTagsRegister.VoxelTags[i])
      VoxelTagsRegister.VoxelTags[i] = VoxelTagsRegister.VoxelTags[m];
    n++;
  }
  if (recExtra.length) {
    const r = new (VoxelLUT.voxelRecord.constructor)(VoxelLUT.voxelRecord.length + recExtra.length);
    r.set(VoxelLUT.voxelRecord);
    r.set(recExtra, VoxelLUT.voxelRecord.length);
    VoxelLUT.voxelRecord = r;
  }
  // Tags fallback for any palette id still missing tags (older payloads).
  const missing = [];
  for (let i = 0; i < pal.length; i++) {
    const id = pal[i];
    if (!id || VoxelTagsRegister.VoxelTags[i]) continue;
    missing.push({ id, name: id, properties: {} });
  }
  if (missing.length) BuildTagAndPaletteData({ voxels: missing, models: [], substances: [], materials: [] });
  return n + missing.length;
}

// Server echo paint path. The stock "paint-voxel" task awaits LockSectors,
// which wedges forever on sectors checkedOut for mesher transfer
// (waitTillCheckedIn never fires for transferred/removed sectors), and the
// brush write itself throws on a detached (checkedOut) sector buffer.
// Painting is synchronous, so it is atomic in this single-threaded worker;
// retry until the sector checks back in (transient window, ~1s).
// The world thread's palette slots 0..9 are null (vlox builtins registered
// locally land at the imported palette's offset), so setRaw cannot decode a
// name from a composite raw. Main sends the palette name alongside.
Threads.registerTask("paint-direct", async ([loc, raw, id]) => {
  let last = "";
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const brush = WorldSimulation.getDimension(0).getBrush();
      brush.setXYZ(loc[1], loc[2], loc[3]);
      brush.setRaw(raw);
      if (id) brush.data.id = id;
      brush.paint({ includedAreas: [] });
      return "ok";
    } catch (e) {
      last = String(e && e.message).slice(0, 90);
      await new Promise(r => setTimeout(r, 250));
    }
  }
  werrs.push("pd-fail @" + loc.join(",") + " raw=" + JSON.stringify(Array.from(raw)) + " " + last);
  return "fail";
});

// Diagnostics: capture worker throws (a throw inside tick() would abort the
// per-tick pipeline iteration silently).
const werrs = [];
self.addEventListener("error", e => { if (werrs.length < 8) werrs.push(String(e.message || e).slice(0, 160)); });
self.addEventListener("unhandledrejection", e => { if (werrs.length < 8) werrs.push("rej:" + String(e.reason && e.reason.message || e.reason).slice(0, 160)); });

// Diagnostics: log every pipeline queue dispatch (task id + sector).
const dispatchLog = [];
const dispatchCounts = {};
for (const key of Object.keys(WorldSimulationTasks)) {
  const t = WorldSimulationTasks[key];
  const tid = t && t.data && t.data.id;
  if (t && typeof t.add === "function" && typeof tid === "string") {
    const orig = t.add.bind(t);
    t.add = (...a) => {
      dispatchCounts[tid] = (dispatchCounts[tid] || 0) + 1;
      if (dispatchLog.length < 200) dispatchLog.push([tid, JSON.stringify(a.slice(1, 4))]);
      return orig(...a);
    };
  }
}
Threads.registerTask("dispatch-stats", () => [[dispatchCounts, dispatchLog.slice(-40)]]);

// Diagnostics: capture the real sync-data payload vlox sends to this thread.
const __rt = Threads.registerTask.bind(Threads);
Threads.registerTask = (id, fn) => {
  if (id === "sync-data") {
    return __rt(id, (data) => {
      const r = fn(data);
      try { shiftLUTToPalette(data); } catch (e) { if (werrs.length < 8) werrs.push("shift err:" + String(e.message).slice(0, 80)); }
      try { healVoxelTags(); } catch { /* buffer mid-transfer; the 2s interval retries */ }
      return r;
    });
  }
  return __rt(id, fn);
};

new VoxelBuildSpaceWorld();

const DVEW = await StartWorld();
healVoxelTags();

WorldSimulation.init({
  parent: DVEW.threads.parent,
  meshers: DVEW.threads.meshers,
  generators: DVEW.threads.generators,
});

const tickInterval = new TickInterval(() => {
  try {
    WorldSimulation.tick();
  } catch (e) {
    if (werrs.length < 8) werrs.push("tick:" + String(e && e.stack || e).slice(0, 300));
  }
}, 50);

Threads.registerTask("start-world", async () => {
  const position = { x: 0, y: 16, z: 0 };
  await WorldSimulation.Procedures.InitalLoad({
    genData: {
      position,
      renderRadius: 48,
      // Generation spans the whole active ring (generationRadius ==
      // maxRadius): no sector sits outside the generation radius, so every
      // sector loads and generates through the normal brush pipeline and
      // vlox's boundary gates never wedge. The flag-forcing in
      // driveSlabPipeline stays only as a safety net.
      generationRadius: 96,
      maxRadius: 96,
    },
  });
  const generator = WorldSimulation.createGenerator({
    position,
    renderRadius: 48,
    generationRadius: 96,
    maxRadius: 96,
  });
  WorldSimulation.addGenerator(generator);
  mainGenerator = generator;
  tickInterval.start();
  driveSlabPipeline();
});

// Chunk streaming: follow the player. Generator.position is live — the
// simulation re-derives its active-sector rings from it each tick
// (Generator.update detects the sector-cell change and re-rings), so moving
// the focus is all it takes; new sectors are generated through the normal
// brush pipeline and the continuous apply() pass below keeps the vlox
// radius-boundary deadlock from wedging the outer rings.
let mainGenerator = null;
// amodx delivers runTask payload as a SINGLE argument: [x, y, z].
Threads.registerTask("move-generator", (pos) => {
  if (!mainGenerator || !Array.isArray(pos) || pos.length !== 3) return;
  mainGenerator.position.x = pos[0];
  mainGenerator.position.y = pos[1];
  mainGenerator.position.z = pos[2];
});

// vlox's sector pipeline wedges in three ways under a *moving* generator
// focus, so the world thread runs a continuous 500ms maintenance pass:
//  1. Link: ring re-ringing creates sim sectors whose WorldRegister objects
//     do not exist yet; the load gate starves until they do. (Link lazily,
//     never pre-create — sector buffers are heavy.)
//  2. Unload: vlox queues unload tasks for dropped ring cells, but its task
//     dispatcher requires an ACTIVE sim sector, which a dropped cell no
//     longer has — the queue can never drain and the objects linger. The
//     pass frees dropped cells itself (the same removeAt the unload task
//     would do).
//  3. Checkouts: a check-in lost in a detached-buffer transfer leaves a
//     sector permanently checked-out, wedging neighbors' Moore gates and
//     freezing stage queues (observed: propagation queue stuck at 28 with
//     zero in flight). When every stage queue is idle, residual checkouts
//     are cleared.
// Generation/lighting stages themselves run for real (generationRadius
// exceeds maxRadius, so every active sector has a full active Moore
// neighborhood and no stage gate is structurally shut).
// Null-buffer-safe flag reads (races with sector allocation/freeing).
const bf = (sec, f) => { try { return sec.getBitFlag(Sector.FlagIds[f]); } catch { return false; } };
const co = sec => { try { return sec.isCheckedOut(); } catch { return true; } };

// Revocable fake gen-completion bookkeeping (see driveSlabPipeline apply()).
const fakeDone = new Set();
const realGen = new Set();
const revoked = new Set();
const stuckCounts = new Map();
async function driveSlabPipeline() {
  const dim = WorldSimulation.getDimension(0);
  const seen = new Map();
  let passes = 0;
  setInterval(() => { try { healVoxelTags(); } catch { /* mid-transfer */ } }, 2000);
  const stageQueues = ["load", "generate", "decorate", "world_propagation", "wolrd_sun", "save", "build", "unbuild"];
  const apply = () => {
    passes++;
    // Snapshot: re-ringing mutates _sectors mid-iteration.
    const sectors = dim.activeSectors._sectors.slice();
    for (const s of sectors) {
      if (!s.sector) {
        s.sector = WorldRegister.sectors.get(0, s.position[0], s.position[1], s.position[2]);
        if (!s.sector) {
          WorldRegister.sectors.new(0, s.position[0], s.position[1], s.position[2]);
          s.sector = WorldRegister.sectors.get(0, ...s.position);
        }
      }
    }
    const now = new Set();
    for (const s of sectors) now.add(s.position[0] + "," + s.position[2]);
    for (const [k, p] of seen) {
      // Only free cells that are still inactive *now*: re-ring churn can
      // re-activate a cell between passes, and freeing its object out from
      // under an active sim sector crashes every later flag read.
      if (now.has(k)) continue;
      if (dim.activeSectors.get(p[0], 0, p[1])) continue;
      WorldRegister.sectors.removeAt([0, p[0], 0, p[1]]);
    }
    seen.clear();
    for (const s of sectors) seen.set(s.position[0] + "," + s.position[2], s.position);
    // No force-release of checked-out sectors: vlox transfers the world-side
    // buffer to generator threads (and snapshots) outside the stage queues,
    // so any idle-detected "stale" checkout may be a live transfer; forcing
    // it checked-in detaches buffers mid-flight and poisons later brush ops.
    // Boundary safety net (revocable): sectors whose Moore ring can never
    // fully activate (walking put them on the maxRadius edge) can never
    // dispatch their gen task (generateUpdate gates on fullNeighbors), so
    // mark gen done. When the ring shifts and such a sector regains a full
    // active neighborhood, REVOKE the fake (and clear the _genAllDone
    // cache) — otherwise it meshes as permanently empty terrain in front
    // of the walking player (observed: 90-block walk delivered 2 new
    // sections, mesh probe nz=2). generating is true for every active
    // sector (generationRadius == maxRadius), so inner sectors never get
    // re-faked after a revoke, and the open gate dispatches real gen.
    for (const s of sectors) {
      // Checked-out sectors live in a generator thread right now; their
      // world-side buffers are detached and touching flags detaches Atomics.
      if (s.sector && !co(s.sector) && !(s.generating && s.fullNeighbors) && !bf(s.sector, "isWorldGenDone")) {
        const k = s.position[0] + "," + s.position[2];
        const c = (stuckCounts.get(k) || 0) + 1;
        stuckCounts.set(k, c);
        // Only fake after the gate has been shut for ~4 consecutive passes
        // (~2 s): fresh activations converge their Moore neighborhood on
        // their own and never need a fake at all.
        if (c >= 4)
          try { s.sector.setBitFlag(Sector.FlagIds.isWorldGenDone, true); fakeDone.add(k); revoked.delete(k); } catch { /* mid-transfer */ }
      }
    }
    for (const [k, c] of stuckCounts) if (!now.has(k)) stuckCounts.delete(k);
    for (const s of sectors) {
      if (!s.sector || co(s.sector)) continue;
      const k = s.position[0] + "," + s.position[2];
      if (bf(s.sector, "isWorldGenDone")) {
        // Flag up: fake (pending revoke) or real generation. A revoked fake
        // whose flag came back is real generation completing.
        if (revoked.has(k)) { fakeDone.delete(k); revoked.delete(k); realGen.add(k); }
        else if (!fakeDone.has(k)) realGen.add(k);
        continue;
      }
      // Flag down. A revoked fake that regained its neighborhood is on the
      // normal gen path — leave it. Fresh cells that were never generated
      // must NOT be flagged: the simulation will dispatch them.
      if (fakeDone.has(k) && revoked.has(k) === false) revoked.add(k);
    }
    // A fake-completed sector whose Moore neighborhood has since become
    // fully active (ring shifted inward) gets its fake revoked: clear the
    // gen flag + _genAllDone cache so generateUpdate dispatches a real gen
    // task and the terrain actually paints.
    for (const s of sectors) {
      const k = s.position[0] + "," + s.position[2];
      if (!fakeDone.has(k) || revoked.has(k) || !s.fullNeighbors) continue;
      if (!s.sector || co(s.sector)) continue;
      try {
        s.sector.setBitFlag(Sector.FlagIds.isWorldGenDone, false);
        s._genAllDone = false;
        revoked.add(k);
      } catch { /* mid-transfer; retry next pass */ }
    }
    {
      const live = now;
      for (const k of fakeDone) if (!live.has(k)) fakeDone.delete(k);
      for (const k of realGen) if (!live.has(k)) realGen.delete(k);
      for (const k of revoked) if (!live.has(k)) revoked.delete(k);
    }
    // The decor/prop/sun dispatch waves structurally stall one ring inside
    // the max circle: ring-edge gates can never open (inactive outside
    // neighbours), so inner cells' _genAllDone (all-neighbours-complete) is
    // stuck and their builds never enqueue. Once a sector's own generation
    // is complete the remaining light stages are vacuous for this
    // deterministic slab, so mark them done. Gated on the gen flag, which
    // real generation sets before any rendering happens, so meshed data is
    // always real paint (empty edge sectors never get here before their
    // (fake) gen flag, and they sit outside the render circle anyway).
    for (const s of sectors) {
      if (!s.sector || co(s.sector)) continue;
      if (!bf(s.sector, "isWorldGenDone")) continue;
      for (const f of ["isWorldDecorDone", "isWorldPropagationDone", "isWorldSunDone"])
        try { s.sector.setBitFlag(Sector.FlagIds[f], true); } catch { /* buffer mid-transfer; next pass */ }
    }
    // Self-heal wedged gates: a generating sector whose four stage flags are
    // complete but whose Moore gate can never open (a neighbor that will
    // never finish). Completing neighbor flags proves the wave passed; force
    // gen-complete so tickUpdate enqueues the build.
    for (const s of sectors) {
      if (!s.sector || s._genAllDone || !s.fullNeighbors || !s.generating) continue;
      try {
        const st = s.state.update();
        if (st.nSunAllDone && st.allLoaded &&
          s.sector.getBitFlag(Sector.FlagIds.isWorldSunDone) &&
          s.sector.getBitFlag(Sector.FlagIds.isWorldGenDone) &&
          s.sector.getBitFlag(Sector.FlagIds.isWorldDecorDone) &&
          s.sector.getBitFlag(Sector.FlagIds.isWorldPropagationDone)) {
          s._genAllDone = true;
        }
      } catch { /* sector not linked yet */ }
    }
  };
  apply();
  setInterval(() => {
    try {
      apply();
    } catch (e) {
      if (werrs.length < 8) werrs.push("apply:" + String(e && e.stack || e).slice(0, 300));
    }
  }, 500);
}

// Diagnostics: how many sections were empty at snapshot-transfer time
// (empty = mesher will skip; a non-empty skip would indicate a mesher bug).
let snapLog = [], snapTotal = 0, snapEmpty = 0;
{
  const ocs = SnapShots.createSnapShot;
  SnapShots.createSnapShot = function (dim, x, y, z) {
    snapTotal++;
    let st = "?";
    try {
      const sec = WorldRegister.sections.get(dim, x, y, z);
      if (!sec) st = "nolink";
      else {
        const mm = sec.getMinMax();
        st = Math.abs(mm[0]) === Infinity ? "empty" : mm[0] + "," + mm[1];
      }
    } catch (e) { st = "err:" + e.message.slice(0, 40); }
    if (st === "empty" || st === "nolink") snapEmpty++;
    if (snapLog.length < 40) snapLog.push(x + "," + y + "," + z + ":" + st);
    return ocs.apply(this, arguments);
  };
}

// Diagnostics for headless verification: pipeline flags + queue sizes.
Threads.registerTask("debug-state", async () => {
  const out = { err: null };
  try {
    const sec = WorldSpaces.sector.bounds;
    out.secBounds = [sec.x, sec.y, sec.z];
    const sector = WorldRegister.sectors.get(0, 0, 0);
    out.hasSector0 = !!sector;
    if (sector) {
      out.flags = ["isWorldGenDone", "isWorldDecorDone", "isWorldPropagationDone", "isWorldSunDone"].map(
        f => `${f}:${sector.getBitFlag(Sector.FlagIds[f]) ? 1 : 0}`
      );
    }
    const dim = WorldSimulation.getDimension(0);
    try { out.reg = WorldRegister.pools._sectors.length; } catch { out.reg = "?"; }
    if (dim) {
      out.active = dim.activeSectors._sectors.length;
      out.sim = dim.activeSectors._sectors.slice(0, 8).map(s => {
        const o = {
          p: s.position,
          fn: s.fullNeighbors,
          g: s.generating,
          gad: s._genAllDone,
          co: s.sector ? s.sector.isCheckedOut() : null,
        };
        if (s.sector) {
          o.f = ["isWorldGenDone", "isWorldDecorDone", "isWorldPropagationDone", "isWorldSunDone"]
            .map(f => s.sector.getBitFlag(Sector.FlagIds[f]) ? 1 : 0).join("");
          try {
            s.state.update();
            o.st = [s.state.allLoaded ? 1 : 0, s.state.nWorldGenAllDone ? 1 : 0,
              s.state.nDecorAllDone ? 1 : 0, s.state.nPropagtionAllDone ? 1 : 0,
              s.state.nSunAllDone ? 1 : 0].join("");
          } catch (e) { o.st = "x:" + String(e.message).slice(0, 24); }
        }
        return o;
      });
      out.gates = dim.activeSectors._sectors
        .filter(s => s.generating && s.fullNeighbors && !(s.sector && bf(s.sector, "isWorldGenDone")))
        .slice(0, 8)
        .map(s => {
          if (!s.sector) return { p: s.position, nolink: true };
          s.state.update();
          return {
            p: s.position,
            all: s.state.allLoaded,
            alld: s.state.nWorldGenAllDone,
            n: s.neighbors.length,
          };
        });
      out.rings = dim.activeSectors._sectors.filter(s => !s.generating).slice(0, 4).map(s => s.position);
      out.nogen = dim.activeSectors._sectors.filter(s => !s.generating).length;
      out.bad = dim.activeSectors._sectors
        .map(s => {
          if (!s.sector) return "nolink" + JSON.stringify(s.position);
          if (co(s.sector)) return "co" + JSON.stringify(s.position);
          if (!bf(s.sector, "isWorldPropagationDone")) return "prop0" + JSON.stringify(s.position);
          if (!bf(s.sector, "isWorldSunDone")) return "sun0" + JSON.stringify(s.position);
          return null;
        })
        .filter(Boolean)
        .slice(0, 12);
      out.dimtick = dim.tick;
      if (mainGenerator) {
        const gp = mainGenerator.position;
        out.gpos = [gp.x, gp.y, gp.z].map(v => typeof v === "number" ? +v.toFixed(1) : String(v).slice(0, 20));
        out.circ = {
          render: mainGenerator._renderCircle?.radius,
          gen: mainGenerator._genCircle?.radius,
          max: mainGenerator._maxCircle?.radius,
          rc: mainGenerator._renderCircle ? [mainGenerator._renderCircle.center.x, mainGenerator._renderCircle.center.y] : null,
        };
        out.snap = { total: snapTotal, empty: snapEmpty, log: snapLog };
        out.stuck = [];
        for (const s of dim.activeSectors._sectors) {
          if (!s.sector) continue;
          try {
            const zero = !s.sector.buffer || s.sector.buffer.byteLength === 0;
            if (s.sector._checkedOut || s.sector.isLocked() || zero)
              out.stuck.push(s.position.join(",") + (zero ? ":zbuf" : s.sector._checkedOut ? ":co" : ":lk"));
          } catch { /* freed */ }
        }
        out.stuck = out.stuck.slice(0, 20);
        out.meshProbe = (mainGenerator ? [1, 2, 3].map(k => {
          const gp = mainGenerator.position;
          const cx = Math.floor(gp.x / 16) * 16, cz = Math.floor(gp.z / 16) * 16;
          const s = dim.activeSectors.get(cx, 0, cz - k * 16);
          if (!s || !s.sector) return "nolink " + JSON.stringify([cx, 0, cz - k]);
          let nz = 0, mm = 0;
          for (const sec of s.sector.sections) {
            const ids = sec.ids;
            for (let i = 0; i < ids.length; i += 17) if (ids[i]) { nz++; break; }
            const q = sec.getMinMax();
            if (Math.abs(q[0]) !== Infinity) mm++;
          }
          return "nz=" + nz + " mm=" + mm + " f=" + (s.fullNeighbors ? 1 : 0) + " g=" + (bf(s.sector, "isWorldGenDone") ? 1 : 0) + " " + JSON.stringify(s.position);
        }) : []).filter(Boolean);
        out.genFlags = dim.activeSectors._sectors.slice(0, 60).map(s => {
          const g = s.sector ? (bf(s.sector, "isWorldGenDone") ? 1 : 0) : "-";
          const su = s.sector ? (bf(s.sector, "isWorldSunDone") ? 1 : 0) : "-";
          return JSON.stringify(s.position) + ":" + g + su + (s.generating ? "G" : "") + (s.fullNeighbors ? "f" : "") + (s.renderering ? "R" : "") + (s._genAllDone ? "A" : "");
        });
        const sec = dim.activeSectors._sectors;
        const pos = sec.map(s => (s.position ? s.position : [-1e9, -1e9, -1e9]));
        out.sect = {
          n: sec.length,
          nopos: sec.filter(s => !s.position).length,
          xmin: Math.min(...pos.map(p => p[0])), xmax: Math.max(...pos.map(p => p[0])),
          zmin: Math.min(...pos.map(p => p[2])), zmax: Math.max(...pos.map(p => p[2])),
        };
      }
      const t0 = dim.activeSectors.get(32, 0, 0) || (dim.activeSectors._sectors.find(s => s.generating && s.fullNeighbors && s.state.update && (() => { try { return !s.state.update().allLoaded; } catch (e) { return false; } })()) ?? null);
      if (t0) {
        t0.state.update();
        out.why = t0.neighbors.map(n => JSON.stringify(n.position) + ":" +
          (n.sector ? (n.sector.getBitFlag(Sector.FlagIds.isWorldPropagationDone) ? 1 : 0) + "" +
            (n.sector.getBitFlag(Sector.FlagIds.isWorldSunDone) ? 1 : 0) + (n.sector.isCheckedOut() ? "co" : "") : "nolink") +
          (n.sector ? (n.sector.getBitFlag(Sector.FlagIds.isWorldGenDone) ? "G" : "g") + (n.sector.getBitFlag(Sector.FlagIds.isWorldDecorDone) ? "D" : "d") : ""));
      }
    }
    out.fd = fakeDone.size;
    out.rg = realGen.size;
    out.rv = revoked.size;
    out.rk = stuckCounts.size;
    out.genT = { n: ((DVEW.threads.generators && DVEW.threads.generators.getThreads) ? DVEW.threads.generators.getThreads().length : -1) };
    try {
      const gt = DVEW.threads.generators.getThreads()[0];
      out.genStats = await Promise.race([
        gt.runTaskAsync("gen-stats", []),
        new Promise((_, j) => setTimeout(() => j("timeout"), 2500)),
      ]);
    } catch (e) { out.genStats = "ERR:" + String((e && e.message) || e).slice(0, 140); }
    out.dispatch = dispatchCounts;
    out.werrs = werrs;
    out.queues = {};
    for (const key of Object.keys(WorldSimulationTasks)) {
      const t = WorldSimulationTasks[key];
      const tid = t && t.data && t.data.id;
      if (t && typeof t.getTotal === "function" && typeof tid === "string") {
        try {
          out.queues[tid] = { q: t.getTotal(0), inflight: t.getTotalWaitingFor(0) };
        } catch { out.queues[tid] = "?"; }
      }
    }
  } catch (e) {
    out.err = String(e && e.message || e);
  }
  return [out];
});
