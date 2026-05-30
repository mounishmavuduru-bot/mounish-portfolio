import * as THREE from "three";
import { STLLoader } from "three-stdlib";

export interface HeartCloud {
  geometry: THREE.BufferGeometry;
  pointCount: number;
}

/**
 * Loads an STL, surface-samples it to a point cloud.
 *
 * Triangles are area-weighted; each point is barycentric-sampled on its triangle.
 * Result is recentered + scaled to fit a target height in local units, then rotated
 * so the apex points down (the NIH3D heart STL is authored with the long axis
 * along +Y but tilted; minor adjustment quaternion handles that).
 */
export async function loadHeartCloud(
  url: string,
  count = 14000,
  targetHeight = 1.7,
): Promise<HeartCloud> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const loader = new STLLoader();
  const geo = loader.parse(buf);

  // recenter + scale + reorient
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = new THREE.Vector3();
  bb.getSize(size);
  const center = new THREE.Vector3();
  bb.getCenter(center);

  // pick longest axis as anatomical superior-inferior; assume it's already correct,
  // but normalize: longest size → targetHeight
  const longest = Math.max(size.x, size.y, size.z);
  const scale = targetHeight / longest;

  const positions = geo.attributes.position as THREE.BufferAttribute;
  const triCount = positions.count / 3;

  // compute triangle areas
  const areas = new Float32Array(triCount);
  let totalArea = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();

  for (let i = 0; i < triCount; i++) {
    a.fromBufferAttribute(positions, i * 3);
    b.fromBufferAttribute(positions, i * 3 + 1);
    c.fromBufferAttribute(positions, i * 3 + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    cross.crossVectors(ab, ac);
    const area = cross.length() * 0.5;
    areas[i] = area;
    totalArea += area;
  }

  // cumulative areas for weighted sampling
  const cum = new Float32Array(triCount);
  let acc = 0;
  for (let i = 0; i < triCount; i++) {
    acc += areas[i];
    cum[i] = acc;
  }

  // binary search helper
  function pickTri(r: number): number {
    const target = r * totalArea;
    let lo = 0;
    let hi = triCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  const outPos = new Float32Array(count * 3);
  const outNormal = new Float32Array(count * 3);
  const outSeed = new Float32Array(count);

  // tilt: the NIH3D heart STL tends to sit upright; nudge to a slight anterior tilt
  const tilt = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-0.05, 0, -0.08),
  );

  const tmp = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const tri = pickTri(Math.random());
    a.fromBufferAttribute(positions, tri * 3);
    b.fromBufferAttribute(positions, tri * 3 + 1);
    c.fromBufferAttribute(positions, tri * 3 + 2);

    // uniform barycentric
    let u = Math.random();
    let v = Math.random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;
    tmp.set(0, 0, 0)
      .addScaledVector(a, w)
      .addScaledVector(b, u)
      .addScaledVector(c, v);

    // triangle normal
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac).normalize();

    // recenter then scale
    tmp.sub(center).multiplyScalar(scale);
    tmp.applyQuaternion(tilt);
    n.applyQuaternion(tilt);

    outPos[i * 3] = tmp.x;
    outPos[i * 3 + 1] = tmp.y;
    outPos[i * 3 + 2] = tmp.z;
    outNormal[i * 3] = n.x;
    outNormal[i * 3 + 1] = n.y;
    outNormal[i * 3 + 2] = n.z;
    outSeed[i] = Math.random();
  }

  const cloud = new THREE.BufferGeometry();
  cloud.setAttribute("position", new THREE.BufferAttribute(outPos, 3));
  cloud.setAttribute("aNormal", new THREE.BufferAttribute(outNormal, 3));
  cloud.setAttribute("aSeed", new THREE.BufferAttribute(outSeed, 1));
  cloud.computeBoundingSphere();

  return { geometry: cloud, pointCount: count };
}
