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
import { WorldSimulationTools } from "@divinevoxel/vlox/WorldSimulation/Internal/WorldSimulationTools.js";
import { SnapShots } from "@divinevoxel/vlox/World/SnapShot/SnapShots";
import { SectionSnapShot } from "@divinevoxel/vlox/World/SnapShot/SectionSnapShot";
import { VoxelLUT } from "@divinevoxel/vlox/Voxels/Data/VoxelLUT";
import { GeometryLUT } from "@divinevoxel/vlox/Voxels/Data/GeometryLUT";
import { VoxelTagsRegister } from "@divinevoxel/vlox/Voxels/Data/VoxelTagsRegister";
import { SectionStateDefaultTicks } from "@divinevoxel/vlox/World/Section/SectionState.js";
import { ensureRecord, healVoxelTags, installLUTSync } from "./lut-repair.js";

// vlox's sync-data payload carries LUTs + properties for all published
// voxels but BuildTagData can skip custom entries, leaving VoxelTags sparse
// (indices 0..9 only). Brush.paint then reads VoxelTags[id] -> undefined and
// throws, wedging paint-voxel tasks (locks never released). Rebuild the
// missing entries in-thread from the synced properties + model registry.
import { BuildTagAndPaletteData } from "@divinevoxel/vlox/Voxels/Functions/BuildTagData";
// A painted cell has to be re-meshed as well as written. vlox only rebuilds a
// section when its displayDirty tick changes (SimulationSector.tickUpdate), and
// a brush write bumps nothing: the voxel lands in the world data but stays
// invisible until the sector is rebuilt for an unrelated reason. Live symptom:
// a block the player placed (and could dig again with the crosshair on it)
// never appeared, and a dug cell never disappeared, until the player walked far
// enough away for the sector to unload and come back.
const pendingRemesh = new Set();
function bumpSection(dim, x, y, z) {
  try {
    // `WorldRegister.sectors` is the sector lookup — `sections` does not exist.
    // A sector owns 3x3x3 sections; the displayDirty tick lives on the Section,
    // and `getSection` takes world coordinates (it derives the sector-relative
    // index itself).
    const sector = WorldRegister.sectors.get(dim, x, y, z);
    if (!sector || sector.isCheckedOut()) return false;
    const sec = sector.getSection(x, y, z);
    if (!sec) return false;
    const tick = SectionStateDefaultTicks.displayDirty;
    const before = sec.getTick(tick);
    sec.incrementTick(tick);
    // While the sector's buffer is detached, an indexed write into `tickArray`
    // is a silent no-op, so only claim success when the bump actually landed.
    return sec.getTick(tick) !== before;
  } catch {
    return false; // buffers detached while the sector is checked out
  }
}
function queueRemesh(x, y, z) {
  const b = WorldSpaces.section.bounds;
  const sx = Math.floor(x / b.x) * b.x, sy = Math.floor(y / b.y) * b.y, sz = Math.floor(z / b.z) * b.z;
  const touched = [[sx, sy, sz]];
  // The neighbour shares the culled face, so an edit on a section boundary has
  // to dirty the next section out too.
  if (x === sx) touched.push([sx - b.x, sy, sz]);
  if (x === sx + b.x - 1) touched.push([sx + b.x, sy, sz]);
  if (y === sy) touched.push([sx, sy - b.y, sz]);
  if (y === sy + b.y - 1) touched.push([sx, sy + b.y, sz]);
  if (z === sz) touched.push([sx, sy, sz - b.z]);
  if (z === sz + b.z - 1) touched.push([sx, sy, sz + b.z]);
  for (const t of touched) if (!bumpSection(0, t[0], t[1], t[2])) pendingRemesh.add(t.join(","));
  if (pendingRemesh.size > 512) pendingRemesh.delete(pendingRemesh.values().next().value);
  // Lighting changes with the terrain too: a placed lamp starts emitting, a
  // placed wall blocks, a dug cell opens a path. Queue the touched sections and
  // their six neighbours so the light field settles across section borders (the
  // mesher is re-baked by the same displayDirty bump above).
  for (const t of touched) {
    lightQueue.add(t.join(","));
    for (const [dx, dy, dz] of [[b.x, 0, 0], [-b.x, 0, 0], [0, b.y, 0], [0, -b.y, 0], [0, 0, b.z], [0, 0, -b.z]]) {
      lightQueue.add((t[0] + dx) + "," + (t[1] + dy) + "," + (t[2] + dz));
    }
  }
}
setInterval(() => {
  if (!pendingRemesh.size) return;
  for (const key of [...pendingRemesh]) {
    const [x, y, z] = key.split(",").map(Number);
    if (bumpSection(0, x, y, z)) pendingRemesh.delete(key);
  }
}, 500);

// ---- Voxel light -------------------------------------------------------------
// vlox shades every face from a per-voxel light grid that lives inside each
// section (`Section.light`: four packed 4-bit channels — sun, R, G, B). The
// mesher reads it and the voxel shader multiplies the texture by it, with
// baseLevel 0.2 as the floor. We never run vlox's own propagation stages (they
// are flag-driven and would stall the streaming pipeline), so the grid was
// always empty and the whole world rendered at that floor: flat and dark.
//
// Fill the grid here instead, in the thread that owns the voxel data:
//   sky  — daylight enters from the top of the loaded column and falls 2 per
//          block (vlox's own SunFallOffValue), which is what makes a cave
//          mouth bright and its back dark;
//   RGB  — block light spreads 1 per block from every block whose registry
//          `light` value is above zero, so a placed glowstone lights the room
//          around it and a mined-out corridor stays lit near the lamp.
// Light only travels through cells that are not full cubes: air, and blocks the
// registry calls transparent. Main sends that table once per join (a block
// published in the Studio gets real light the moment it is placed).
const lightLevel = new Map(); // true voxel id -> emitted light 0..15
const lightThru = new Set();  // true voxel id -> light passes through
let SUNK = 2;   // vlox: sun falls off twice as fast as block light
const litBorder = new Map();  // section key -> checksum of its border values
const seenSections = new Set(); // section keys the pass has filled at least once
const lightQueue = new Set(); // section keys that need (re)computing
let lightReady = false;

Threads.registerTask("light-tables", rows => {
  lightLevel.clear();
  lightThru.clear();
  for (const [name, level, thru] of rows) {
    let tid = 0;
    try { tid = VoxelLUT.voxelIds.getNumberId(name); } catch { /* palette mid-sync */ }
    if (!tid || tid < 0) continue;
    if (level > 0) lightLevel.set(tid, Math.min(15, level));
    if (thru) lightThru.add(tid);
  }
  lightReady = true;
  litBorder.clear();
  seenSections.clear();
  lightQueue.clear();
  return [lightLevel.size, lightThru.size];
});

// Air and unknown ids let light through: only a registered full cube stops it.
const thruId = tid => (tid === 0 ? true : lightThru.has(tid));

// The grid layout comes from vlox's own space tables, read when a section is
// lit (they are configured with the world settings, not at module load). The
// cell order is vlox's YXZ form — z in the low bits, x above it, y on top —
// identical to `GetYXZOrderArrayIndex` in `Math/WorldIndexing.js`, which is how
// every cursor and the mesher index a section's own arrays.
let sSky = null, sRgb = null, sThru = null, sQueue = null, sVol = 0;
// Light is filled inside the world worker's existing sweep loop (the same 500 ms
// apply() that runs the streaming gates), never on its own timer: a section that
// has never been lit is filled in place, up to a per-round budget, and a section
// whose border checksum changed hands its six neighbours another pass the next
// round. That keeps lighting and remeshing in step with streaming instead of
// re-baking the world out from under it.
let lpCalls = 0, lpDone = 0, lpErr = "";
let lpForce = false;   // set during light-fill so lightSection logs its seed census
const lpLog = [];   // one entry per distinct early-exit, for the state diagnostic
function dims() {
  const s = WorldSpaces.section;
  return {
    x: 1 << s.power2Axes.x, y: 1 << s.power2Axes.y, z: 1 << s.power2Axes.z,
    v: s.volumne, pz: s.power2Axes.z, pxz: s.xzPower,
    // The ceiling a section may treat as open sky is the world's MaxY, on
    // WorldBounds (WorldSpaces.world) — not section.bounds, which is 16.
    yHeight: WorldSpaces.world.bounds.MaxY,
  };
}
// Section-local cell -> slot in that section's ids/light arrays.
const slot = (D, x, y, z) => z | (x << D.pz) | (y << D.pxz);
function scratch(n) {
  if (sVol === n) return;
  sVol = n;
  sSky = new Uint8Array(n);
  sRgb = new Uint8Array(n);
  sThru = new Uint8Array(n);
  sQueue = new Int32Array(n * 4);
}

function sectionAt(x, y, z) {
  // `WorldRegister.sectors` is the sector lookup (there is no section registry);
  // `getSection` derives the sector-relative index from world coordinates.
  try {
    const sector = WorldRegister.sectors.get(0, x, y, z);
    if (!sector) return null;
    return sector.getSection(x, y, z) ?? null;
  } catch {
    return null; // sector mid-transfer: its buffer is detached
  }
}

/** Fill one section's light grid. Returns false if its buffers are detached
 *  (the sector is checked out for a thread transfer) so the caller re-queues. */
function lightSection(sec) {
  const ids = sec.ids, light = sec.light;
  if (!ids || !light) return false;
  const [ox, oy, oz] = sec.position;
  let D, key, above, aboveKey;
  try {
    D = dims();
    // Sky flows top-down: an unlit section above would report a border of 0 and
    // wrongly cap every column here (zero converging to zero is otherwise the
    // fixed point of the checksum wave). Defer until the load above us is lit;
    // lightPass re-queues a false return, so the chain resolves from the top.
    key = ox + "," + oy + "," + oz;
    above = sectionAt(ox, oy + D.y, oz);
    aboveKey = ox + "," + (oy + D.y) + "," + oz;
  } catch (e) { lpErr = "head:" + String(e && e.message || e).slice(0, 80); return false; }
  if (above && oy + D.y < D.yHeight && !litBorder.has(aboveKey)) {
    if (!lpLog.includes("defer")) lpLog.push("defer");
    return false;
  }
  if (lpForce) lpLog.push("ph-A:" + key);
  scratch(D.v);
  const sky = sSky, rgb = sRgb, thru = sThru, queue = sQueue;
  const vi = (x, y, z) => slot(D, x, y, z);
  try {
    thru.fill(0); sky.fill(0); rgb.fill(0);
    let head = 0, tail = 0;
    for (let y = 0; y < D.y; y++) {
      for (let z = 0; z < D.z; z++) {
        for (let x = 0; x < D.x; x++) {
          const k = vi(x, y, z);
          const tid = VoxelLUT.voxelIdToTrueId[ids[k]] ?? 0;
          const emit = lightLevel.get(tid);
          if (!thruId(tid)) {
            // A full cube blocks light passing THROUGH it, but an emissive one
            // (glowstone, a beacon) still seeds its own cell and the frontier:
            // the propagation step's own `thru` guard keeps the dark core dark
            // while the glow leaves the lamp.
            if (emit) {
              rgb[k] = emit;
              if (tail + 4 <= queue.length) { queue[tail++] = k; queue[tail++] = x; queue[tail++] = y; queue[tail++] = z; }
            }
            continue;
          }
          thru[k] = 1;
          if (emit) {
            rgb[k] = emit;
            if (tail + 4 <= queue.length) { queue[tail++] = k; queue[tail++] = x; queue[tail++] = y; queue[tail++] = z; }
          }
        }
      }
    }
    // Sky, vlox's own semantics (WorldSun): every cell above the first full
    // cube in a column carries the sun at the column's value — full 15 where
    // nothing loads above, otherwise the value the section above reports on
    // its shared border. The two-per-step falloff is for spreading into
    // shadow, never down an open column. Only each column's lowest seed joins
    // the frontier (nothing can beat it higher up), which keeps the queue
    // bounded. A not-yet-filled upper section reports 0 and the border wave
    // refills this one once it is lit.
    let nseed = 0, nzero = 0, ntop = 0;
    for (let z = 0; z < D.z; z++) {
      for (let x = 0; x < D.x; x++) {
        let v = 15;
        if (above) {
          try { v = above.light[slot(D, x, 0, z)] & 0xf; } catch { v = 15; }
        }
        if (v <= 0) { nzero++; continue; }
        if (!thru[vi(x, D.y - 1, z)]) { ntop++; continue; }   // this section's column is capped
        nseed++;
        let bottom = D.y - 1;
        for (let y = D.y - 1; y >= 0; y--) {
          const k = vi(x, y, z);
          if (!thru[k]) break;
          sky[k] = v;
          bottom = y;
        }
        if (tail + 4 <= queue.length) { queue[tail++] = vi(x, bottom, z); queue[tail++] = x; queue[tail++] = bottom; queue[tail++] = z; }
      }
    }
    if (lpForce) lpLog.push("seed:" + nseed + " zero:" + nzero + " top:" + ntop + " ab:" + (above ? 1 : 0) + " hy:" + D.yHeight);
    // Both channels travel the same frontier: each step loses one level for
    // block light, two for daylight, and never passes a full cube. A cell keeps
    // the brightest it has seen, so re-running a section only ever strengthens
    // it, which is what makes the border settling wave converge.
    let iters = 0;
    while (tail > head) {
      if (++iters > 300000) { lpLog.push("front-budget"); break; }
      const k = queue[head++];
      const x = queue[head++], y = queue[head++], z = queue[head++];
      const s0 = sky[k], r0 = rgb[k];
      const ns = s0 > SUNK ? s0 - SUNK : 0;
      const nr = r0 > 1 ? r0 - 1 : 0;
      if (!ns && !nr) continue;
      for (const [nx, ny, nz] of [[x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z], [x, y, z + 1], [x, y, z - 1]]) {
        if (nx < 0 || ny < 0 || nz < 0 || nx >= D.x || ny >= D.y || nz >= D.z) continue;
        const j = vi(nx, ny, nz);
        if (!thru[j]) continue;
        let moved = false;
        if (ns > sky[j]) { sky[j] = ns; moved = true; }
        if (nr > rgb[j]) { rgb[j] = nr; moved = true; }
        if (moved && tail + 4 <= queue.length) { queue[tail++] = j; queue[tail++] = nx; queue[tail++] = ny; queue[tail++] = nz; }
      }
    }
    lpLog.push("ph-C:" + iters);
    // Store: sun in the low nibble, white block light in R/G/B (the registry's
    // `light` value carries no colour, so light stays neutral).
    for (let k = 0; k < D.v; k++) {
      light[k] = sky[k] | (rgb[k] << 4) | (rgb[k] << 8) | (rgb[k] << 12);
    }
    lpLog.push("store:" + light[vi(0, D.y - 1, 0)] + "," + light[vi(D.x >> 1, D.y - 1, D.z >> 1)]);
  } catch (e) { lpErr = String(e && e.message || e).slice(0, 80); return false; }   // buffers detached mid-transfer
  // A border whose values changed has to hand its neighbours another pass, or
  // light never crosses the section line.
  let sum = 0;
  for (let a = 0; a < D.x; a++) {
    for (let b = 0; b < D.z; b++) {
      sum = (sum + light[vi(a, 0, b)] + light[vi(a, D.y - 1, b)] + light[vi(a, b, 0)] + light[vi(a, b, D.z - 1)]) | 0;
    }
  }
  if (litBorder.get(key) === sum) return true;
  litBorder.set(key, sum);
  for (const [dx, dy, dz] of [[D.x, 0, 0], [-D.x, 0, 0], [0, D.y, 0], [0, -D.y, 0], [0, 0, D.z], [0, 0, -D.z]]) {
    const n = sectionAt(ox + dx, oy + dy, oz + dz);
    if (n) lightQueue.add(n.position.join(","));
  }
  return true;
}

/** One pass of the light queue: recompute the queued sections, and re-mesh the
 *  ones whose lighting changed (the mesher only re-bakes on a displayDirty
 *  tick, exactly like a player edit). */
function lightPass(sectors) {
  lpCalls++;
  if (!lightReady) return 0;
  const keys = [...lightQueue];
  let done = 0;
  for (const key of keys) {
    if (done >= 24) { lightQueue.add(key); continue; }   // bound each pass; the rest wait
    lightQueue.delete(key);
    const [x, y, z] = key.split(",").map(Number);
    const sec = sectionAt(x, y, z);
    if (!sec) { litBorder.delete(key); if (!lpLog.includes("nosec")) lpLog.push("nosec:" + key); continue; }
    const ok = lightSection(sec);
    if (!ok) { lightQueue.add(key); if (!lpLog.includes("notrig")) lpLog.push("notrig:" + key + ":" + (sec.ids ? "ids" : "noids")); continue; }
    seenSections.add(key);
    const tick = SectionStateDefaultTicks.displayDirty;
    try {
      if (sec.getTick(tick) !== undefined) sec.incrementTick(tick);
    } catch { /* buffer detached; the sector's own path will re-mesh it */ }
    done++;
  }
  lpDone += done;
  // Every section that has never been lit needs filling, but only a few
  // sections' worth per round: re-lighting (and so re-meshing) the whole active
  // world at once starves the streaming pipeline. They are filled here rather
  // than queued: a section has to be filled once before its border checksum
  // means anything, and a queue that starts empty has no chance to notice.
  let budget = 24;
  let skipped = 0;
  const fresh = new Set();
  for (const s of sectors) {
    if (budget <= 0) break;
    if (!s.sector || co(s.sector)) { skipped++; continue; }
    for (const sec of unlitSections(s)) fresh.add(sec);
  }
  if (skipped && !lpLog.includes("skip")) lpLog.push("skip:" + skipped + "/" + sectors.length);
  if (fresh.size && !lpLog.includes("sweep")) lpLog.push("sweep:" + fresh.size + ":" + sectors.length);
  if (lpLog.length > 64) lpLog.splice(0, lpLog.length - 64);
  for (const k of fresh) {
    if (budget <= 0) { lightQueue.add(k); continue; }
    const [fx, fy, fz] = k.split(",").map(Number);
    const sec = sectionAt(fx, fy, fz);
    if (!sec) continue;
    if (!lightSection(sec)) { lightQueue.add(k); continue; }   // buffers detached: try again next round
    seenSections.add(k);
    const tick = SectionStateDefaultTicks.displayDirty;
    try {
      if (sec.getTick(tick) !== undefined) sec.incrementTick(tick);
    } catch { /* buffer detached; the sector's own path will re-mesh it */ }
    budget--; lpDone++; done++;
  }
  return done;
}

/** The sections of one active sector that have never been lit. A section's
 *  border checksum can legitimately repeat (an all-air column stays all-air),
 *  so the queue also has to remember which sections it has touched at all. */
function unlitSections(s) {
  const out = [];
  try {
    for (const sec of s.sector.sections) {
      const key = sec.position.join(",");
      if (!seenSections.has(key)) out.push(key);
    }
  } catch { /* sector mid-transfer */ }
  return out;
}

// Diagnostics: read the packed light of specific world cells back out, so a
// live proof can ask about a lamp's neighbours without guessing the grid order
// on the main thread.
Threads.registerTask("light-cells", flat => {
  // Args arrive one-per-element, so a cell list is handed over as a flat run of
  // coordinates and reassembled here.
  const cells = [];
  for (let i = 0; i + 2 < flat.length + 1; i += 3) cells.push([flat[i], flat[i + 1], flat[i + 2]]);
  return [[...cells.map(([x, y, z]) => {
    const sec = sectionAt(x, y, z);
    // A missing section is the finding, not a failure to handle it: say so, or a
    // probe reads silence as "unlit".
    if (!sec) return [x, y, z, "no-section"];
    if (!sec.light) return [x, y, z, "no-light-buffer"];
    const p = sec.position, D = dims();
    try {
      const v = sec.light[slot(D, x - p[0], y - p[1], z - p[2])];
      return [x, y, z, v & 0xf, (v >> 4) & 0xf, (v >> 8) & 0xf, (v >> 12) & 0xf];
    } catch (e) { return [x, y, z, "read-failed:" + String(e && e.message || e).slice(0, 24)]; }
  }), lightPassState()]];
});

// Diagnostics: how many sections have been lit and how many are still queued.
const lightPassState = () => [litBorder.size, lightQueue.size, lpCalls, lpDone, lpErr, lightReady, lightLevel.size, lightThru.size, seenSections.size, lpLog.slice(-12)];
Threads.registerTask("light-state", () => [lightPassState()]);
// Diagnostics: fill specific sections on demand, so a probe can separate the
// seeding/order from the streaming sweep.
Threads.registerTask("light-fill", cells => {
  lpLog.push("fill-start:" + (cells && cells.length));
  lpForce = true;
  let done = 0, nkeys = 0, seen = [];
  try {
    const keys = new Set();
    for (const [x, y, z] of cells) {
      const sec = sectionAt(x, y, z);
      if (sec) keys.add(sec.position.join(","));
      else seen.push(`${x},${y,z}=none`);   // no section here at all: say so
    }
    // A fill defers while its section above is unlit, so the forced set has to
    // include that chain — and fill it top-down, or every pass just defers.
    const D = dims();
    for (const key of keys) {
      const [x, y, z] = key.split(",").map(Number);
      for (let ay = y + D.y; ay < D.yHeight; ay += D.y) {
        const a = sectionAt(x, ay, z);
        if (!a) break;
        const ak = a.position.join(",");
        if (keys.has(ak)) break;
        keys.add(ak);
      }
    }
    const order = [...keys].sort((a, b) => Number(b.split(",")[1]) - Number(a.split(",")[1]));
    lpLog.push("ch:" + order.length);
    for (let pass = 0; pass < 2; pass++) {
      for (const key of order) {
        const [x, y, z] = key.split(",").map(Number);
        const sec = sectionAt(x, y, z);
        if (sec) {
          const ok = lightSection(sec);
          lpLog.push("res:" + pass + ":" + key + ":" + (ok ? 1 : 0));
          if (ok) { seenSections.add(key); done++; }
        } else if (pass === 0) seen.push(`gone:${key}`);
      }
    }
    nkeys = keys.size;
  } catch (e) {
    lpErr = "fill-throw:" + String(e && e.message || e).slice(0, 90);
    if (e && e.stack) lpLog.push("st:" + String(e.stack).split("\n")[1].trim().slice(0, 70));
  }
  lpForce = false;
  lpLog.push("fill-done:" + done);
  // The threads layer treats a sync task's return as [payload, transferList],
  // so the whole payload must sit in ONE outer array element or the reply is
  // posted with a bogus transfer list and the caller never resolves.
  return [[[done, nkeys, seen.slice(0, 4)], lightPassState()]];
});
Threads.registerTask("light-probe", ([x, y, z]) => {
  const sec = sectionAt(x, y, z);
  if (!sec || !sec.light) return [null];
  const n = dims().v;
  const out = [];
  for (let i = 0; i < n; i++) out.push(sec.light[i]);
  return [[out, Array.from(sec.position), litBorder.size, lightQueue.size, lpCalls, lpDone, lpErr, lightReady, [...lightLevel.keys()].length, [...lightThru].length]];
});


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
      brush.paint();
      // Read the cell back. vlox encodes the name through this thread's LUT,
      // and a name with no encode entry writes 0 (air) with no error at all —
      // without this check a failed placement looks like a successful one.
      const back = brush.dataCursor.getVoxel(loc[1], loc[2], loc[3]);
      if (id === "dve_air" && !back) {
        // Already air: air-on-air is the desired end-state. Without this the
        // loop burns all 40 retries (a named id writing 0 is a FAILURE - LUT
        // encode miss - and must keep falling through).
        queueRemesh(loc[1], loc[2], loc[3]);
        return "ok";
      }
      if (back) {
        back.process();
        const got = back.getStringId();
        if (got === id || (id === "dve_air" && (!got || got === "dve_air" || back.getRaw()[0] === 0))) {
          queueRemesh(loc[1], loc[2], loc[3]);
          return "ok";
        }
        last = "read-back:" + String(got);
        if (id !== "dve_air") {
          const tid = VoxelLUT.voxelIds.getNumberId(id);
          if (tid > 0) ensureRecord(tid);
        }
      }
    } catch (e) {
      last = String(e && e.message).slice(0, 90);
      // vlox throws ("Tried to run tick update on voxel that does not exist")
      // when a break next to a sim voxel schedules a tick on a cell that is
      // already air - but the data write happened before the throw. If the
      // cell reads back at the wanted state the task contract is met: remesh
      // and be done. (Skipped wake-up is harmless: our sea is a column model,
      // no flow sim is relied on anywhere; see disclosure ledger.)
      try {
        const back2 = WorldSimulation.getDimension(0).getBrush().dataCursor.getVoxel(loc[1], loc[2], loc[3]);
        if ((id === "dve_air" && !back2) || (back2 && back2.getStringId() === id)) {
          queueRemesh(loc[1], loc[2], loc[3]);
          return "ok";
        }
      } catch { /* sector mid-transfer; keep retrying */ }
    }
    await new Promise(r => setTimeout(r, 250));
  }
  werrs.push("pd-fail @" + loc.join(",") + " raw=" + JSON.stringify(Array.from(raw)) + " " + last);
  return "fail";
});

// Diagnostics: capture worker throws (a throw inside tick() would abort the
// per-tick pipeline iteration silently).
const werrs = [];
self.addEventListener("error", e => { if (werrs.length < 8) werrs.push(String(e.message || e).slice(0, 160) + " @ " + String(e.filename || "").split("/").pop() + ":" + e.lineno + ":" + e.colno); });
self.addEventListener("unhandledrejection", e => { if (werrs.length < 8) werrs.push("rej:" + String(e.reason && e.reason.message || e.reason).slice(0, 160) + "\n" + String(e.reason && e.reason.stack || "").split("\n").slice(0, 6).join("\n").slice(0, 700)); });

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

// vlox hands every thread a synced LUT payload whose positional tables do not
// line up with this thread's own palette; repair them the moment it lands.
installLUTSync(e => { if (werrs.length < 8) werrs.push("shift err:" + String(e.message).slice(0, 80)); });

new VoxelBuildSpaceWorld();

const DVEW = await StartWorld();
// No heal before sync-data: allocating ids here is exactly what put this
// thread's published blocks out of step with the mesher's numbering. The
// sync-time repair (installLUTSync) and the 2s interval cover it.

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

// A sector whose buffer went to a generator thread and never came back is
// permanently "checked out": vlox's own unload path cannot free it (the sim
// sector is already gone), and the manual free below crashes inside
// returnSector on the detached buffer, which aborts WorldRegister.remove
// BEFORE it deletes the map entry. The stale object then outlives the cell:
// walking back re-binds it, generateUpdate skips it (isCheckedOut), and the
// chunk never streams in again. Track how long each cell has been checked
// out; past the grace period hand the sector a fresh buffer so the flag and
// the views are valid again and the pipeline re-dispatches generation (every
// player edit replays from ACWorldGen.edits, so nothing is lost). A false
// positive is self-healing: a late check-in just overwrites the fresh buffer
// with the real painted one.
const checkedOutAt = new Map();
const STALE_CHECKOUT_MS = 8000;
function unstick(x, z) {
  const sec = WorldRegister.sectors.get(0, x, 0, z);
  if (!sec) { checkedOutAt.delete(x + "," + z); return false; }
  const k = x + "," + z;
  if (!co(sec)) { checkedOutAt.delete(k); return false; }
  const first = checkedOutAt.get(k);
  if (first === undefined) { checkedOutAt.set(k, Date.now()); return false; }
  if (Date.now() - first < STALE_CHECKOUT_MS) return false;
  try {
    sec.setBuffer(Sector.CreateNewBuffer());
    sec.setCheckedOut(false);
    sec.setLocked(false);
    if (werrs.length < 8) werrs.push("unstick:" + k);
  } catch (e) {
    if (werrs.length < 8) werrs.push("unstick:" + k + ":" + String(e && e.message || e).slice(0, 60));
  }
  checkedOutAt.delete(k);
  return true;
}

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
      // A cell re-activated onto a sector orphaned by an earlier drop must
      // not inherit that stale checkout: generateUpdate skips checked-out
      // sectors, so the chunk would stay empty forever.
      unstick(s.position[0], s.position[2]);
    }
    const now = new Set();
    for (const s of sectors) now.add(s.position[0] + "," + s.position[2]);
    for (const [k, p] of seen) {
      // Only free cells that are still inactive *now*: re-ring churn can
      // re-activate a cell between passes, and freeing its object out from
      // under an active sim sector crashes every later flag read.
      if (now.has(k)) continue;
      if (dim.activeSectors.get(p[0], 0, p[1])) continue;
      try {
        unstick(p[0], p[1]);
        WorldRegister.sectors.removeAt([0, p[0], 0, p[1]]);
      } catch (e) {
        // One wedged cell must not abort the pass: the throw would skip
        // seen.clear() and every stage-flag repair below it, killing the
        // whole maintenance loop for the rest of the session.
        if (werrs.length < 8) werrs.push("free:" + k + ":" + String(e && e.message || e).slice(0, 60));
      }
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
    // Real light: fill/refresh the voxel light grids for the sections that
    // still need it (new streaming, player edits, borders that changed).
    try { lightPass(sectors); } catch (e) { lpErr = "pass:" + String(e && e.message || e).slice(0, 80); }
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
  // A sector checked out for a thread transfer mid-snapshot detaches its
  // buffer, and the per-cell copy throws on a detached source (seen live:
  // teleport storms + heavy edits repro it). vlox unlocks the box but the
  // rejection escapes unhandled and the region silently stops re-meshing.
  // Make the copy cell-tolerant instead: cells copied so far stay fresh,
  // the rest keep their previous contents (each cell's `_used` flag only
  // flips on a complete copy, so the snapshot never claims data it lacks),
  // and the column is re-bumped so the next round recopies everything.
  const oss = SectionSnapShot.prototype.storeSnapShot;
  SectionSnapShot.prototype.storeSnapShot = function () {
    try {
      oss.apply(this, arguments);
    } catch (e) {
      if (!/detached|out-of-bounds/.test(String(e && e.message))) throw e;
      const [, x, y, z] = this.location;
      pendingRemesh.add(x + "," + y + "," + z);
      if (werrs.length < 24) werrs.push("snap-stale:" + [x, y, z].join(","));
    }
  };
}
{
  const ocs = SnapShots.createSnapShot;
  SnapShots.createSnapShot = function (dim, x, y, z) {
    snapTotal++;
    let st = "?";
    try {
      const host = WorldRegister.sectors.get(dim, x, y, z);
      const sec = host ? host.getSection(x, y, z) : null;
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
{
  // vlox's async unload task tears a sector down without looking at its
  // checked-out state: the sector-buffer pool zeroes the world-side
  // bufferView on return, which throws a TypeError when that buffer is
  // currently transferred to a generator thread. The rejection escapes
  // unhandled, the registry drops the sector while a thread still owns it,
  // and every later paint/brush round trip for that cell dies - observed
  // as edit repaints silently going stale after walk + edit storms
  // ("Cannot perform %TypedArray%.prototype.fill on a detached or
  // out-of-bounds ArrayBuffer"). Defer the unload while the sector is
  // checked out; the task queue retries it, and the maintenance free path
  // (checked-in only) cleans up any leftover.
  const our = WorldSimulationTasks.unloadTasks.run;
  WorldSimulationTasks.unloadTasks.run = function (dimension, location, taskId, task) {
    const sector = WorldRegister.sectors.get(...location);
    if (sector && co(sector)) return;
    return our.apply(this, arguments);
  };
  // The task-entry check races: a generator checkout can start while the
  // unload's `await` is in flight, so the pool return is also gated here at
  // the single choke point. Skipping a return only costs a pool buffer.
  const pools = WorldRegister._pools;
  const rs = pools.returnSector;
  pools.returnSector = function (sector) {
    let det = false;
    try { det = !!sector.bufferView?.buffer?.detached; } catch { det = true; }
    if (det || co(sector)) {
      if (werrs.length < 24) werrs.push("returnSector:skipped:" + (det ? "detached" : "checkedout"));
      return;
    }
    return rs.apply(this, arguments);
  };
}

// Diagnostics: what the re-mesh machinery saw (snapshots taken, queued bumps).
Threads.registerTask("lut-stats", () => {
  const V = VoxelLUT, pal = V.voxelIds._palette || [];
  const rows = [];
  for (let i = 0; i < pal.length; i++) {
    const rs = V.voxelRecordStartIndex[i];
    rows.push([pal[i], V.modelsIndex[i], V.voxelRecord[rs], VoxelTagsRegister.VoxelTags[i] ? "t" : "-"]);
  }
  const comp = [];
  for (let c = 0; c < V.totalVoxelIds; c++) comp.push(pal[V.voxelIdToTrueId[c]] ?? "?");
  return [[pal.length, V.totalVoxelIds, comp, rows]];
});

Threads.registerTask("remesh-stats", () => [[snapTotal, snapEmpty, snapLog.slice(-8), pendingRemesh.size]]);
// The worker's own uncaught errors/rejections, with stacks (see the
// self.addEventListener handlers above). Diagnostics for live debugging.
Threads.registerTask("werrs", () => [[werrs.slice(0, 24)]]);

// The snapshot hand-off is the fragile link of the re-mesh path: a section
// buffer that got detached (checked out elsewhere) makes the payload transfer
// throw inside a promise chain, and nothing downstream reports it - the mesher
// simply never hears about the section. Record the calls and their failures.
const meshSend = { ok: 0, err: [] };
{
  const ssb = WorldSimulationTools.taskTool.build.sectionSnapShot;
  const orig = ssb.run.bind(ssb);
  ssb.run = (...a) => {
    try {
      orig(...a);
      meshSend.ok++;
    } catch (e) {
      if (meshSend.err.length < 8) meshSend.err.push(String(e && e.message || e).slice(0, 90));
    }
  };
}
Threads.registerTask("mesh-send-stats", () => [[meshSend.ok, meshSend.err]]);

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

// Which picture the synced geometry record says each face of a voxel wears.
// Answers "why is that face that colour" from the tables every thread shares.
Threads.registerTask("voxel-dbg", (name) => {
  const V = VoxelLUT, G = GeometryLUT;
  let id;
  try { id = V.voxelIds.getNumberId(name); } catch { return ["lookup-threw"]; }
  if (id === undefined || id === null) {
    const pal = V.voxelIds._palette || [];
    return ["no-voxel", pal.filter(p => String(p).includes(String(name).slice(0, 6))).slice(0, 10)];
  }
  const gidx = V.geometryIndex[id];
  return [[id, gidx, G.geometryIndex[gidx], G.compiledGeometry[gidx] && G.compiledGeometry[gidx].length,
    G.geometryInputs[gidx], G.geometryInputs[G.geometryInputsIndex[gidx]]]];
});
