/* eslint-disable react-hooks/immutability -- R3F mutates three.js objects in useFrame; standard pattern */
"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import * as ThreeStdlib from "three-stdlib";
import { HeartCloud } from "@/lib/stlHeart";

interface HeartState {
  mouseWorld: THREE.Vector3;
  mouseActive: number;
  dim: number;
}

const VERT = /* glsl */ `
attribute vec3 aNormal;
attribute float aSeed;

uniform float uTime;
uniform vec3 uMouse;
uniform float uMouseActive;
uniform float uRepelRadius;
uniform float uRepelStrength;
uniform float uPixelRatio;
uniform float uBaseSize;
uniform float uDim;

varying float vDim;

void main() {
  vec3 pos = position;

  // physical mouse repulsion (gentle, eased)
  vec3 toMouse = pos - uMouse;
  float dist = length(toMouse);
  float falloff = 1.0 - smoothstep(0.0, uRepelRadius, dist);
  falloff = pow(falloff, 1.8); // softer onset
  float repel = falloff * uRepelStrength * uMouseActive;
  pos += normalize(toMouse + vec3(0.0001)) * repel;

  // tiny organic shimmer
  float shimmer = 0.003 * sin(uTime * 1.8 + aSeed * 13.0);
  pos += aNormal * shimmer;

  vDim = uDim;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float dShade = clamp(-mv.z * 0.18, 0.5, 1.6);
  float sizeMult = mix(1.0, 0.6, uDim);
  gl_PointSize = uBaseSize * uPixelRatio * dShade * sizeMult;
}
`;

const FRAG = /* glsl */ `
precision highp float;

varying float vDim;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r = length(c);
  if (r > 0.5) discard;

  float alpha = smoothstep(0.5, 0.1, r);

  vec3 baseRed = vec3(0.82, 0.13, 0.14);
  vec3 hotRed  = vec3(1.0, 0.5, 0.42);

  vec3 color = baseRed;
  color = mix(color, hotRed, smoothstep(0.5, 0.0, r) * 0.18);

  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 dimmedColor = mix(color, vec3(lum * 0.5), vDim);
  alpha *= mix(0.95, 0.32, vDim);

  gl_FragColor = vec4(dimmedColor, alpha);
}
`;

export default function Heart({
  cloud,
  state,
}: {
  cloud: HeartCloud;
  state: React.RefObject<HeartState>;
}) {
  const ref = useRef<THREE.Points>(null);
  const dimSmoothed = useRef(0);
  void ThreeStdlib; // ensure types

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector3(0, 0, 100) },
      uMouseActive: { value: 0 },
      uRepelRadius: { value: 0.6 },
      uRepelStrength: { value: 0.14 },
      uPixelRatio: {
        value:
          typeof window !== "undefined"
            ? Math.min(window.devicePixelRatio, 2)
            : 1,
      },
      uBaseSize: { value: 2.4 },
      uDim: { value: 0 },
    }),
    [],
  );

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const s = state.current;
    if (!s) return;

    uniforms.uTime.value += dt;

    const localMouse = s.mouseWorld.clone();
    m.worldToLocal(localMouse);
    uniforms.uMouse.value.copy(localMouse);
    uniforms.uMouseActive.value = s.mouseActive;

    dimSmoothed.current = THREE.MathUtils.lerp(dimSmoothed.current, s.dim, 0.08);
    uniforms.uDim.value = dimSmoothed.current;
  });

  // satisfy unused import in case tree-shaking strips
  useEffect(() => undefined, []);

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
