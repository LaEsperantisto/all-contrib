// Mesher thread: turns generated sectors into renderable meshes.
// Wraps vlox task registration with counters for headless diagnostics.
import { StartMesher } from "@divinevoxel/vlox/Init/StartMesher";
import { Threads } from "@amodx/threads";
import { healVoxelTags, installLUTSync } from "./lut-repair.js";
import { VoxelLUT } from "@divinevoxel/vlox/Voxels/Data/VoxelLUT";
import { GeometryLUT } from "@divinevoxel/vlox/Voxels/Data/GeometryLUT";
import { VoxelSchemas } from "@divinevoxel/vlox/Voxels/State/VoxelSchemas";
import { VoxelTagsRegister } from "@divinevoxel/vlox/Voxels/Data/VoxelTagsRegister";

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

installLUTSync(e => { if (merrs.length < 12) merrs.push("shift:" + String(e.message).slice(0, 90)); });

await StartMesher({});

// Meshing a section decodes every voxel id through this thread's tables, so the
// published blocks that sync-data leaves unencoded kill the whole build: the
// mesher throws and the section never reaches the renderer. installLUTSync runs
// the repair the moment the payload lands; the interval catches late publishes.
setInterval(() => { try { healVoxelTags(); } catch { /* mid-transfer */ } }, 2000);

Threads.registerTask("lut-stats", () => {
  const V = VoxelLUT, pal = V.voxelIds._palette || [];
  const rows = [];
  for (let i = 0; i < pal.length; i++) {
    const rs = V.voxelRecordStartIndex[i];
    rows.push([pal[i], V.modelsIndex[i], V.totalStates[i],
      V.voxelRecord[rs], VoxelSchemas.reltionalStateBuilderMap[V.modelsIndex[i]] ? "b" : "-",
      VoxelTagsRegister.VoxelTags[i] ? "t" : "-", V.geometryIndex[i] !== undefined ? "g" : "-"]);
  }
  const builders = [];
  for (let i = 0; i < VoxelSchemas.reltionalStateBuilderMap.length; i++) if (VoxelSchemas.reltionalStateBuilderMap[i]) builders.push(i);
  return [[pal.length, V.totalVoxelIds, V.totalRelationalVoxelIds, V.models._palette.slice(0, 24), builders, rows]];
});

Threads.registerTask("mesh-stats", () => [[counts, merrs]]);

// Which pictures the mesher actually believes each face of a voxel wears.
// Answers the "why is that face that colour" question without rebuilding the
// palette by hand: it walks the voxel's geometry record and prints the face →
// texture-input bindings the mesh will bake.
Threads.registerTask("voxel-dbg", (name) => {
  const V = VoxelLUT, G = GeometryLUT;
  const pal = V.voxelIds._palette || [];
  const i = pal.indexOf(name);
  if (i < 0) return ["no-voxel", pal.filter(p => String(p).includes(name) || String(name).includes(p)).slice(0, 8)];
  const gidx = V.geometryIndex[i];
  const direct = G.geometryInputs[gidx];
  const indirect = G.geometryInputs[G.geometryInputsIndex[gidx]];
  const nodes = G.compiledGeometry[gidx];
  return [[i, gidx, nodes && nodes.length, direct, indirect]];
});
