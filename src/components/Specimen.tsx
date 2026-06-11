/* eslint-disable react-hooks/immutability -- R3F mutates three.js objects in useFrame; standard pattern */
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  ORGAN_HEIGHT,
  loadHeartTargets,
  generateBrainTargets,
} from "@/lib/organPoints";
import { ParticleSim, type PointerState } from "@/lib/particleSim";
import { TAGLINE } from "@/data/content";

const PARTICLES_DESKTOP = 26000;
const PARTICLES_MOBILE = 14000;
const FOV = 38;
// Camera distance so the organ (height ORGAN_HEIGHT) fits vertically with ~12% margin.
const CAMERA_Z =
  (ORGAN_HEIGHT * 0.5 * 1.12) / Math.tan(((FOV / 2) * Math.PI) / 180);

const MONO =
  'var(--font-mono), "IBM Plex Mono", ui-monospace, Menlo, monospace';
const BONE = "#e8e3d8";

// Sampled organ targets cached at module level: page.tsx unmounts Specimen
// while the chart is open, so without this every open/close cycle would
// re-fetch /heart.stl and re-sample tens of thousands of points, and the
// closing reveal would land on the loading screen instead of the organ.
let heartCache: { count: number; data: Float32Array } | null = null;
let brainCache: { count: number; data: Float32Array } | null = null;

function loadHeartTargetsCached(
  count: number,
  onProgress: (pct: number) => void,
): Promise<Float32Array> {
  if (heartCache && heartCache.count === count) {
    return Promise.resolve(heartCache.data);
  }
  return loadHeartTargets("/heart.stl", count, onProgress).then((data) => {
    heartCache = { count, data };
    return data;
  });
}

function brainTargetsCached(count: number): Float32Array {
  if (!brainCache || brainCache.count !== count) {
    brainCache = { count, data: generateBrainTargets(count) };
  }
  return brainCache.data;
}

const VERT = /* glsl */ `
attribute float aSeed;

uniform float uTime;
uniform float uPixelRatio;
uniform float uFocusZ;

varying float vSeed;

void main() {
  vSeed = aSeed;
  vec3 p = position;

  // subtle per-particle shimmer, phase-offset by seed
  p += 0.014 * vec3(
    sin(uTime * 1.4 + aSeed * 39.0),
    sin(uTime * 1.1 + aSeed * 61.0),
    sin(uTime * 1.7 + aSeed * 23.0)
  );

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float depthFactor = clamp(uFocusZ / max(-mv.z, 0.1), 0.35, 2.4);
  gl_PointSize = 2.2 * uPixelRatio * depthFactor;
}
`;

const FRAG = /* glsl */ `
precision mediump float;

uniform float uOrganMix;

varying float vSeed;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.15, d) * (0.5 + 0.42 * vSeed);

  // heart palette: blood #a61b1b with sparse bone #e8e3d8 flecks
  vec3 blood = vec3(0.651, 0.106, 0.106);
  vec3 bone = vec3(0.910, 0.890, 0.847);
  vec3 heartCol = mix(blood, bone, pow(vSeed, 3.0) * 0.8);

  // brain palette: cool bone #8e8c86 -> #d9d6cc
  vec3 brainLo = vec3(0.557, 0.549, 0.525);
  vec3 brainHi = vec3(0.851, 0.839, 0.800);
  vec3 brainCol = mix(brainLo, brainHi, vSeed);

  vec3 col = mix(heartCol, brainCol, uOrganMix);
  gl_FragColor = vec4(col, alpha);
}
`;

interface NdcPointer {
  x: number;
  y: number;
  active: boolean;
}

function OrganCloud({
  sim,
  ndc,
  organTarget,
}: {
  sim: ParticleSim;
  ndc: NdcPointer;
  organTarget: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const { geometry, material } = useMemo(() => {
    const count = sim.positions.length / 3;
    const g = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(sim.positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", posAttr);

    // deterministic per-particle seed (Knuth multiplicative hash)
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      seeds[i] = ((i * 2654435761) % 4294967296) / 4294967296;
    }
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    g.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, 0, 0),
      ORGAN_HEIGHT,
    );

    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uFocusZ: { value: CAMERA_Z },
        uOrganMix: { value: 0 },
      },
    });
    return { geometry: g, material: m };
  }, [sim]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  const pointer = useRef<PointerState>({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    active: false,
  });

  const tmp = useMemo(
    () => ({
      raycaster: new THREE.Raycaster(),
      plane: new THREE.Plane(),
      normal: new THREE.Vector3(),
      ndcVec: new THREE.Vector2(),
      world: new THREE.Vector3(),
      local: new THREE.Vector3(),
      prevLocal: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      smoothVel: new THREE.Vector3(),
      origin: new THREE.Vector3(0, 0, 0),
      hasPrev: false,
    }),
    [],
  );

  useFrame((state, delta) => {
    const dt = Math.min(Math.max(delta, 1e-4), 0.033);
    const p = pointer.current;
    const group = groupRef.current;

    if (ndc.active && group) {
      tmp.ndcVec.set(ndc.x, ndc.y);
      tmp.raycaster.setFromCamera(tmp.ndcVec, camera);
      camera.getWorldDirection(tmp.normal);
      tmp.plane.setFromNormalAndCoplanarPoint(tmp.normal, tmp.origin);
      const hit = tmp.raycaster.ray.intersectPlane(tmp.plane, tmp.world);
      if (hit) {
        // sim runs in organ-local space; bring the pointer into it
        tmp.local.copy(tmp.world);
        group.worldToLocal(tmp.local);
        if (tmp.hasPrev) {
          tmp.vel.subVectors(tmp.local, tmp.prevLocal).divideScalar(dt);
          tmp.smoothVel.lerp(tmp.vel, 0.35);
        } else {
          tmp.smoothVel.set(0, 0, 0);
        }
        tmp.prevLocal.copy(tmp.local);
        tmp.hasPrev = true;

        p.x = tmp.local.x;
        p.y = tmp.local.y;
        p.z = tmp.local.z;
        p.vx = tmp.smoothVel.x;
        p.vy = tmp.smoothVel.y;
        p.vz = tmp.smoothVel.z;
        p.active = true;
      } else {
        p.active = false;
        tmp.hasPrev = false;
      }
    } else {
      p.active = false;
      tmp.hasPrev = false;
      tmp.smoothVel.set(0, 0, 0);
    }

    sim.update(dt, p);
    (geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate =
      true;

    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uPixelRatio.value = gl.getPixelRatio();
    const mix = material.uniforms.uOrganMix;
    mix.value += (organTarget - mix.value) * Math.min(1, dt * 5);
  });

  return (
    <group ref={groupRef}>
      <points geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}

function subscribeCoarse(cb: () => void) {
  const mql = window.matchMedia("(pointer: coarse)");
  mql.addEventListener("change", cb);
  window.addEventListener("resize", cb);
  return () => {
    mql.removeEventListener("change", cb);
    window.removeEventListener("resize", cb);
  };
}

function getCoarse() {
  return (
    window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768
  );
}

export default function Specimen({ onEnter }: { onEnter: () => void }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [progress, setProgress] = useState(0);
  const [organ, setOrgan] = useState<"cardiac" | "neuro">("cardiac");
  const [sim, setSim] = useState<ParticleSim | null>(null);
  const [attempt, setAttempt] = useState(0);

  const countRef = useRef(PARTICLES_DESKTOP);
  const heartRef = useRef<Float32Array | null>(null);
  const brainRef = useRef<Float32Array | null>(null);
  // stable mutable channel between DOM pointer events and the R3F frame loop
  const [ndc] = useState<NdcPointer>(() => ({ x: 0, y: 0, active: false }));
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const isCoarse = useSyncExternalStore(
    subscribeCoarse,
    getCoarse,
    () => false,
  );

  useEffect(() => {
    let cancelled = false;
    const coarse =
      window.matchMedia("(pointer: coarse)").matches ||
      window.innerWidth < 768;
    const count = coarse ? PARTICLES_MOBILE : PARTICLES_DESKTOP;
    countRef.current = count;
    brainRef.current =
      brainCache && brainCache.count === count ? brainCache.data : null;

    loadHeartTargetsCached(count, (pct) => {
      if (!cancelled) {
        setProgress(Math.max(0, Math.min(100, Math.round(pct))));
      }
    })
      .then((targets) => {
        if (cancelled) return;
        heartRef.current = targets;
        const next = new ParticleSim(count);
        next.setTargets(targets);
        setSim(next);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setStatus("loading");
    setProgress(0);
    setSim(null);
    setOrgan("cardiac");
    setAttempt((a) => a + 1);
  };

  const selectOrgan = (next: "cardiac" | "neuro") => {
    if (next === organ || !sim || !heartRef.current) return;
    if (next === "neuro") {
      if (!brainRef.current) {
        brainRef.current = brainTargetsCached(countRef.current);
      }
      sim.setTargets(brainRef.current);
    } else {
      sim.setTargets(heartRef.current);
    }
    setOrgan(next);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    ndc.active = true;
  };

  const handlePointerLeave = () => {
    ndc.active = false;
    downRef.current = null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    downRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = downRef.current;
    downRef.current = null;
    if (!d || status !== "ready") return;
    const held = performance.now() - d.t;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (held <= 220 && moved < 7) onEnter();
  };

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: "#070808" }}
    >
      {/* canvas layer: click-vs-drag detection lives on this wrapper only */}
      <div
        className="absolute inset-0 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-[#e8e3d8]/40"
        style={{ touchAction: "none" }}
        role="button"
        tabIndex={0}
        aria-label="open chart"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onKeyDown={(e) => {
          if (status === "ready" && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onEnter();
          }
        }}
      >
        {status === "ready" && sim && (
          <Canvas
            dpr={[1, 2]}
            camera={{
              position: [0, 0, CAMERA_Z],
              fov: FOV,
              near: 0.1,
              far: CAMERA_Z * 6,
            }}
            gl={{ antialias: true }}
          >
            <color attach="background" args={["#070808"]} />
            <OrganCloud
              sim={sim}
              ndc={ndc}
              organTarget={organ === "neuro" ? 1 : 0}
            />
            <OrbitControls
              enableZoom={false}
              enablePan={false}
              autoRotate
              autoRotateSpeed={1.1}
              enableDamping
              dampingFactor={0.08}
            />
          </Canvas>
        )}
      </div>

      {/* type overlay */}
      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="absolute left-6 top-6 md:left-10 md:top-10">
          <h1
            style={{
              fontFamily: "var(--font-fraunces), Georgia, serif",
              fontSize: "clamp(1.6rem, 3vw, 2.4rem)",
              fontWeight: 500,
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
              color: BONE,
            }}
          >
            Mounish Mavuduru
          </h1>
          <p
            style={{
              fontFamily: MONO,
              fontSize: "0.78rem",
              lineHeight: 1.5,
              marginTop: "0.6rem",
              maxWidth: "36ch",
              color: "rgba(232, 227, 216, 0.55)",
            }}
          >
            {TAGLINE}
          </p>
        </div>

        {status === "ready" && (
          <p
            className="absolute bottom-6 right-6 md:bottom-8 md:right-10"
            style={{
              fontFamily: MONO,
              fontSize: "0.7rem",
              letterSpacing: "0.06em",
              color: "rgba(232, 227, 216, 0.45)",
            }}
          >
            {isCoarse ? "tap to open chart" : "press to open chart"}
          </p>
        )}

        {status === "ready" && (
          <div className="pointer-events-auto absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-6 md:bottom-8">
            {(["cardiac", "neuro"] as const).map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={organ === o}
                onClick={(e) => {
                  e.stopPropagation();
                  selectOrgan(o);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                className="cursor-pointer focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-[#e8e3d8]/60"
                style={{
                  fontFamily: MONO,
                  fontSize: "0.75rem",
                  letterSpacing: "0.08em",
                  paddingBottom: 2,
                  background: "transparent",
                  border: "none",
                  borderBottom:
                    organ === o
                      ? `1px solid ${BONE}`
                      : "1px solid transparent",
                  borderRadius: 0,
                  color: organ === o ? BONE : "rgba(232, 227, 216, 0.4)",
                }}
              >
                {o}
              </button>
            ))}
          </div>
        )}

        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p
              style={{
                fontFamily: MONO,
                fontSize: "0.78rem",
                letterSpacing: "0.06em",
                color: "rgba(232, 227, 216, 0.55)",
              }}
            >
              loading specimen… {progress}%
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <p
              style={{
                fontFamily: MONO,
                fontSize: "0.78rem",
                letterSpacing: "0.06em",
                color: "rgba(232, 227, 216, 0.55)",
              }}
            >
              specimen failed to load
            </p>
            <button
              type="button"
              onClick={retry}
              className="pointer-events-auto cursor-pointer focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-[#e8e3d8]/60"
              style={{
                fontFamily: MONO,
                fontSize: "0.72rem",
                letterSpacing: "0.08em",
                padding: "0.45rem 1.1rem",
                background: "transparent",
                border: "1px solid rgba(232, 227, 216, 0.5)",
                borderRadius: 2,
                color: BONE,
              }}
            >
              retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
