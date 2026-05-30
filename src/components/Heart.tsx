/* eslint-disable react-hooks/immutability -- R3F mutates three.js objects in useFrame; standard pattern */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { loadHeartCloud, HeartCloud } from "@/lib/stlHeart";

interface HeartState {
  mouseWorld: THREE.Vector3;
  mouseActive: number;
  dim: number;
}

const RESTING_BPM = 65;
const POINT_COUNT = 14000;

const VERT = /* glsl */ `
attribute vec3 aNormal;
attribute float aSeed;

uniform float uTime;
uniform float uBeat;
uniform vec3 uMouse;
uniform float uMouseActive;
uniform float uRepelRadius;
uniform float uRepelStrength;
uniform float uPixelRatio;
uniform float uBaseSize;
uniform float uDim;

varying float vBeat;
varying float vDim;

void main() {
  vec3 pos = position * uBeat;

  // mouse repulsion — physical only; no color change
  vec3 toMouse = pos - uMouse;
  float dist = length(toMouse);
  float falloff = 1.0 - smoothstep(0.0, uRepelRadius, dist);
  float repel = falloff * uRepelStrength * uMouseActive;
  pos += normalize(toMouse + vec3(0.0001)) * repel;

  // tiny organic shimmer
  float shimmer = 0.004 * sin(uTime * 1.8 + aSeed * 13.0);
  pos += aNormal * shimmer;

  vBeat = uBeat;
  vDim = uDim;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float dShade = clamp(-mv.z * 0.18, 0.5, 1.6);
  float sizeMult = (1.0 + (uBeat - 1.0) * 4.0) * mix(1.0, 0.6, uDim);
  gl_PointSize = uBaseSize * uPixelRatio * dShade * sizeMult;
}
`;

const FRAG = /* glsl */ `
precision highp float;

varying float vBeat;
varying float vDim;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r = length(c);
  if (r > 0.5) discard;

  float alpha = smoothstep(0.5, 0.1, r);

  vec3 baseRed = vec3(0.82, 0.13, 0.14);
  vec3 hotRed  = vec3(1.0, 0.5, 0.42);

  vec3 color = baseRed;
  // gentle beat-driven highlight only (no cursor color change)
  color = mix(color, hotRed, clamp((vBeat - 1.0) * 4.0, 0.0, 0.35));
  color = mix(color, hotRed, smoothstep(0.5, 0.0, r) * 0.18);

  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 dimmedColor = mix(color, vec3(lum * 0.5), vDim);
  alpha *= mix(0.95, 0.32, vDim);

  gl_FragColor = vec4(dimmedColor, alpha);
}
`;

function cardiacBeat(t: number): number {
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
}: {
  state: React.RefObject<HeartState>;
}) {
  const ref = useRef<THREE.Points>(null);
  const [cloud, setCloud] = useState<HeartCloud | null>(null);
  const cyclePhase = useRef(0);
  const dimSmoothed = useRef(0);

  useEffect(() => {
    let cancelled = false;
    loadHeartCloud("/heart.stl", POINT_COUNT, 1.7).then((c) => {
      if (!cancelled) setCloud(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBeat: { value: 1 },
      uMouse: { value: new THREE.Vector3(0, 0, 100) },
      uMouseActive: { value: 0 },
      uRepelRadius: { value: 0.42 },
      uRepelStrength: { value: 0.12 },
      uPixelRatio: {
        value:
          typeof window !== "undefined"
            ? Math.min(window.devicePixelRatio, 2)
            : 1,
      },
      uBaseSize: { value: 4.2 },
      uDim: { value: 0 },
    }),
    [],
  );

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const s = state.current;
    if (!s) return;

    const bps = RESTING_BPM / 60;
    cyclePhase.current = (cyclePhase.current + dt * bps) % 1;
    uniforms.uBeat.value = cardiacBeat(cyclePhase.current);
    uniforms.uTime.value += dt;

    const localMouse = s.mouseWorld.clone();
    m.worldToLocal(localMouse);
    uniforms.uMouse.value.copy(localMouse);
    uniforms.uMouseActive.value = s.mouseActive;

    dimSmoothed.current = THREE.MathUtils.lerp(dimSmoothed.current, s.dim, 0.08);
    uniforms.uDim.value = dimSmoothed.current;
  });

  if (!cloud) return null;

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
