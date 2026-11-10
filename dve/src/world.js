// Shared between the DVE main glue and its generator worker.
//
// World model v2: a Minecraft-style 3D world. The server generates base
// terrain from the deterministic functions below (backend/src/terrain.ts is
// the authoritative twin — keep them integer-identical) and stores only
// player edits. y GROWS UPWARD from the bedrock floor at y=0.

// The world is infinite: the server accepts x/z to ±1,000,000 and base
// terrain is pure functions of (x,z) everywhere. What the client holds is a
// MOVING WINDOW — a 256-cell slab that follows the player in 16-cell steps —
// and far larger than vlox's generator radius budget (render 48 / gen 64 /
// max 80), so within the window only the area around the player exists: the
// generator focus follows the player and chunks stream in and out as they
// walk (see world.worker.js "move-generator"). Every importer reads the same
// SLAB object; shiftWindow mutates its four bounds and nobody else has to
// know the world moved.
export const SLAB = {
  X0: -128,
  X1: 128, // exclusive
  Y0: 0,
  Y1: 64, // exclusive
  Z0: -128,
  Z1: 128, // exclusive
};
export const WINDOW = { ox: -128, oz: -128, span: 256 };

// Snap the window so its left/near edge sits generationRadius (96) behind
// the player: the active ring is always fully inside it, and the far margin
// (256-96=160) keeps it inside while the player walks forward.
export function windowOriginFor(px, pz) {
  return [16 * Math.floor(px / 16) - 96, 16 * Math.floor(pz / 16) - 96];
}

// Returns true when the window actually moved.
export function shiftWindow(ox, oz) {
  if (ox === WINDOW.ox && oz === WINDOW.oz) return false;
  WINDOW.ox = ox;
  WINDOW.oz = oz;
  SLAB.X0 = ox;
  SLAB.X1 = ox + WINDOW.span;
  SLAB.Z0 = oz;
  SLAB.Z1 = oz + WINDOW.span;
  return true;
}

export const SEA_LEVEL = 10; // columns with heightAt < this flood up to y=SEA_LEVEL

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
    // Sea: flooded columns fill with still water up to SEA_LEVEL. The sea is
    // static — no flow simulation. Trees never sit in the sea (gated below),
    // so a flooded column is pure water over its floor.
    if (h < SEA_LEVEL && y <= SEA_LEVEL) return "builtin:water";
    if (h >= SEA_LEVEL && hasTree(x, z) && y <= h + 5) return "builtin:wood"; // trunk
    // The crown sits on top of the trunk: the point that used to be empty
    // directly above the trunk is now two leaves of crown, one level higher
    // than the old canopy top.
    if (h >= SEA_LEVEL && hasTree(x, z) && (y === h + 6 || y === h + 7)) return "builtin:leaves";
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (dx === 0 && dz === 0) continue;
        if (Math.abs(dx) + Math.abs(dz) > 2) continue;
        if (!hasTree(x + dx, z + dz)) continue;
        const h2 = heightAt(x + dx, z + dz);
        if (h2 < SEA_LEVEL) continue; // no canopy over the sea
        if (y >= h2 + 4 && y <= h2 + 6) return "builtin:leaves";
      }
    }
    return "air";
  }
  if (y < h && caveAt(x, y, z) && y > 1) return "air";
  if (y === h) return h < SEA_LEVEL ? "builtin:sand" : "builtin:grass"; // beaches
  if (y >= h - 3) return "builtin:dirt";
  return "builtin:stone";
}
