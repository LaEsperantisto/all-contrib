// Shared voxel-LUT repair, run in every thread that touches voxel ids.
//
// vlox's thread sync passes the imported palette (builtins + every published
// block) but assigns the positional tables - voxelIdToTrueId, modelsIndex,
// totalStates, voxelRecordStartIndex, VoxelTags - verbatim from the sender's
// arrays. Names the terrain never generates (published blocks, the builtin
// beacon) therefore arrive as palette entries with no encode: their record slot
// reads 0. Every consumer decodes that as air or as nothing:
//   - Brush.paint writes 0 with no error, so a placement silently writes air;
//   - the mesher dies reading `dve_is_transparent` off an undefined VoxelTags
//     entry, and once tags exist it dies again in BuildVoxelBase reading
//     `geomtries.length` off an undefined GeometryLUT row, so any section
//     holding one of those voxels never reaches the renderer and the block
//     stays invisible in front of the player.
//
// The repair mirrors what is missing from a same-name entry and allocates the
// composite ids it cannot mirror in palette order. Threads start from the same
// synced palette, so running it in each of them yields the same ids: main,
// world, generator and mesher must all run it, or the bytes one thread writes
// are unreadable to the others.
import { VoxelLUT } from "@divinevoxel/vlox/Voxels/Data/VoxelLUT";
import { VoxelTagsRegister } from "@divinevoxel/vlox/Voxels/Data/VoxelTagsRegister";
import { Threads } from "@amodx/threads";
import { BuildTagAndPaletteData } from "@divinevoxel/vlox/Voxels/Functions/BuildTagData";

// Give `trueId` a composite voxel id that decodes back to its own name. Reuse
// any composite that already decodes to this trueId; otherwise allocate one at
// the end of the composite-id space the way vlox's own BuildLUTs does.
//
// The composite count is a stride: geometryIndex/geometryInputsIndex are laid
// out as `composite + relationalId * totalVoxelIds` (BuildLUTs sizes them
// totalVoxelIds * totalRelationalVoxelIds), and the relational tables are that
// long. Appending an id therefore shifts every existing lookup, so the tables
// are re-permuted to the new stride and the new row copies `mirrorComposite`'s
// - the healed voxel shares the mirrored entry's model, so it shares its
// geometry rows.
export function ensureRecord(trueId, mirrorComposite = 0) {
  const V = VoxelLUT;
  const name = V.voxelIds._palette[trueId];
  if (!name) return false;
  let composite = 0;
  for (let c = 1; c < V.voxelIdToTrueId.length; c++) if (V.voxelIdToTrueId[c] === trueId) { composite = c; break; }
  if (!composite) {
    const t0 = V.totalVoxelIds, t1 = t0 + 1;
    const growIds = (arr) => { const a = new arr.constructor(Math.max(t1, arr.length + 16)); a.set(arr); return a; };
    V.voxelIdToTrueId = growIds(V.voxelIdToTrueId);
    V.voxelIdToState = growIds(V.voxelIdToState);
    V.voxelIdToMod = growIds(V.voxelIdToMod);
    V.voxelIdToTrueId[t0] = trueId;
    V.totalVoxelIds = t1;
    composite = t0;
    const rel = V.totalRelationalVoxelIds || 1;
    for (const key of ["geometryIndex", "geometryInputsIndex"]) {
      const old = V[key];
      const next = new old.constructor(t1 * rel);
      if (old) {
        for (let r = 0; r < rel; r++)
          for (let c = 0; c < t0 && c + r * t0 < old.length; c++) next[c + r * t1] = old[c + r * t0];
        for (let r = 0; r < rel && mirrorComposite + r * t0 < old.length; r++)
          next[t0 + r * t1] = old[mirrorComposite + r * t0];
      }
      V[key] = next;
    }
    for (const key of ["relationalVoxelIdToTrueId", "relationalVoxelIdToState", "relationalVoxelIdToMod", "relationalVoxelRecord"]) {
      const old = V[key];
      if (!old) continue;
      const next = new old.constructor(Math.max(t1, old.length + 16));
      next.set(old);
      V[key] = next;
    }
  }
  const start = V.voxelRecord.length;
  const rec = new V.voxelRecord.constructor(start + 1);
  rec.set(V.voxelRecord);
  rec[start] = composite;
  V.voxelRecord = rec;
  if (V.voxelRecordStartIndex.length <= trueId) {
    const rs = new V.voxelRecordStartIndex.constructor(trueId + 8);
    rs.set(V.voxelRecordStartIndex);
    V.voxelRecordStartIndex = rs;
  }
  V.voxelRecordStartIndex[trueId] = start;
  return true;
}

// Repair this thread's palette: mirror missing LUT entries from the real
// (imported) slot of the same name, and rebuild VoxelTags entries the sync left
// out. Worker threads pre-register vlox builtin voxel ids (dve_* and defaults)
// before sync-data's load() appends the imported palette, so imported ids live
// at an offset; polluted runtime ids sit past both.
//
// Palette pollution: threads auto-register duplicate ids past the imported ones
// (brush/sim string lookups), but the encoding tables only cover the imported
// prefix. Brush.paint then reads voxelModMaps[i] -> undefined and throws,
// wedging paint-voxel tasks (locks never released). Duplicate each polluted
// id's encoding onto its original: same model/state/mod maps and a record entry
// pointing at the original composite voxel id, so raw bytes stay identical to
// what generators and the mesher already understand.
export function healVoxelTags() {
  const pal = VoxelLUT.voxelIds._palette || [];
  const first = {};
  for (let i = 0; i < pal.length; i++) if (pal[i] && first[pal[i]] === undefined) first[pal[i]] = i;
  let n = 0;
  let recExtra = [];
  // An entry is only usable if its record slot holds a composite voxel id that
  // decodes back to the same palette name. An entry that passes the shape check
  // but fails this one makes Brush.paint write 0 (air): no throw, no error, the
  // block is simply not in the world.
  const roundTrips = (i) => {
    const rs = VoxelLUT.voxelRecordStartIndex[i];
    if (!(rs > 0)) return false;
    try { return VoxelLUT.voxelIds.getStringId(VoxelLUT.voxelRecord[rs]) === VoxelLUT.voxelIds._palette[i]; } catch { return false; }
  };
  for (let i = 0; i < pal.length; i++) {
    const name = pal[i];
    if (!name) continue;
    const complete = VoxelLUT.voxelModMaps[i] && VoxelLUT.modelsIndex[i] !== undefined &&
      (VoxelLUT.voxelRecordStartIndex[i] > 0 || (i === 0 && VoxelLUT.voxelRecordStartIndex.length > i)) && VoxelLUT.totalStates[i] &&
      (i === 0 || roundTrips(i));
    if (complete) continue;
    const m = first[name];
    if (m === undefined || m === i) { if (!roundTrips(i)) ensureRecord(i, VoxelLUT.voxelRecord[VoxelLUT.voxelRecordStartIndex[i]] || 0); continue; }
    VoxelLUT.voxelModMaps[i] = new Map([[0, 0]]);
    VoxelLUT.voxelRelationalModMaps[i] = new Map([[0, 0]]);
    VoxelLUT.modelsIndex[i] = VoxelLUT.modelsIndex[m];
    if (VoxelLUT.totalStates.length <= i) {
      const grow = (arr, Ctor) => { const a = new Ctor(Math.max(i + 1, arr.length + 8)); a.set(arr); return a; };
      VoxelLUT.totalStates = grow(VoxelLUT.totalStates, Uint16Array);
      VoxelLUT.totalMods = grow(VoxelLUT.totalMods, Uint16Array);
      VoxelLUT.voxelRecordStartIndex = grow(VoxelLUT.voxelRecordStartIndex, Uint32Array);
      VoxelLUT.relationalVoxelRecordStartIndex = grow(VoxelLUT.relationalVoxelRecordStartIndex, Uint16Array);
    }
    VoxelLUT.totalStates[i] = VoxelLUT.totalStates[m];
    VoxelLUT.totalMods[i] = VoxelLUT.totalMods[m];
    if (VoxelLUT.relationalVoxelRecordStartIndex.length > i)
      VoxelLUT.relationalVoxelRecordStartIndex[i] = VoxelLUT.relationalVoxelRecordStartIndex[m];
    if (!(VoxelLUT.voxelRecordStartIndex[i] > 0)) {
      VoxelLUT.voxelRecordStartIndex[i] = VoxelLUT.voxelRecord.length + recExtra.length;
      recExtra.push(VoxelLUT.voxelRecord[VoxelLUT.voxelRecordStartIndex[m]]);
    }
    if (VoxelTagsRegister.VoxelTags[m] && !VoxelTagsRegister.VoxelTags[i])
      VoxelTagsRegister.VoxelTags[i] = VoxelTagsRegister.VoxelTags[m];
    if (!roundTrips(i)) ensureRecord(i, VoxelLUT.voxelRecord[VoxelLUT.voxelRecordStartIndex[m]] || 0);
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
  // The imported positional tables are main's, so their composite voxel ids are
  // main's numbering, while the palette slots they describe are the appended
  // ones (off..). Point every imported composite at its palette-aligned slot and
  // duplicate the trueId-keyed encoding onto the composite index as well: vlox
  // reads modelsIndex (and the rest) by COMPOSITE id while meshing
  // (VoxelGeometryBuilderCacheSpace.hashState), so an id that decodes but has no
  // entry at its own index aborts the whole section build, and a thread that
  // invents its own composites writes ids the other threads read as something
  // else entirely. No allocation happens here: the ids already exist.
  const growTo = (arr, need) => {
    if (arr && arr.length > need) return arr;
    const a = new arr.constructor(Math.max(need + 1, arr.length + 8));
    a.set(arr);
    return a;
  };
  const trueKeyed = ["modelsIndex", "voxelModMaps", "voxelRelationalModMaps", "totalStates", "totalMods",
    "totalReltionalStates", "totalReltionalMods", "voxelRecordStartIndex", "relationalVoxelRecordStartIndex"];
  for (let j = 0; j < srcIds.length; j++) {
    const slot = off + j;
    const rs = V.voxelRecordStartIndex[j];
    if (!(rs > 0) || !V.voxelRecord) continue;
    const c = V.voxelRecord[rs];
    if (!c || c >= V.totalVoxelIds) continue;
    V.voxelIdToTrueId[c] = slot;
    for (const key of trueKeyed) {
      if (!V[key]) continue;
      if (V[key].length <= c) V[key] = growTo(V[key], c);
      if (V[key][slot] === undefined && V[key][j] !== undefined) V[key][c] = V[key][j];
      else V[key][c] = V[key][slot];
    }
    if (VoxelTagsRegister.VoxelTags[slot] && !VoxelTagsRegister.VoxelTags[c])
      VoxelTagsRegister.VoxelTags[c] = VoxelTagsRegister.VoxelTags[slot];
  }
  return true;
}
// vlox registers its own "sync-data" handler inside StartWorld/StartMesher/
// StartGenerator; patch registerTask before that starts so the palette shift
// and the encode repair run the instant the payload lands in every thread.
export function installLUTSync(onError = null) {
  const rt = Threads.registerTask.bind(Threads);
  Threads.registerTask = (id, fn) => id === "sync-data"
    ? rt(id, (data) => {
        const r = fn(data);
        try { shiftLUTToPalette(data); } catch (e) { if (onError) onError(e); }
        try { healVoxelTags(); } catch (e) { if (onError) onError(e); }
        return r;
      })
    : rt(id, fn);
}
