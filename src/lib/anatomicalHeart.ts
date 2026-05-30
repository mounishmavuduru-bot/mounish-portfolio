import * as THREE from "three";

/**
 * Anatomical heart point cloud generator.
 *
 * Builds a heart by sampling points across multiple anatomical primitives:
 *   0 = Left Ventricle (LV) — posterior-dominant muscular mass, apex bottom
 *   1 = Right Ventricle (RV) — anterior, wraps LV on patient's right
 *   2 = Left Atrium (LA) — superior-posterior
 *   3 = Right Atrium (RA) — superior-anterior right
 *   4 = Aorta — arch over the great vessels
 *   5 = Pulmonary trunk / SVC — superior vessels
 *
 * Orientation (viewer = front of patient, "anterior view"):
 *   +X = patient left   |   +Y = superior   |   +Z = anterior (toward viewer)
 */

export const REGION_COUNT = 6;
export const REGION_NAMES = [
  "Left Ventricle",
  "Right Ventricle",
  "Left Atrium",
  "Right Atrium",
  "Aorta",
  "Pulmonary Trunk",
];

type Sample = { p: THREE.Vector3; n: THREE.Vector3 };

function sampleEllipsoid(
  center: THREE.Vector3,
  radii: THREE.Vector3,
  rotation?: THREE.Quaternion,
): Sample {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const sx = Math.sin(phi) * Math.cos(theta);
  const sy = Math.cos(phi);
  const sz = Math.sin(phi) * Math.sin(theta);

  const p = new THREE.Vector3(radii.x * sx, radii.y * sy, radii.z * sz);
  const n = new THREE.Vector3(sx / radii.x, sy / radii.y, sz / radii.z).normalize();

  if (rotation) {
    p.applyQuaternion(rotation);
    n.applyQuaternion(rotation);
  }
  p.add(center);
  return { p, n };
}

/** sample on a partial torus arc lying in a plane defined by quaternion */
function sampleTorusArc(
  center: THREE.Vector3,
  majorR: number,
  minorR: number,
  arcStart: number,
  arcEnd: number,
  rotation: THREE.Quaternion,
): Sample {
  const theta = arcStart + Math.random() * (arcEnd - arcStart);
  const phi = 2 * Math.PI * Math.random();

  const ringCenter = new THREE.Vector3(
    majorR * Math.cos(theta),
    0,
    majorR * Math.sin(theta),
  );

  const tubeOut = new THREE.Vector3(
    Math.cos(phi) * Math.cos(theta),
    Math.sin(phi),
    Math.cos(phi) * Math.sin(theta),
  );

  const p = ringCenter.clone().addScaledVector(tubeOut, minorR);
  const n = tubeOut.clone();

  p.applyQuaternion(rotation);
  n.applyQuaternion(rotation);
  p.add(center);
  return { p, n };
}

function sampleCylinder(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
): Sample {
  const axis = end.clone().sub(start);
  const height = axis.length();
  axis.normalize();
  const t = Math.random() * height;

  // build basis
  const helper =
    Math.abs(axis.y) < 0.95
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  const perpA = new THREE.Vector3().crossVectors(axis, helper).normalize();
  const perpB = new THREE.Vector3().crossVectors(axis, perpA).normalize();

  const theta = 2 * Math.PI * Math.random();
  const off = perpA
    .clone()
    .multiplyScalar(Math.cos(theta) * radius)
    .addScaledVector(perpB, Math.sin(theta) * radius);

  const p = start.clone().addScaledVector(axis, t).add(off);
  const n = off.clone().normalize();
  return { p, n };
}

function organicNoise(p: THREE.Vector3, amp: number): number {
  return (
    amp *
    (Math.sin(5.3 * p.x + 0.7) * Math.cos(4.1 * p.y) +
      0.6 * Math.sin(6.7 * p.z - 0.3) * Math.cos(3.5 * p.y + 1.2))
  );
}

interface PrimitiveSpec {
  region: number;
  weight: number;
  sample: () => Sample;
}

function buildPrimitives(): PrimitiveSpec[] {
  // Anatomy (units roughly correspond to ~10cm heart = 1.0 unit total height)
  const LV_CENTER = new THREE.Vector3(0.08, -0.18, 0.0);
  const LV_RADII = new THREE.Vector3(0.42, 0.58, 0.46);
  // slight forward tilt so apex points down-left-anterior
  const LV_ROT = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-0.18, 0.0, -0.22),
  );

  const RV_CENTER = new THREE.Vector3(-0.32, -0.05, 0.18);
  const RV_RADII = new THREE.Vector3(0.34, 0.5, 0.34);
  const RV_ROT = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-0.15, 0.1, 0.25),
  );

  const LA_CENTER = new THREE.Vector3(0.18, 0.48, -0.18);
  const LA_RADII = new THREE.Vector3(0.28, 0.22, 0.3);

  const RA_CENTER = new THREE.Vector3(-0.38, 0.42, 0.05);
  const RA_RADII = new THREE.Vector3(0.3, 0.28, 0.28);

  // Aorta arch — rises from LV outflow, curves rightward then descends
  const AORTA_CENTER = new THREE.Vector3(0.0, 0.7, -0.05);
  const AORTA_MAJOR = 0.32;
  const AORTA_MINOR = 0.085;
  // rotate so torus lies in the saggital-superior plane, opening upward
  const AORTA_ROT = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(Math.PI / 2, 0, -0.25),
  );

  // Pulmonary trunk — rises from RV anterior, bifurcates to left
  const PT_START = new THREE.Vector3(-0.22, 0.45, 0.28);
  const PT_END = new THREE.Vector3(-0.45, 1.02, 0.05);
  const PT_RADIUS = 0.09;

  // SVC — vertical superior from RA
  const SVC_START = new THREE.Vector3(-0.35, 0.62, 0.12);
  const SVC_END = new THREE.Vector3(-0.32, 1.1, 0.05);
  const SVC_RADIUS = 0.08;

  return [
    {
      region: 0,
      weight: 1.4,
      sample: () => sampleEllipsoid(LV_CENTER, LV_RADII, LV_ROT),
    },
    {
      region: 1,
      weight: 0.95,
      sample: () => sampleEllipsoid(RV_CENTER, RV_RADII, RV_ROT),
    },
    {
      region: 2,
      weight: 0.5,
      sample: () => sampleEllipsoid(LA_CENTER, LA_RADII),
    },
    {
      region: 3,
      weight: 0.55,
      sample: () => sampleEllipsoid(RA_CENTER, RA_RADII),
    },
    {
      region: 4,
      weight: 0.55,
      sample: () =>
        sampleTorusArc(
          AORTA_CENTER,
          AORTA_MAJOR,
          AORTA_MINOR,
          Math.PI * 0.1,
          Math.PI * 0.95,
          AORTA_ROT,
        ),
    },
    {
      region: 5,
      weight: 0.35,
      sample: () => sampleCylinder(PT_START, PT_END, PT_RADIUS),
    },
    {
      region: 5,
      weight: 0.3,
      sample: () => sampleCylinder(SVC_START, SVC_END, SVC_RADIUS),
    },
  ];
}

export interface HeartCloud {
  geometry: THREE.BufferGeometry;
  regionCentroids: THREE.Vector3[];
  pointCount: number;
}

export function buildHeartCloud(count = 6000): HeartCloud {
  const prims = buildPrimitives();
  const totalWeight = prims.reduce((s, p) => s + p.weight, 0);

  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const regions = new Float32Array(count);
  const seeds = new Float32Array(count);

  const sums = new Array(REGION_COUNT)
    .fill(0)
    .map(() => new THREE.Vector3());
  const sumsCount = new Array(REGION_COUNT).fill(0);

  let written = 0;
  for (const prim of prims) {
    const portion = Math.round((prim.weight / totalWeight) * count);
    for (let i = 0; i < portion && written < count; i++) {
      const { p, n } = prim.sample();
      // organic noise — small radial perturbation
      const nudge = organicNoise(p, 0.02);
      p.addScaledVector(n, nudge);

      positions[written * 3] = p.x;
      positions[written * 3 + 1] = p.y;
      positions[written * 3 + 2] = p.z;
      normals[written * 3] = n.x;
      normals[written * 3 + 1] = n.y;
      normals[written * 3 + 2] = n.z;
      regions[written] = prim.region;
      seeds[written] = Math.random();

      sums[prim.region].add(p);
      sumsCount[prim.region]++;
      written++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aNormal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("aRegion", new THREE.BufferAttribute(regions, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.computeBoundingSphere();

  const regionCentroids = sums.map((s, i) =>
    sumsCount[i] > 0 ? s.clone().divideScalar(sumsCount[i]) : s.clone(),
  );

  return { geometry, regionCentroids, pointCount: written };
}
