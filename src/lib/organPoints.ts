import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

/** World-space height of the longest organ axis. Shared by heart and brain. */
export const ORGAN_HEIGHT = 7.0;

/* ------------------------------------------------------------------ */
/* Heart: streamed STL fetch + area-weighted surface sampling          */
/* ------------------------------------------------------------------ */

/**
 * Fetches an STL and surface-samples it to `count` points.
 *
 * Triangles are area-weighted (cumulative-area table + binary search),
 * each point barycentric-sampled on its triangle. Output is recentered
 * to the origin and uniformly scaled so the longest bounding-box axis
 * equals ORGAN_HEIGHT.
 *
 * Progress: 0-70 during download, 70-80 during parse/precompute,
 * 80-100 during sampling. Sampling yields to the event loop between
 * chunks so a progress UI can repaint.
 */
export async function loadHeartTargets(
  url: string,
  count: number,
  onProgress?: (pct: number) => void,
): Promise<Float32Array> {
  const report = (pct: number) => {
    if (onProgress) onProgress(Math.max(0, Math.min(100, Math.round(pct))));
  };

  report(0);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`failed to fetch specimen (${res.status})`);
  }

  // Stream the body so we can report download progress.
  let buffer: ArrayBuffer;
  const lengthHeader = res.headers.get("content-length");
  const total = lengthHeader ? parseInt(lengthHeader, 10) : 0;

  if (res.body) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        if (total > 0) {
          // content-length can be the compressed size; never overshoot.
          report(Math.min(70, (received / total) * 70));
        } else {
          // Unknown total: creep toward 70 without reaching it.
          report(Math.min(69, (received / 8_000_000) * 70));
        }
      }
    }
    const data = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    buffer = data.buffer;
  } else {
    buffer = await res.arrayBuffer();
  }
  report(70);

  // Parse (handles both binary and ascii STL).
  const loader = new STLLoader();
  const geo = loader.parse(buffer);
  const posAttr = geo.getAttribute("position");
  const verts = posAttr.array as Float32Array;
  const triCount = (posAttr.count / 3) | 0;
  if (triCount === 0) {
    geo.dispose();
    throw new Error("specimen file contains no geometry");
  }
  report(74);

  // Bounding box for recenter + scale.
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < verts.length; i += 3) {
    const x = verts[i],
      y = verts[i + 1],
      z = verts[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const longest = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const scale = longest > 0 ? ORGAN_HEIGHT / longest : 1;

  // Cumulative triangle areas for weighted sampling.
  const cum = new Float32Array(triCount);
  let acc = 0;
  for (let t = 0; t < triCount; t++) {
    const i = t * 9;
    const ax = verts[i],
      ay = verts[i + 1],
      az = verts[i + 2];
    const abx = verts[i + 3] - ax,
      aby = verts[i + 4] - ay,
      abz = verts[i + 5] - az;
    const acx2 = verts[i + 6] - ax,
      acy2 = verts[i + 7] - ay,
      acz2 = verts[i + 8] - az;
    const nx = aby * acz2 - abz * acy2;
    const ny = abz * acx2 - abx * acz2;
    const nz = abx * acy2 - aby * acx2;
    acc += Math.sqrt(nx * nx + ny * ny + nz * nz) * 0.5;
    cum[t] = acc;
  }
  const totalArea = acc;
  if (!(totalArea > 0)) {
    geo.dispose();
    throw new Error("specimen geometry is degenerate");
  }
  report(80);

  // Binary search into the cumulative-area table.
  const pickTri = (r: number): number => {
    const target = r * totalArea;
    let lo = 0;
    let hi = triCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const out = new Float32Array(count * 3);
  const CHUNK = 5000;
  for (let start = 0; start < count; start += CHUNK) {
    const end = Math.min(count, start + CHUNK);
    for (let p = start; p < end; p++) {
      const i = pickTri(Math.random()) * 9;
      // Uniform barycentric coordinates.
      let u = Math.random();
      let v = Math.random();
      if (u + v > 1) {
        u = 1 - u;
        v = 1 - v;
      }
      const w = 1 - u - v;
      const x = w * verts[i] + u * verts[i + 3] + v * verts[i + 6];
      const y = w * verts[i + 1] + u * verts[i + 4] + v * verts[i + 7];
      const z = w * verts[i + 2] + u * verts[i + 5] + v * verts[i + 8];
      const o = p * 3;
      out[o] = (x - cx) * scale;
      out[o + 1] = (y - cy) * scale;
      out[o + 2] = (z - cz) * scale;
    }
    report(80 + (end / count) * 20);
    if (end < count) {
      // Let the loading UI repaint.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  geo.dispose();
  report(100);
  return out;
}

/* ------------------------------------------------------------------ */
/* Brain: procedural hemispheres + ridged-noise gyri                   */
/* ------------------------------------------------------------------ */

/** Deterministic PRNG so the brain is identical on every visit. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer-lattice hash to [0,1). */
function hash3(ix: number, iy: number, iz: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth trilinear value noise in [-1, 1]. */
function valueNoise(x: number, y: number, z: number): number {
  const fx = Math.floor(x),
    fy = Math.floor(y),
    fz = Math.floor(z);
  let tx = x - fx,
    ty = y - fy,
    tz = z - fz;
  // smoothstep weights -- keeps the surface lumpy, never spiky
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  tz = tz * tz * (3 - 2 * tz);

  const c000 = hash3(fx, fy, fz);
  const c100 = hash3(fx + 1, fy, fz);
  const c010 = hash3(fx, fy + 1, fz);
  const c110 = hash3(fx + 1, fy + 1, fz);
  const c001 = hash3(fx, fy, fz + 1);
  const c101 = hash3(fx + 1, fy, fz + 1);
  const c011 = hash3(fx, fy + 1, fz + 1);
  const c111 = hash3(fx + 1, fy + 1, fz + 1);

  const x00 = c000 + (c100 - c000) * tx;
  const x10 = c010 + (c110 - c010) * tx;
  const x01 = c001 + (c101 - c001) * tx;
  const x11 = c011 + (c111 - c011) * tx;
  const y0 = x00 + (x10 - x00) * ty;
  const y1 = x01 + (x11 - x01) * ty;
  return (y0 + (y1 - y0) * tz) * 2 - 1;
}

/**
 * Ridged fbm in roughly [0, 1]: creases read as sulci between gyri.
 * 4 octaves, lacunarity ~2, gain 0.5.
 */
function ridgedFbm(x: number, y: number, z: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < 4; o++) {
    const n = valueNoise(x * freq + o * 19.19, y * freq, z * freq);
    let r = 1 - Math.abs(n);
    r = r * r;
    sum += r * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

/**
 * Procedural brain point cloud, `count * 3` positions centered at origin.
 *
 * Two ellipsoid hemispheres (overall ~1.1 x 0.9 x 1.35 proportions,
 * height ~ORGAN_HEIGHT * 0.82) split by a midline gap, surface displaced
 * along normals with ridged fbm to suggest gyri, a cerebellum bulge
 * lower-rear, and a flattened underside. Axes: x width, y height,
 * z length (front +z, rear -z).
 */
export function generateBrainTargets(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  const rand = mulberry32(0xc0ffee);

  // Overall proportions 1.1 x 0.9 x 1.35; height = ORGAN_HEIGHT * 0.82.
  const height = ORGAN_HEIGHT * 0.82;
  const S = height / 0.9; // master scale
  const halfW = (1.1 * S) / 2;
  const halfH = (0.9 * S) / 2;
  const halfL = (1.35 * S) / 2;

  const gap = 0.05 * S; // interhemispheric fissure width on x
  // Each hemisphere spans x in [gap/2, halfW].
  const rx = (halfW - gap / 2) / 2;
  const hemiCx = gap / 2 + rx;
  const ry = halfH;
  const rz = halfL;

  // Gyri noise: lumpy-organic, feature size ~0.8 world units.
  const gyriFreq = 1.25;
  const gyriAmp = 0.07 * S;

  // Cerebellum: wide flattened ellipsoid, lower-rear, finer striation.
  const cbCount = Math.floor(count * 0.12);
  const cerebrumCount = count - cbCount;
  const cbCy = -halfH * 0.62;
  const cbCz = -halfL * 0.62;
  const cbRx = halfW * 0.6;
  const cbRy = halfH * 0.34;
  const cbRz = halfL * 0.3;
  const cbFreq = gyriFreq * 2.6;
  const cbAmp = 0.035 * S;

  // Underside flattening (cerebrum only): the lower pole is pulled in to
  // ~0.58 * ry, progressively with depth, so density stays even.
  const flatten = 0.42;

  // Bookkeeping for final recentering.
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  /**
   * Uniform-ish direction on an ellipsoid via area-weighted rejection.
   * Writes a unit sphere direction into dirOut[0..2].
   */
  const dirOut = [0, 0, 0];
  const sampleEllipsoidDir = (a: number, b: number, c: number): void => {
    const wMax = Math.max(b * c, Math.max(a * c, a * b));
    for (let attempt = 0; attempt < 16; attempt++) {
      const u = rand() * 2 - 1; // cos(theta)
      const phi = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const dx = s * Math.cos(phi);
      const dy = u;
      const dz = s * Math.sin(phi);
      const gx = b * c * dx;
      const gy = a * c * dy;
      const gz = a * b * dz;
      const g = Math.sqrt(gx * gx + gy * gy + gz * gz);
      if (rand() * wMax <= g || attempt === 15) {
        dirOut[0] = dx;
        dirOut[1] = dy;
        dirOut[2] = dz;
        return;
      }
    }
  };

  for (let p = 0; p < count; p++) {
    let x: number;
    let y: number;
    let z: number;

    if (p < cerebrumCount) {
      // Alternate hemispheres for an even, morph-stable split.
      const side = (p & 1) === 0 ? 1 : -1;
      sampleEllipsoidDir(rx, ry, rz);
      const dx = dirOut[0],
        dy = dirOut[1],
        dz = dirOut[2];

      // Point on hemisphere ellipsoid (local; medial side is lx < 0).
      // Flatten the underside smoothly: compress y below the equator.
      let yScale = 1;
      if (dy < 0) {
        const s = -dy; // 0 at equator, 1 at lower pole
        const smooth = s * s * (3 - 2 * s);
        yScale = 1 - flatten * smooth;
      }
      const lx = rx * dx;
      const ly = ry * dy * yScale;
      const lz = rz * dz;

      // Ellipsoid surface normal direction.
      let nx = dx / rx,
        ny = dy / ry,
        nz = dz / rz;
      const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= nLen;
      ny /= nLen;
      nz /= nLen;

      // Ridged gyri displacement, sampled in hemisphere-local space so the
      // two hemispheres carry mirrored folds (like a real brain).
      const ridge = ridgedFbm(lx * gyriFreq, ly * gyriFreq, lz * gyriFreq);
      // Center the ridge band so the mean surface stays on the ellipsoid.
      const disp = (ridge - 0.55) * 2 * gyriAmp;

      let wx = lx + hemiCx + nx * disp;
      // Keep the interhemispheric fissure clean: never let noise push a
      // point across the midline gap.
      const wall = gap / 2;
      if (wx < wall) wx = wall + (wall - wx) * 0.25;

      x = wx * side;
      y = ly + ny * disp * yScale;
      z = lz + nz * disp;
    } else {
      // Cerebellum: single wide lobe, finer horizontal striations.
      sampleEllipsoidDir(cbRx, cbRy, cbRz);
      const dx = dirOut[0],
        dy = dirOut[1],
        dz = dirOut[2];
      let nx = dx / cbRx,
        ny = dy / cbRy,
        nz = dz / cbRz;
      const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= nLen;
      ny /= nLen;
      nz /= nLen;

      const lx = cbRx * dx;
      const ly = cbRy * dy;
      const lz = cbRz * dz;
      // Bias frequency vertically: folia run as horizontal bands.
      const ridge = ridgedFbm(lx * cbFreq * 0.5, ly * cbFreq * 1.6, lz * cbFreq * 0.5);
      const disp = (ridge - 0.55) * 2 * cbAmp;

      x = lx + nx * disp;
      y = cbCy + ly + ny * disp;
      z = cbCz + lz + nz * disp;
    }

    const o = p * 3;
    out[o] = x;
    out[o + 1] = y;
    out[o + 2] = z;

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  // Recenter on the bounding box so the morph pivots around the same origin.
  const ox = (minX + maxX) * 0.5;
  const oy = (minY + maxY) * 0.5;
  const oz = (minZ + maxZ) * 0.5;
  for (let p = 0; p < count; p++) {
    const o = p * 3;
    out[o] -= ox;
    out[o + 1] -= oy;
    out[o + 2] -= oz;
  }

  return out;
}
