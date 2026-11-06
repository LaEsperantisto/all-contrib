// Shared between the DVE main glue and its generator worker.
//
// The server world is a 2D grid (x, y-down, see backend/src/terrain.ts).
// The 3D view extrudes that grid into a slab: x3d = x2d, y3d = Y1-1-y2d
// (so "up" is up in 3D), z3d in [0, DEPTH). Player edits apply across the
// whole depth — the 3D view is a cross-section of the same data the 2D
// canvas shows, not a separate world.

export const SLAB = {
  X0: -64,
  X1: 64,   // exclusive; X1-X0 must stay * Y1 = 4096 (world API window cap)
  Y0: 0,
  Y1: 32,
  DEPTH: 16,
};

export const y3d = y2d => SLAB.Y1 - 1 - y2d;
export const y2d = y3 => SLAB.Y1 - 1 - y3;

// Voxel ids must not contain ":" (that separates named atlas tiles in vlox
// texture ids), so block ids are namespaced with "__".
export const voxelIdFor = blockId => blockId.replace(/:/g, "__");

function hashU32(n) {
  n = (n | 0) ^ 0x9e3779b9;
  n = Math.imul(n, 0x85ebca6b);
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35);
  n ^= n >>> 16;
  return n >>> 0;
}

// MUST match backend/src/terrain.ts and the app.js mirror exactly.
export function terrainHeight(x) {
  return 10 + (hashU32(Math.floor(x / 4) ^ 0x51ed2701) % 6);
}
export function baseBlock(x, y) {
  const h = terrainHeight(x);
  if (y < h) return "air";
  if (y === h) return "builtin:grass";
  if (y <= h + 3) return "builtin:dirt";
  return "builtin:stone";
}
