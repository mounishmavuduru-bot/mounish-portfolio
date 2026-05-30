/* eslint-disable react-hooks/immutability -- R3F mutates three.js objects in useFrame; standard pattern */
"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { buildHeartCloud, REGION_COUNT } from "@/lib/anatomicalHeart";

interface HeartState {
  mouseWorld: THREE.Vector3;
  mouseActive: number;
  bpm: number;
}

const VERT = /* glsl */ `
attribute vec3 aNormal;
attribute float aRegion;
attribute float aSeed;

uniform float uTime;
uniform float uBeat;
uniform vec3 uMouse;
uniform float uMouseActive;
uniform float uRepelRadius;
uniform float uRepelStrength;
uniform float uRegionGlow[${REGION_COUNT}];
uniform float uPixelRatio;
uniform float uBaseSize;

varying float vRegion;
varying float vGlow;
varying float vBeat;

void main() {
  vec3 pos = position * uBeat;

  // mouse repulsion (in world/local — heart is centered, so position works)
  vec3 toMouse = pos - uMouse;
  float dist = length(toMouse);
  float falloff = 1.0 - smoothstep(0.0, uRepelRadius, dist);
  float repel = falloff * uRepelStrength * uMouseActive;
  pos += normalize(toMouse + vec3(0.0001)) * repel;

  // tiny organic shimmer
  float shimmer = 0.006 * sin(uTime * 1.8 + aSeed * 13.0);
  pos += aNormal * shimmer;

  int region = int(aRegion + 0.5);
  float glow = uRegionGlow[0];
  if (region == 1) glow = uRegionGlow[1];
  else if (region == 2) glow = uRegionGlow[2];
  else if (region == 3) glow = uRegionGlow[3];
  else if (region == 4) glow = uRegionGlow[4];
  else if (region == 5) glow = uRegionGlow[5];

  vRegion = aRegion;
  vGlow = glow + falloff * 0.5;
  vBeat = uBeat;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float dShade = clamp(-mv.z * 0.18, 0.5, 1.6);
  gl_PointSize = uBaseSize * uPixelRatio * dShade * (1.0 + glow * 0.7 + (uBeat - 1.0) * 4.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;

varying float vRegion;
varying float vGlow;
varying float vBeat;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r = length(c);
  if (r > 0.5) discard;

  // soft circular falloff
  float alpha = smoothstep(0.5, 0.1, r);

  // base red — slightly different hue per region
  vec3 baseRed = vec3(0.78, 0.10, 0.13);
  vec3 hotRed  = vec3(1.0, 0.55, 0.45);
  vec3 vesselRed = vec3(0.86, 0.18, 0.18);

  vec3 color = baseRed;
  if (vRegion > 3.5) color = vesselRed; // aorta, vessels brighter

  // glow + beat color shift
  float boost = clamp(vGlow + (vBeat - 1.0) * 6.0, 0.0, 1.4);
  color = mix(color, hotRed, clamp(boost, 0.0, 0.9));

  // center hot spot
  color = mix(color, hotRed, smoothstep(0.5, 0.0, r) * 0.25);

  gl_FragColor = vec4(color, alpha * 0.95);
}
`;

function cardiacBeat(t: number): number {
  // t in [0,1] one full cycle
  let r = 1.0;
  if (t < 0.08) {
    r -= 0.025 * Math.sin((t / 0.08) * Math.PI);
  } else if (t < 0.35) {
    const p = (t - 0.08) / 0.27;
    r += 0.085 * Math.sin(p * Math.PI);
  } else if (t < 0.5) {
    const p = (t - 0.35) / 0.15;
    r -= 0.045 * Math.sin(p * Math.PI);
  }
  return r;
}

export default function Heart({
  state,
  paused,
}: {
  state: React.RefObject<HeartState>;
  paused: boolean;
}) {
  const ref = useRef<THREE.Points>(null);
  const cloud = useMemo(() => buildHeartCloud(6000), []);
  const cyclePhase = useRef(0);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBeat: { value: 1 },
      uMouse: { value: new THREE.Vector3(0, 0, 100) },
      uMouseActive: { value: 0 },
      uRepelRadius: { value: 0.45 },
      uRepelStrength: { value: 0.12 },
      uRegionGlow: { value: new Array(REGION_COUNT).fill(0) },
      uPixelRatio: {
        value:
          typeof window !== "undefined"
            ? Math.min(window.devicePixelRatio, 2)
            : 1,
      },
      uBaseSize: { value: 4.6 },
    }),
    [],
  );

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const s = state.current;
    if (!s) return;

    // auto-rotate
    if (!paused) {
      m.rotation.y += dt * 0.16;
    }

    // beat phase advances at BPM
    const bps = s.bpm / 60;
    cyclePhase.current = (cyclePhase.current + dt * bps) % 1;
    const beat = cardiacBeat(cyclePhase.current);
    uniforms.uBeat.value = beat;

    uniforms.uTime.value += dt;

    // mouse uniform — transform world-space mouse into local heart space
    const localMouse = s.mouseWorld.clone();
    m.worldToLocal(localMouse);
    uniforms.uMouse.value.copy(localMouse);
    uniforms.uMouseActive.value = s.mouseActive;

    // region glow based on mouse proximity to each region centroid (in local)
    const glow = uniforms.uRegionGlow.value as number[];
    for (let i = 0; i < REGION_COUNT; i++) {
      const c = cloud.regionCentroids[i];
      const d = localMouse.distanceTo(c);
      const proxim = THREE.MathUtils.smoothstep(d, 0.6, 0.1);
      glow[i] = THREE.MathUtils.lerp(glow[i], proxim * 0.9, 0.12);
    }
  });

  return (
    <points ref={ref} geometry={cloud.geometry}>
      <shaderMaterial
        args={[
          {
            uniforms,
            vertexShader: VERT,
            fragmentShader: FRAG,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          },
        ]}
      />
    </points>
  );
}

export type { HeartState };
