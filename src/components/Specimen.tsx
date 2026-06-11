/* eslint-disable react-hooks/immutability -- R3F mutates three.js objects in useFrame; standard pattern */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  ORGANS,
  BAKED_COUNT,
  MOBILE_COUNT,
  ORGAN_WORLD,
  loadOrganCloud,
} from "@/lib/organData";
import { ParticleSim, type PointerState } from "@/lib/particleSim";
import { TAGLINE, siteLabels, type Site } from "@/data/content";
import SectionPanel from "@/components/SectionPanel";
import EcgStrip from "@/components/EcgStrip";

const FOV = 42;
// Distance so an organ of size ORGAN_WORLD fits the viewport height, then
// pulled ~18% closer so it overflows (~120%) and clips at the edges.
const FIT_DISTANCE =
  ORGAN_WORLD * 0.5 / Math.tan(((FOV / 2) * Math.PI) / 180);
const CAMERA_Z = FIT_DISTANCE * 0.82;

const MONO =
  'var(--font-mono), "IBM Plex Mono", ui-monospace, Menlo, monospace';
const FRAUNCES = "var(--font-fraunces), Georgia, serif";
const BONE = "#e8e3d8";

const LAST = ORGANS.length - 1;

// ---------------------------------------------------------------------------
// Palette per organ, as [lowColor, highColor] picked by pow(seed, k) in the
// fragment shader. Crossfaded each frame as the active organ changes.
// ---------------------------------------------------------------------------
type Rgb = [number, number, number];
const HEART_LO: Rgb = [0.651, 0.106, 0.106]; // blood #a61b1b
const HEART_HI: Rgb = [0.91, 0.89, 0.847]; // bone #e8e3d8 flecks
const BRAIN_LO: Rgb = [0.557, 0.549, 0.525]; // #8e8c86
const BRAIN_HI: Rgb = [0.851, 0.839, 0.8]; // #d9d6cc
const LIVER_LO: Rgb = [0.494, 0.169, 0.141]; // desaturated oxblood #7e2b24
const LIVER_HI: Rgb = [0.725, 0.663, 0.604]; // #b9a99a

const PALETTES: Record<OrganId, { lo: Rgb; hi: Rgb }> = {
  heart: { lo: HEART_LO, hi: HEART_HI },
  brain: { lo: BRAIN_LO, hi: BRAIN_HI },
  liver: { lo: LIVER_LO, hi: LIVER_HI },
};

type OrganId = "heart" | "brain" | "liver";

const VERT = /* glsl */ `
attribute float aSeed;

uniform float uTime;
uniform float uPixelRatio;
uniform float uFocusZ;

varying float vSeed;

void main() {
  vSeed = aSeed;
  vec3 p = position;

  // subtle per-seed shimmer; vertex-shader only, no glow
  p += 0.014 * vec3(
    sin(uTime * 1.4 + aSeed * 39.0),
    sin(uTime * 1.1 + aSeed * 61.0),
    sin(uTime * 1.7 + aSeed * 23.0)
  );

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  // depth-attenuated point size, clamped so near points don't blow up
  float depthFactor = clamp(uFocusZ / max(-mv.z, 0.1), 0.35, 2.4);
  gl_PointSize = 2.0 * uPixelRatio * depthFactor;
}
`;

const FRAG = /* glsl */ `
precision mediump float;

uniform vec3 uColorLo;
uniform vec3 uColorHi;

varying float vSeed;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.16, d) * (0.5 + 0.42 * vSeed);

  // sparse high-color flecks: pow(seed, 3) keeps most particles on the
  // base color and only the tail flecks toward the bone/light tone
  float fleck = pow(vSeed, 3.0) * 0.85;
  vec3 col = mix(uColorLo, uColorHi, fleck);
  gl_FragColor = vec4(col, alpha);
}
`;

// Live channel shared between DOM events and the R3F frame loop (no re-render).
interface NdcPointer {
  x: number;
  y: number;
  active: boolean;
}

// Scroll-morph + interaction state, mutated outside React's render cycle.
interface ScrollChannel {
  scrollPos: number; // continuous position in [0, LAST]
  targetScroll: number; // where input wants us to go
  lastInput: number; // performance.now() of last wheel/touch nudge
  paused: boolean; // true while a panel is open (freeze morph + settle)
  rotating: boolean; // OrbitControls drag in progress
}

function lerpRgb(out: Rgb, a: Rgb, b: Rgb, t: number) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}

// ---------------------------------------------------------------------------
// The point cloud: owns geometry/material, runs the sim, drives the morph
// between adjacent organ clouds, crossfades color, and reports the active
// organ index back up via onActive (throttled, only on integer change).
// ---------------------------------------------------------------------------
function OrganCloud({
  sim,
  clouds,
  ndc,
  scroll,
  onActive,
  onRotateStart,
  onRotateEnd,
}: {
  sim: ParticleSim;
  clouds: Float32Array[];
  ndc: NdcPointer;
  scroll: ScrollChannel;
  onActive: (i: number) => void;
  onRotateStart: () => void;
  onRotateEnd: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const count = sim.positions.length / 3;

  const { geometry, material } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(sim.positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", posAttr);

    // deterministic per-particle seed (Knuth multiplicative hash) — no RNG
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      seeds[i] = ((i * 2654435761) % 4294967296) / 4294967296;
    }
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), ORGAN_WORLD);

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
        uColorLo: { value: new THREE.Color(HEART_LO[0], HEART_LO[1], HEART_LO[2]) },
        uColorHi: { value: new THREE.Color(HEART_HI[0], HEART_HI[1], HEART_HI[2]) },
      },
    });
    return { geometry: g, material: m };
  }, [sim, count]);

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

  // Preallocated scratch — morph target buffer + color lerp accumulators.
  const scratch = useMemo(() => new Float32Array(count * 3), [count]);
  const colorAcc = useMemo(
    () => ({
      lo: [...HEART_LO] as Rgb,
      hi: [...HEART_HI] as Rgb,
    }),
    [],
  );
  const lastActive = useRef(0);

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
    const group = groupRef.current;

    // --- scroll-morph state machine -------------------------------------
    const s = scroll;
    if (!s.paused) {
      const idleMs = performance.now() - s.lastInput;
      // once input has been idle ~140ms, ease the target toward the nearest
      // integer so the cloud settles on a single organ. Snap toward the
      // intended destination (rounded target) — not the position currently
      // being passed over — so an in-flight rail jump lands on the request.
      if (idleMs > 140) {
        const snap = Math.round(s.targetScroll);
        s.targetScroll += (snap - s.targetScroll) * Math.min(1, dt * 6);
      }
      // ease the live position toward the target
      s.scrollPos += (s.targetScroll - s.scrollPos) * Math.min(1, dt * 7);
    }
    s.scrollPos = Math.min(LAST, Math.max(0, s.scrollPos));

    // build the per-particle blend of cloud[i] -> cloud[i+1]
    const pos = s.scrollPos;
    const i = Math.min(LAST, Math.floor(pos));
    const f = pos - i;
    const a = clouds[i];
    const b = clouds[Math.min(LAST, i + 1)];
    const n = count * 3;
    if (f <= 0.0001 || a === b) {
      scratch.set(a);
    } else {
      for (let k = 0; k < n; k++) {
        const av = a[k];
        scratch[k] = av + (b[k] - av) * f;
      }
    }
    sim.setTargets(scratch);

    // active organ = nearest settle point; report up only on integer change
    const active = Math.round(pos);
    if (active !== lastActive.current) {
      lastActive.current = active;
      onActive(active);
    }

    // --- color crossfade toward the active organ palette ----------------
    const pal = PALETTES[ORGANS[active].id as OrganId];
    const cLerp = Math.min(1, dt * 4);
    lerpRgb(colorAcc.lo, colorAcc.lo, pal.lo, cLerp);
    lerpRgb(colorAcc.hi, colorAcc.hi, pal.hi, cLerp);
    const uLo = material.uniforms.uColorLo.value as THREE.Color;
    const uHi = material.uniforms.uColorHi.value as THREE.Color;
    uLo.setRGB(colorAcc.lo[0], colorAcc.lo[1], colorAcc.lo[2]);
    uHi.setRGB(colorAcc.hi[0], colorAcc.hi[1], colorAcc.hi[2]);

    // --- pointer physics in the rotating group's local space ------------
    const p = pointer.current;
    if (ndc.active && group) {
      tmp.ndcVec.set(ndc.x, ndc.y);
      tmp.raycaster.setFromCamera(tmp.ndcVec, camera);
      camera.getWorldDirection(tmp.normal);
      tmp.plane.setFromNormalAndCoplanarPoint(tmp.normal, tmp.origin);
      const hit = tmp.raycaster.ray.intersectPlane(tmp.plane, tmp.world);
      if (hit) {
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
  });

  return (
    <group ref={groupRef}>
      <points geometry={geometry} material={material} frustumCulled={false} />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.9}
        enableDamping
        dampingFactor={0.08}
        onStart={onRotateStart}
        onEnd={onRotateEnd}
      />
    </group>
  );
}

// ---------------------------------------------------------------------------
function getCount(): number {
  if (typeof window === "undefined") return BAKED_COUNT;
  const coarse =
    window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
  return coarse ? MOBILE_COUNT : BAKED_COUNT;
}

export default function Specimen() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [progress, setProgress] = useState(0);
  const [sim, setSim] = useState<ParticleSim | null>(null);
  const [clouds, setClouds] = useState<Float32Array[] | null>(null);
  const [attempt, setAttempt] = useState(0);

  // active organ index drives only the rail/overlay; it changes at most a
  // few times per scroll, so re-rendering on it is cheap.
  const [activeIndex, setActiveIndex] = useState(0);

  // panel anchored at the click point; null when closed.
  const [panel, setPanel] = useState<{
    section: Site;
    anchor: { x: number; y: number };
  } | null>(null);

  // Live channels: stable identity, mutated outside the render cycle.
  const [ndc] = useState<NdcPointer>(() => ({ x: 0, y: 0, active: false }));
  const [scroll] = useState<ScrollChannel>(() => ({
    scrollPos: 0,
    targetScroll: 0,
    lastInput: 0,
    paused: false,
    rotating: false,
  }));

  const wrapperRef = useRef<HTMLDivElement>(null);
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const rotatedAtRef = useRef(0);
  const panelOpen = panel !== null;

  // Honor prefers-reduced-motion: suppress the tick transform transition.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // keep scroll.paused in sync with panel state (read inside frame loop)
  useEffect(() => {
    scroll.paused = panelOpen;
  }, [panelOpen, scroll]);

  // -------------------------------------------------------------------------
  // Load all three organ clouds; aggregate progress for the readout.
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const count = getCount();
    const pcts = new Array(ORGANS.length).fill(0) as number[];

    const report = () => {
      if (cancelled) return;
      const avg = pcts.reduce((s, v) => s + v, 0) / ORGANS.length;
      setProgress(Math.max(0, Math.min(100, Math.round(avg))));
    };

    Promise.all(
      ORGANS.map((organ, idx) =>
        loadOrganCloud(organ.file, count, (pct) => {
          pcts[idx] = pct;
          report();
        }),
      ),
    )
      .then((loaded) => {
        if (cancelled) return;
        const next = new ParticleSim(count);
        next.setTargets(loaded[0]); // seed with the heart cloud
        next.positions.set(loaded[0]); // start settled, not springing from 0
        setClouds(loaded);
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

  const retry = useCallback(() => {
    setStatus("loading");
    setProgress(0);
    setSim(null);
    setClouds(null);
    setActiveIndex(0);
    scroll.scrollPos = 0;
    scroll.targetScroll = 0;
    setAttempt((a) => a + 1);
  }, [scroll]);

  // -------------------------------------------------------------------------
  // Wheel + vertical touch-drag adjust targetScroll (paused while panel open).
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (status !== "ready") return;
    const el = wrapperRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (scroll.paused) return;
      scroll.targetScroll = Math.min(
        LAST,
        Math.max(0, scroll.targetScroll + e.deltaY * 0.0016),
      );
      scroll.lastInput = performance.now();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1)
        touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (scroll.paused) return;
      const t = touchRef.current;
      if (!t || e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const dx = x - t.x;
      const dy = t.y - y;
      // advance the cursor regardless so per-move deltas stay correct
      t.x = x;
      t.y = y;
      // only treat as a morph swipe when the gesture is mostly vertical;
      // horizontal-dominant drags fall through to OrbitControls for rotation
      if (Math.abs(dy) <= Math.abs(dx) * 1.3) return;
      scroll.targetScroll = Math.min(
        LAST,
        Math.max(0, scroll.targetScroll + dy * 0.006),
      );
      scroll.lastInput = performance.now();
    };
    const onTouchEnd = () => {
      touchRef.current = null;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [status, scroll]);

  // -------------------------------------------------------------------------
  // Pointer tracking + click-vs-drag detection on the canvas wrapper.
  // -------------------------------------------------------------------------
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
    const sinceRotate = performance.now() - rotatedAtRef.current;
    // a click is short, near-stationary, NOT an in-progress OrbitControls drag,
    // and NOT immediately after a rotation just ended (monotonic guard)
    if (held <= 220 && moved < 7 && !scroll.rotating && sinceRotate > 250) {
      const section = ORGANS[Math.round(scroll.scrollPos)].section;
      setPanel({ section, anchor: { x: e.clientX, y: e.clientY } });
    }
  };

  const onActive = useCallback((i: number) => setActiveIndex(i), []);
  const onRotateStart = useCallback(() => {
    scroll.rotating = true;
  }, [scroll]);
  const onRotateEnd = useCallback(() => {
    // Clear the live-drag flag synchronously and stamp a monotonic time.
    // handlePointerUp rejects clicks within ~250ms of this, immune to the
    // event-ordering / pointer-capture gaps that a 0ms timeout couldn't cover.
    scroll.rotating = false;
    rotatedAtRef.current = performance.now();
  }, [scroll]);

  const closePanel = useCallback(() => setPanel(null), []);

  // Click a rail tick → animate targetScroll to that organ (frame loop eases).
  const goToOrgan = useCallback(
    (i: number) => {
      if (panelOpen) return;
      scroll.targetScroll = i;
      scroll.lastInput = performance.now();
    },
    [panelOpen, scroll],
  );

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: "#070808" }}>
      {/* canvas wrapper: pointer tracking + click-vs-drag live here only */}
      <div
        ref={wrapperRef}
        className="absolute inset-0"
        style={{ touchAction: "none" }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {status === "ready" && sim && clouds && (
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
              clouds={clouds}
              ndc={ndc}
              scroll={scroll}
              onActive={onActive}
              onRotateStart={onRotateStart}
              onRotateEnd={onRotateEnd}
            />
          </Canvas>
        )}
      </div>

      {/* overlay type: non-interactive except where re-enabled */}
      <div className="pointer-events-none absolute inset-0 z-10">
        <header className="absolute left-6 top-6 md:left-10 md:top-10">
          <h1
            style={{
              fontFamily: FRAUNCES,
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
        </header>

        {/* right rail: three organ ticks, active label, scroll hint */}
        {status === "ready" && (
          <nav
            aria-label="organ sections"
            className="pointer-events-auto absolute right-5 top-1/2 flex -translate-y-1/2 flex-col items-end gap-5 md:right-8"
          >
            {ORGANS.map((organ, i) => {
              const active = i === activeIndex;
              return (
                <button
                  key={organ.id}
                  type="button"
                  onClick={() => goToOrgan(i)}
                  aria-current={active ? "true" : undefined}
                  aria-label={`${organ.label} — ${siteLabels[organ.section]}`}
                  className="flex cursor-pointer items-center gap-3 bg-transparent focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-[#e8e3d8]/60"
                  style={{ border: "none", padding: 0, borderRadius: 0 }}
                >
                  {active && (
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: "0.6rem",
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        color: BONE,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {organ.label} · {siteLabels[organ.section]}
                    </span>
                  )}
                  <span
                    aria-hidden
                    style={{
                      // Fixed 14x2 box; active/inactive expressed via transform +
                      // opacity only (no layout-affecting width/height animation).
                      display: "block",
                      width: 14,
                      height: 2,
                      background: BONE,
                      transformOrigin: "right center",
                      // inactive: shrink to ~10px wide x 1px tall, dim to 35%
                      transform: active ? "scaleX(1) scaleY(1)" : "scaleX(0.714) scaleY(0.5)",
                      opacity: active ? 1 : 0.35,
                      transition: reducedMotion
                        ? "none"
                        : "transform 180ms ease, opacity 180ms ease",
                    }}
                  />
                </button>
              );
            })}
            <span
              aria-hidden
              style={{
                fontFamily: MONO,
                fontSize: "0.58rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(232, 227, 216, 0.4)",
                marginTop: "0.5rem",
                whiteSpace: "nowrap",
              }}
            >
              scroll · click to open
            </span>
          </nav>
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

      {/* section panel anchored at the click point */}
      {panel && (
        <SectionPanel
          section={panel.section}
          anchor={panel.anchor}
          onClose={closePanel}
        />
      )}

      {/* ambient EKG strip along the bottom edge */}
      <EcgStrip />
    </div>
  );
}
