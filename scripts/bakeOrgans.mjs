// Offline bake: surface-sample each binary STL into a compact, normalized point cloud.
// Source STLs live in assets/stl/ (gitignored, large). Output .bin files ship in public/organs/.
// Each .bin is a little-endian Float32Array of length COUNT*3 (x,y,z interleaved),
// centered at the bbox center and scaled so the longest axis == 1.0 (runtime scales up).
// Points are deterministically shuffled so any prefix is a representative subset
// (lets the runtime use a smaller slice on mobile without clustering artifacts).
//
// Run: node scripts/bakeOrgans.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const COUNT = 42000;

// Per-organ orientation fix applied to each sampled point BEFORE centering/
// scaling, so each organ sits anatomically upright (superior → +Y, anterior
// roughly → +Z) and spins correctly around the vertical axis.
//   - heart, liver: authored upright already → identity.
//   - brain: native model has superior–inferior along Z (it lies on its side);
//     cyclic remap (x,y,z)→(y,z,x) is a proper rotation (det +1, no mirror)
//     that puts SI on +Y, the hemispheres split across X, and AP on Z.
const ORIENT = {
  brain: (x, y, z) => [y, z, x],
};

const ORGANS = [
  { id: "heart", src: "assets/stl/heart.stl" },
  { id: "brain", src: "assets/stl/brain.stl" },
  { id: "liver", src: "assets/stl/liver.stl" },
];

// deterministic PRNG (mulberry32) — identical bake every run
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// parse binary STL → Float32Array of triangle vertices (9 floats per tri)
function parseBinarySTL(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const triCount = dv.getUint32(80, true);
  const verts = new Float32Array(triCount * 9);
  let o = 84;
  for (let i = 0; i < triCount; i++) {
    o += 12; // skip normal
    for (let v = 0; v < 9; v++) {
      verts[i * 9 + v] = dv.getFloat32(o, true);
      o += 4;
    }
    o += 2; // attribute byte count
  }
  return { verts, triCount };
}

function bake(id, srcRel) {
  const orient = ORIENT[id];
  const buf = readFileSync(join(ROOT, srcRel));
  const { verts, triCount } = parseBinarySTL(buf);

  // per-triangle area + cumulative table
  const cum = new Float64Array(triCount);
  let total = 0;
  for (let i = 0; i < triCount; i++) {
    const b = i * 9;
    const ax = verts[b], ay = verts[b + 1], az = verts[b + 2];
    const bx = verts[b + 3], by = verts[b + 4], bz = verts[b + 5];
    const cx = verts[b + 6], cy = verts[b + 7], cz = verts[b + 8];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const crx = e1y * e2z - e1z * e2y;
    const cry = e1z * e2x - e1x * e2z;
    const crz = e1x * e2y - e1y * e2x;
    total += 0.5 * Math.hypot(crx, cry, crz);
    cum[i] = total;
  }

  const rand = mulberry32(0x9e3779b1 ^ (triCount * 2654435761));
  const pts = new Float32Array(COUNT * 3);

  // binary search the cumulative-area table
  const pick = (r) => {
    const t = r * total;
    let lo = 0, hi = triCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < COUNT; i++) {
    const tri = pick(rand());
    const b = tri * 9;
    let u = rand(), v = rand();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    let x = w * verts[b] + u * verts[b + 3] + v * verts[b + 6];
    let y = w * verts[b + 1] + u * verts[b + 4] + v * verts[b + 7];
    let z = w * verts[b + 2] + u * verts[b + 5] + v * verts[b + 8];
    if (orient) [x, y, z] = orient(x, y, z);
    pts[i * 3] = x; pts[i * 3 + 1] = y; pts[i * 3 + 2] = z;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  // center + scale longest axis to 1.0
  const cX = (minX + maxX) / 2, cY = (minY + maxY) / 2, cZ = (minZ + maxZ) / 2;
  const longest = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const s = 1 / longest;
  for (let i = 0; i < COUNT; i++) {
    pts[i * 3] = (pts[i * 3] - cX) * s;
    pts[i * 3 + 1] = (pts[i * 3 + 1] - cY) * s;
    pts[i * 3 + 2] = (pts[i * 3 + 2] - cZ) * s;
  }

  // Fisher–Yates shuffle (point triplets) so any prefix is representative
  for (let i = COUNT - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    for (let k = 0; k < 3; k++) {
      const a = i * 3 + k, b = j * 3 + k;
      const tmp = pts[a]; pts[a] = pts[b]; pts[b] = tmp;
    }
  }

  mkdirSync(join(ROOT, "public/organs"), { recursive: true });
  writeFileSync(join(ROOT, `public/organs/${id}.bin`), Buffer.from(pts.buffer));

  // sanity
  let nan = 0;
  for (let i = 0; i < pts.length; i++) if (!Number.isFinite(pts[i])) nan++;
  const dims = `${(maxX - minX).toFixed(2)} x ${(maxY - minY).toFixed(2)} x ${(maxZ - minZ).toFixed(2)}`;
  console.log(`${id}: tris=${triCount} pts=${COUNT} srcDims=${dims} → ${(pts.byteLength / 1024).toFixed(0)}KB nan=${nan}`);
}

for (const o of ORGANS) bake(o.id, o.src);
console.log("bake complete →", join(ROOT, "public/organs"));
