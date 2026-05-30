"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Procedural stylized anatomical-ish heart.
 * Built by deforming a high-poly sphere with two ventricle bulges,
 * a cleft between them, an apex taper, and organic noise.
 */
function buildHeartGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 96, 96);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const { x, y, z } = v;

    // base shape: wider on top, taper to apex at bottom
    const topness = (y + 1) * 0.5;
    const taper = THREE.MathUtils.lerp(0.35, 1.05, Math.pow(topness, 1.4));

    // asymmetric ventricle bulge (right slightly larger)
    const ventricle =
      0.18 * Math.exp(-Math.pow((x - 0.45) / 0.55, 2)) +
      0.22 * Math.exp(-Math.pow((x + 0.42) / 0.55, 2));

    // cleft between ventricles (depression near x=0 on front)
    const cleftMask =
      Math.exp(-Math.pow(x / 0.18, 2)) * Math.max(0, z) * (0.5 + 0.5 * topness);
    const cleft = -0.16 * cleftMask;

    // atrium bump on top-back
    const atrium = 0.14 * Math.exp(-Math.pow((y - 0.8) / 0.35, 2)) * Math.max(0, -z);

    // organic noise
    const n =
      0.04 * Math.sin(5.1 * x + 1.3) * Math.sin(4.7 * y + 0.4) +
      0.03 * Math.sin(6.3 * z - 0.7) * Math.cos(3.9 * y + 1.1);

    const r = taper * (1 + ventricle + cleft + atrium + n);
    v.set(x, y, z).normalize().multiplyScalar(r);

    // slight forward tilt + lateral lean
    v.applyAxisAngle(new THREE.Vector3(1, 0, 0), -0.18);
    v.applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.08);

    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export default function Heart({
  mouse,
  paused,
}: {
  mouse: React.RefObject<{ x: number; y: number }>;
  paused: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => buildHeartGeometry(), []);

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    if (paused) return;
    // auto-rotate
    m.rotation.y += dt * 0.18;
    // mouse-driven tilt (subtle)
    const target = mouse.current;
    if (target) {
      m.rotation.x = THREE.MathUtils.lerp(m.rotation.x, target.y * 0.25, 0.05);
      m.rotation.z = THREE.MathUtils.lerp(m.rotation.z, -target.x * 0.18, 0.05);
    }
  });

  return (
    <mesh ref={ref} geometry={geometry} castShadow receiveShadow>
      <meshPhysicalMaterial
        color="#7a1a1f"
        roughness={0.55}
        metalness={0.05}
        clearcoat={0.35}
        clearcoatRoughness={0.55}
        sheen={0.4}
        sheenColor="#ff5b5b"
        sheenRoughness={0.6}
        emissive="#3a0608"
        emissiveIntensity={0.18}
      />
    </mesh>
  );
}
