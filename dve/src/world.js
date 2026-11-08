// Shared between the DVE main glue and its generator worker.
//
// World model v2: a Minecraft-style 3D world. The server generates base
// terrain from the deterministic functions below (backend/src/terrain.ts is
// the authoritative twin — keep them integer-identical) and stores only
// player edits. y GROWS UPWARD from the bedrock floor at y=0.

// The prototype world is a walkable 256x256 column field, 32 tall — far
// larger than vlox's generator radius budget (render 48 / gen 64 / max 80),
// so only the area around the player exists: the generator focus follows the
// player and chunks stream in and out as they walk (see world.worker.js
// "move-generator").
export const SLAB = {
  X0: -128,
  X1: 128, // exclusive
  Y0: 0,
  Y1: 32, // exclusive
  Z0: -128,
  Z1: 128, // exclusive
};

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

const mod = (n, m) => ((n % m) + m) % m;

// MUST match backend/src/terrain.ts exactly (integer-only arithmetic).
function noise2(x, z, s) {
  const gx = Math.floor(x / s);
  const gz = Math.floor(z / s);
  const wx = Math.floor((mod(x, s) * 8) / s);
  const wz = Math.floor((mod(z, s) * 8) / s);
  const c = (ix, iz) => hashU32((ix * 0x27d4eb2d) ^ (iz * 0x165667b1) ^ 0x51ed2701) % 16;
  const a = c(gx, gz) * (8 - wx) * (8 - wz);
  const b = c(gx + 1, gz) * wx * (8 - wz);
  const d = c(gx, gz + 1) * (8 - wx) * wz;
  const e = c(gx + 1, gz + 1) * wx * wz;
  return (a + b + d + e) / 64;
}

export function heightAt(x, z) {
  const sum =
    6 * noise2(x, z, 24) +
    3 * noise2(x, z, 12) +
    2 * noise2(x, z, 6) +
    noise2(x, z, 3);
  return 6 + Math.floor(sum / 12);
}

function hasTree(x, z) {
  return hashU32((x * 0x9e3779b1) ^ (z * 0x85ebca77) ^ 0x2545f491) % 40 === 0;
}

function caveAt(x, y, z) {
  const s = 8;
  const gx = Math.floor(x / s);
  const gy = Math.floor(y / s);
  const gz = Math.floor(z / s);
  const wx = mod(x, s), wy = mod(y, s), wz = mod(z, s);
  const c = (ix, iy, iz) =>
    hashU32((ix * 0x1b873593) ^ (iy * 0xcc9e2d51) ^ (iz * 0x165667b1) ^ 0x9e3779b3) % 16;
  const n =
    c(gx, gy, gz) * (8 - wx) * (8 - wy) * (8 - wz) +
    c(gx + 1, gy, gz) * wx * (8 - wy) * (8 - wz) +
    c(gx, gy + 1, gz) * (8 - wx) * wy * (8 - wz) +
    c(gx + 1, gy + 1, gz) * wx * wy * (8 - wz) +
    c(gx, gy, gz + 1) * (8 - wx) * (8 - wy) * wz +
    c(gx + 1, gy, gz + 1) * wx * (8 - wy) * wz +
    c(gx, gy + 1, gz + 1) * (8 - wx) * wy * wz +
    c(gx + 1, gy + 1, gz + 1) * wx * wy * wz;
  return n / 512 > 11;
}

export function baseBlock(x, y, z) {
  if (y < 0 || y >= SLAB.Y1) return "air";
  if (y === 0) return "builtin:bedrock";
  const h = heightAt(x, z);
  if (y > h) {
    if (hasTree(x, z) && y <= h + 5) return "builtin:wood"; // trunk
    // The crown sits on top of the trunk: the point that used to be empty
    // directly above the trunk is now two leaves of crown, one level higher
    // than the old canopy top.
    if (hasTree(x, z) && (y === h + 6 || y === h + 7)) return "builtin:leaves";
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (dx === 0 && dz === 0) continue;
        if (Math.abs(dx) + Math.abs(dz) > 2) continue;
        if (!hasTree(x + dx, z + dz)) continue;
        const h2 = heightAt(x + dx, z + dz);
        if (y >= h2 + 4 && y <= h2 + 6) return "builtin:leaves";
      }
    }
    return "air";
  }
  if (y < h && caveAt(x, y, z) && y > 1) return "air";
  if (y === h) return "builtin:grass";
  if (y >= h - 3) return "builtin:dirt";
  return "builtin:stone";
}
