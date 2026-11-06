// World thread: runs the vlox world simulation for the shared-world slab.
// Radius is deliberately small; the generator paints nothing outside the
// slab, and the world API only exposes this window anyway.
import { StartWorld } from "@divinevoxel/vlox/Init/StartWorld";
import { WorldSimulation } from "@divinevoxel/vlox/WorldSimulation";
import { TickInterval } from "@divinevoxel/vlox/Util/TickInterval";
import { Threads } from "@amodx/threads";
import { VoxelBuildSpaceWorld } from "@divinevoxel/vlox/Builder/World/VoxelBuildSpaceWorld";
import { WorldSpaces } from "@divinevoxel/vlox/World/WorldSpaces";
import { WorldRegister } from "@divinevoxel/vlox/World/WorldRegister";
import { Sector } from "@divinevoxel/vlox/World/Sector";
import { WorldSimulationTasks } from "@divinevoxel/vlox/WorldSimulation/Internal/WorldSimulationTasks.js";

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

new VoxelBuildSpaceWorld();

const DVEW = await StartWorld();

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
  const position = { x: 0, y: 16, z: 8 };
  await WorldSimulation.Procedures.InitalLoad({
    genData: {
      position,
      renderRadius: 48,
      generationRadius: 64,
      maxRadius: 80,
    },
  });
  const generator = WorldSimulation.createGenerator({
    position,
    renderRadius: 48,
    generationRadius: 64,
    maxRadius: 80,
  });
  WorldSimulation.addGenerator(generator);
  tickInterval.start();
  driveSlabPipeline();
});

// The vlox pipeline gates each stage on all 8 Moore neighbours, and sectors
// at the outer radius never queue their own load (their neighbour ring is
// inactive), which freezes the wavefront one ring in. For this deterministic
// slab world we pre-create sector objects and drive the decor/sun/propagation
// stages by flag: generation itself still runs normally through the brush.
async function driveSlabPipeline() {
  const B = WorldSpaces.sector.bounds; // [16, 256, 16]
  const dim = WorldSimulation.getDimension(0);
  const each = (lim, fn) => {
    for (let x = -lim; x <= lim; x += B.x) {
      for (let z = -lim; z <= lim; z += B.z) fn(x, z);
    }
  };
  each(80, (x, z) => WorldRegister.sectors.new(0, x, 0, z));
  await new Promise(r => setTimeout(r, 250)); // let the tick loop activate rings
  // Link sector objects onto every sim sector: sim sectors outside the
  // generation radius never link their own and starve neighbours' load gates.
  for (const s of dim.activeSectors._sectors) {
    if (!s.sector) {
      WorldRegister.sectors.new(0, s.position[0], s.position[1], s.position[2]);
      s.sector = WorldRegister.sectors.get(0, ...s.position);
    }
  }
  // Sim sectors that can never dispatch generation — outside the generation
  // radius, or on the radius boundary whose neighbour ring lies outside
  // maxRadius (their Moore gate can never open) — are empty here (the slab
  // doesn't reach them), so the gen flag is set by hand.
  for (const s of dim.activeSectors._sectors) {
    if ((s.generating && s.fullNeighbors) || !s.sector) continue;
    s.sector.setBitFlag(Sector.FlagIds.isWorldGenDone, true);
  }
  const genDone = () =>
    dim.activeSectors._sectors.every(
      s => (!s.generating || !s.fullNeighbors) || (s.sector && s.sector.getBitFlag(Sector.FlagIds.isWorldGenDone))
    );
  for (let i = 0; i < 2400 && !genDone(); i++) {
    await new Promise(r => setTimeout(r, 50));
  }
  // Generation is done; the decor/sun/propagation stages are skipped by
  // flag. (Setting the sun flag earlier would flip _genAllDone before the
  // engine ever queues generation, so this must come last.)
  const light = ["isWorldDecorDone", "isWorldPropagationDone", "isWorldSunDone"];
  const apply = () => {
    for (const s of dim.activeSectors._sectors) {
      if (!s.sector) {
        s.sector = WorldRegister.sectors.get(0, s.position[0], s.position[1], s.position[2]);
        if (!s.sector) {
          WorldRegister.sectors.new(0, s.position[0], s.position[1], s.position[2]);
          s.sector = WorldRegister.sectors.get(0, ...s.position);
        }
      }
      if (!s.sector) continue;
      if (!(s.generating && s.fullNeighbors))
        s.sector.setBitFlag(Sector.FlagIds.isWorldGenDone, true);
      for (const f of light) s.sector.setBitFlag(Sector.FlagIds[f], true);
      // No checkout clearing here: force-clearing mid-flight tasks detaches
      // shared buffers and wedges Atomics dispatch (observed rejection).
    }
  };
  apply();
  // Sector check-ins copy the generator's buffer back over the world sector,
  // wiping any flags set after checkout. The outward generation wave keeps
  // checking sectors in long after the one-shot pass, so re-apply flags
  // continuously; once each sector's real stage completes its generator
  // copy carries the flag and the churn converges.
  setInterval(() => {
    try {
      apply();
    } catch (e) {
      if (werrs.length < 8) werrs.push("apply:" + String(e && e.stack || e).slice(0, 300));
    }
  }, 500);
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
        .filter(s => s.generating && s.fullNeighbors && !(s.sector && s.sector.getBitFlag(Sector.FlagIds.isWorldGenDone)))
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
          if (s.sector.isCheckedOut()) return "co" + JSON.stringify(s.position);
          if (!s.sector.getBitFlag(Sector.FlagIds.isWorldPropagationDone)) return "prop0" + JSON.stringify(s.position);
          if (!s.sector.getBitFlag(Sector.FlagIds.isWorldSunDone)) return "sun0" + JSON.stringify(s.position);
          return null;
        })
        .filter(Boolean)
        .slice(0, 12);
      out.dimtick = dim.tick;
      const t0 = dim.activeSectors.get(32, 0, 0);
      if (t0) {
        t0.state.update();
        out.why = t0.neighbors.map(n => JSON.stringify(n.position) + ":" +
          (n.sector ? (n.sector.getBitFlag(Sector.FlagIds.isWorldPropagationDone) ? 1 : 0) + "" +
            (n.sector.getBitFlag(Sector.FlagIds.isWorldSunDone) ? 1 : 0) + (n.sector.isCheckedOut() ? "co" : "") : "nolink"));
      }
    }
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
