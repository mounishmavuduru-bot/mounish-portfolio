import * as THREE from "three";

/**
 * Anatomical heart point cloud generator.
 *
 * Builds a heart by sampling points across multiple anatomical primitives.
 * Regions:
 *   0 = Left Ventricle (LV)
 *   1 = Right Ventricle (RV)
 *   2 = Left Atrium (LA)
 *   3 = Right Atrium (RA)
 *   4 = Aorta (arch + brachiocephalic + L common carotid + L subclavian)
 *   5 = Pulmonary trunk / SVC / IVC
 *
 * Orientation (anterior view of patient):
 *   +X = patient's left   |   +Y = superior   |   +Z = anterior (toward viewer)
 */

export const REGION_COUNT = 6;

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

/** sample on a pointed cone (apex). t=0 at apex, t=1 at base */
function sampleConeApex(
  apex: THREE.Vector3,
  baseCenter: THREE.Vector3,
  baseRadius: number,
): Sample {
  const t = Math.sqrt(Math.random());
  const theta = 2 * Math.PI * Math.random();

  const axis = baseCenter.clone().sub(apex);
  const helper =
    Math.abs(axis.clone().normalize().y) < 0.95
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  const perpA = new THREE.Vector3().crossVectors(axis, helper).normalize();
  const perpB = new THREE.Vector3().crossVectors(axis, perpA).normalize();
  const r = t * baseRadius;
  const off = perpA
    .clone()
    .multiplyScalar(Math.cos(theta) * r)
    .addScaledVector(perpB, Math.sin(theta) * r);

  const p = apex.clone().addScaledVector(axis, t).add(off);
  const n = off.clone().normalize();
  if (n.lengthSq() === 0) n.copy(axis).normalize();
  return { p, n };
}

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
  taperEnd?: number,
): Sample {
  const axis = end.clone().sub(start);
  const height = axis.length();
  axis.normalize();
  const t = Math.random() * height;
  const taper = taperEnd ?? 1;
  const r = THREE.MathUtils.lerp(radius, radius * taper, t / height);

  const helper =
    Math.abs(axis.y) < 0.95
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  const perpA = new THREE.Vector3().crossVectors(axis, helper).normalize();
  const perpB = new THREE.Vector3().crossVectors(axis, perpA).normalize();

  const theta = 2 * Math.PI * Math.random();
  const off = perpA
    .clone()
    .multiplyScalar(Math.cos(theta) * r)
    .addScaledVector(perpB, Math.sin(theta) * r);

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
  noiseAmp?: number;
  sample: () => Sample;
}

function buildPrimitives(): PrimitiveSpec[] {
  /* Anatomy notes (matched to anterior-view reference):
     - LV dominates posterior-left; apex points down-left, slightly anterior
     - RV is anterior, drapes over LV on the patient's right
     - Atria sit superior; LA posterior, RA anterior-right
     - Aortic arch ascends from LV outflow, curves left & posterior
     - Brachiocephalic, L common carotid, L subclavian rise as 3 stubs off arch
     - Pulmonary trunk rises from RV, slightly left
     - SVC rises from RA; IVC stub descends from RA bottom
  */

  // ---- LEFT VENTRICLE — main body (ellipsoid) + apex cone ----
  const LV_BODY_CENTER = new THREE.Vector3(0.08, -0.15, 0.0);
  const LV_BODY_RADII = new THREE.Vector3(0.4, 0.42, 0.42);
  const LV_BODY_ROT = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-0.18, 0.0, -0.22),
  );
  const LV_APEX = new THREE.Vector3(-0.08, -0.78, 0.08);
  const LV_APEX_BASE = new THREE.Vector3(0.06, -0.22, 0.03);

  // ---- RIGHT VENTRICLE — drapes anterior of LV ----
  const RV_CENTER = new THREE.Vector3(-0.3, -0.05, 0.22);
  const RV_RADII = new THREE.Vector3(0.32, 0.45, 0.32);
  const RV_ROT = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-0.15, 0.1, 0.28),
  );

  // ---- LEFT ATRIUM (posterior-superior) ----
  const LA_CENTER = new THREE.Vector3(0.16, 0.45, -0.22);
  const LA_RADII = new THREE.Vector3(0.28, 0.24, 0.3);

  // ---- RIGHT ATRIUM (anterior-superior right) ----
  const RA_CENTER = new THREE.Vector3(-0.36, 0.4, 0.05);
  const RA_RADII = new THREE.Vector3(0.32, 0.3, 0.3);

  // ---- AORTIC ROOT (small bulb above LV) ----
  const AORTIC_ROOT_CENTER = new THREE.Vector3(0.0, 0.32, 0.05);
  const AORTIC_ROOT_RADII = new THREE.Vector3(0.13, 0.12, 0.13);

  // ---- AORTIC ARCH (torus) ----
  const AORTA_CENTER = new THREE.Vector3(0.05, 0.78, -0.05);
  const AORTA_MAJOR = 0.36;
  const AORTA_MINOR = 0.09;
  const AORTA_ROT = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(Math.PI / 2, 0, -0.18),
  );

  // ---- BRACHIOCEPHALIC TRUNK (most anterior, rises up-right then bifurcates) ----
  const BC_START = new THREE.Vector3(-0.22, 0.92, -0.05);
  const BC_END = new THREE.Vector3(-0.3, 1.32, 0.02);
  const BC_RADIUS = 0.07;

  // ---- LEFT COMMON CAROTID (middle stub) ----
  const LCC_START = new THREE.Vector3(0.02, 0.96, -0.08);
  const LCC_END = new THREE.Vector3(0.04, 1.38, -0.05);
  const LCC_RADIUS = 0.055;

  // ---- LEFT SUBCLAVIAN (most posterior stub) ----
  const LSA_START = new THREE.Vector3(0.22, 0.92, -0.18);
  const LSA_END = new THREE.Vector3(0.3, 1.28, -0.2);
  const LSA_RADIUS = 0.055;

  // ---- PULMONARY TRUNK (rises from RV, leftward & posterior) ----
  const PT_START = new THREE.Vector3(-0.18, 0.4, 0.3);
  const PT_END = new THREE.Vector3(-0.38, 0.78, 0.05);
  const PT_RADIUS = 0.1;

  // ---- SVC (superior vena cava — drops into RA from above) ----
  const SVC_START = new THREE.Vector3(-0.4, 0.55, 0.12);
  const SVC_END = new THREE.Vector3(-0.38, 1.05, 0.08);
  const SVC_RADIUS = 0.082;

  // ---- IVC stub (short, off RA bottom) ----
  const IVC_START = new THREE.Vector3(-0.3, 0.1, 0.05);
  const IVC_END = new THREE.Vector3(-0.3, -0.15, 0.0);
  const IVC_RADIUS = 0.085;

  return [
    {
      region: 0,
      weight: 1.5,
      sample: () => sampleEllipsoid(LV_BODY_CENTER, LV_BODY_RADII, LV_BODY_ROT),
    },
    {
      region: 0,
      weight: 0.6,
      noiseAmp: 0.012,
      sample: () => sampleConeApex(LV_APEX, LV_APEX_BASE, 0.34),
    },
    {
      region: 1,
      weight: 1.05,
      sample: () => sampleEllipsoid(RV_CENTER, RV_RADII, RV_ROT),
    },
    {
      region: 2,
      weight: 0.55,
      sample: () => sampleEllipsoid(LA_CENTER, LA_RADII),
    },
    {
      region: 3,
      weight: 0.62,
      sample: () => sampleEllipsoid(RA_CENTER, RA_RADII),
    },
    {
      region: 4,
      weight: 0.22,
      sample: () =>
        sampleEllipsoid(AORTIC_ROOT_CENTER, AORTIC_ROOT_RADII),
    },
    {
      region: 4,
      weight: 0.78,
      sample: () =>
        sampleTorusArc(
          AORTA_CENTER,
          AORTA_MAJOR,
          AORTA_MINOR,
          Math.PI * 0.08,
          Math.PI * 0.98,
          AORTA_ROT,
        ),
    },
    {
      region: 4,
      weight: 0.32,
      sample: () => sampleCylinder(BC_START, BC_END, BC_RADIUS, 0.7),
    },
    {
      region: 4,
      weight: 0.25,
      sample: () => sampleCylinder(LCC_START, LCC_END, LCC_RADIUS, 0.85),
    },
    {
      region: 4,
      weight: 0.25,
      sample: () => sampleCylinder(LSA_START, LSA_END, LSA_RADIUS, 0.85),
    },
    {
      region: 5,
      weight: 0.42,
      sample: () => sampleCylinder(PT_START, PT_END, PT_RADIUS, 0.95),
    },
    {
      region: 5,
      weight: 0.32,
      sample: () => sampleCylinder(SVC_START, SVC_END, SVC_RADIUS, 0.95),
    },
    {
      region: 5,
      weight: 0.2,
      sample: () => sampleCylinder(IVC_START, IVC_END, IVC_RADIUS, 1),
    },
  ];
}

export interface HeartCloud {
  geometry: THREE.BufferGeometry;
  regionCentroids: THREE.Vector3[];
  pointCount: number;
}

export function buildHeartCloud(count = 14000): HeartCloud {
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
    const amp = prim.noiseAmp ?? 0.018;
    for (let i = 0; i < portion && written < count; i++) {
      const { p, n } = prim.sample();
      const nudge = organicNoise(p, amp);
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
