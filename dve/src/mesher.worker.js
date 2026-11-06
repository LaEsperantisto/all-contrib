// Mesher thread: turns generated sectors into renderable meshes.
// Wraps vlox task registration with counters for headless diagnostics.
import { StartMesher } from "@divinevoxel/vlox/Init/StartMesher";
import { Threads } from "@amodx/threads";

const counts = { BuildSection: 0, BuildSectionSnapShot: 0, BuildSector: 0, setSectionSent: 0 };
const merrs = [];
self.addEventListener("error", e => { if (merrs.length < 8) merrs.push(String(e.message || e).slice(0, 160)); });
self.addEventListener("unhandledrejection", e => { if (merrs.length < 8) merrs.push("rej:" + String(e.reason && e.reason.message || e.reason).slice(0, 160)); });
const wrap = (reg) => (name, cb) =>
  reg(name, (...a) => {
    if (name in counts) counts[name]++;
    try {
      return cb(...a);
    } catch (e) {
      if (merrs.length < 8) merrs.push(String(name) + ":" + String(e && e.stack || e).slice(0, 300));
      throw e;
    }
  });
const origBinary = Threads.registerBinaryTask.bind(Threads);
const origTask = Threads.registerTask.bind(Threads);
Threads.registerBinaryTask = wrap(origBinary);
Threads.registerTask = wrap(origTask);

await StartMesher({});

Threads.registerTask("mesh-stats", () => [[counts, merrs]]);
