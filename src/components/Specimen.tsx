/* eslint-disable react-hooks/immutability -- R3F mutates three.js objects in useFrame; standard pattern */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  BAKED_COUNT,
  MOBILE_COUNT,
  ORGAN_WORLD,
  loadOrganCloud,
} from "@/lib/organData";
import { buildNameCloud } from "@/lib/nameCloud";
import { ParticleSim, type PointerState } from "@/lib/particleSim";
import { STATES, useScene, sceneActions, pointer } from "@/lib/sceneStore";
import { TAGLINE } from "@/data/content";

// ---------------------------------------------------------------------------
// Camera. fov 42; distance frames a height-ORGAN_WORLD organ at ~120% (so the
// organ overflows the edges and feels immersive). The intro name cloud is built
// at worldHeight≈3, so it simply occupies the middle third of the frame and
// reads fully — exactly what the contract asks for.
// ---------------------------------------------------------------------------
const FOV = 42;
const FIT_DISTANCE = (ORGAN_WORLD * 0.5) / Math.tan(((FOV / 2) * Math.PI) / 180);
const CAMERA_Z = FIT_DISTANCE * 0.82; // ~120% overflow for the organ

const NAME_TEXT = "Mounish Mavuduru";
const NAME_WORLD_HEIGHT = 3.0;

const BONE = "#e8e3d8";

const LAST = STATES.length - 1; // 3 (liver)

// ---------------------------------------------------------------------------
// Palette per state, as [lo, hi] mixed by pow(seed) in the fragment shader.
// Crossfaded each frame toward the active state's palette.
//   intro : bone -> white (the name reads bright on black)
//   heart : blood -> bone flecks
//   brain : BRIGHT cool ivory, high contrast so the folded form reads clearly
//   liver : desaturated oxblood -> warm bone
// ---------------------------------------------------------------------------
type Rgb = [number, number, number];

const INTRO_LO: Rgb = [0.82, 0.8, 0.76]; // warm bone
const INTRO_HI: Rgb = [1.0, 1.0, 0.99]; // near white
const HEART_LO: Rgb = [0.651, 0.106, 0.106]; // blood #a61b1b
const HEART_HI: Rgb = [0.91, 0.89, 0.847]; // bone #e8e3d8 flecks
// Brighter, higher-contrast brain so the heavily-folded mesh reads as a form
// instead of grey static: cool steel #b9c0c4 -> bright ivory #f2efe6.
const BRAIN_LO: Rgb = [0.725, 0.753, 0.769]; // #b9c0c4
const BRAIN_HI: Rgb = [0.949, 0.937, 0.902]; // #f2efe6
const LIVER_LO: Rgb = [0.494, 0.169, 0.141]; // desaturated oxblood #7e2b24
const LIVER_HI: Rgb = [0.725, 0.663, 0.604]; // #b9a99a

// Indexed by STATE order: intro, heart, brain, liver.
const PALETTES: { lo: Rgb; hi: Rgb; base: number }[] = [
  { lo: INTRO_LO, hi: INTRO_HI, base: 0.62 }, // intro: bright, readable
  { lo: HEART_LO, hi: HEART_HI, base: 0.5 },
  { lo: BRAIN_LO, hi: BRAIN_HI, base: 0.66 }, // brain: higher base alpha so it reads
  { lo: LIVER_LO, hi: LIVER_HI, base: 0.5 },
];

function lerpRgb(out: Rgb, a: Rgb, b: Rgb, t: number) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}

// ---------------------------------------------------------------------------
// Shaders.
// Vertex: per-seed shimmer + depth-attenuated point size, and it forwards the
// view-space depth so the fragment shader can brighten near/front-facing points
// (this is the brain-clarity fix: closer points read brighter, so the folded
// form separates from the background instead of flattening into static).
// ---------------------------------------------------------------------------
const VERT = /* glsl */ `
attribute float aSeed;

uniform float uTime;
uniform float uPixelRatio;
uniform float uFocusZ;

varying float vSeed;
varying float vDepth; // 0 = far, 1 = near (front-facing toward the camera)

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

  // -mv.z is the distance in front of the camera. Map the slab that the cloud
  // occupies (roughly uFocusZ ± ORGAN_WORLD*0.6) into 0..1 so front points -> 1.
  float dist = -mv.z;
  vDepth = clamp((uFocusZ + ${(ORGAN_WORLD * 0.6).toFixed(3)} - dist) /
                 ${(ORGAN_WORLD * 1.2).toFixed(3)}, 0.0, 1.0);

  // depth-attenuated point size, clamped so near points don't blow up
  float depthFactor = clamp(uFocusZ / max(dist, 0.1), 0.35, 2.4);
  gl_PointSize = 2.0 * uPixelRatio * depthFactor;
}
`;

// Fragment: soft round alpha, sparse high-color flecks, NormalBlending. The
// uBrightFront uniform mixes in depth-based brightening (front points brighter)
// — restrained for organs, stronger for the brain so it reads as a clear form.
const FRAG = /* glsl */ `
precision mediump float;

uniform vec3 uColorLo;
uniform vec3 uColorHi;
uniform float uBaseAlpha;   // per-state base opacity
uniform float uBrightFront; // 0..1 depth-brightness strength

varying float vSeed;
varying float vDepth;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;

  // soft round alpha
  float core = smoothstep(0.5, 0.16, d);

  // front-facing points get more alpha so closer surfaces read as solid form
  float front = mix(1.0, 0.55 + 0.85 * vDepth, uBrightFront);
  float alpha = core * uBaseAlpha * (0.55 + 0.45 * vSeed) * front;

  // sparse high-color flecks: most particles stay on the base color, tail
  // flecks toward the light tone. Near points also lift toward the high color
  // so the front surface of the form brightens (the readable highlight).
  float fleck = pow(vSeed, 3.0) * 0.85;
  fleck = clamp(fleck + uBrightFront * vDepth * 0.5, 0.0, 1.0);
  vec3 col = mix(uColorLo, uColorHi, fleck);

  gl_FragColor = vec4(col, alpha);
}
`;

// ---------------------------------------------------------------------------
// Scroll-morph + interaction state, mutated outside React's render cycle.
// ---------------------------------------------------------------------------
interface ScrollChannel {
  scrollPos: number; // continuous position in [0, LAST]
  targetScroll: number; // where input wants us to go
  lastInput: number; // performance.now() of last wheel/touch nudge
  paused: boolean; // true while a panel is open (freeze morph + settle)
  rotating: boolean; // OrbitControls drag in progress
}

// The canvas rect, kept fresh so we can map the global pointer (clientX/Y) into
// NDC over the canvas each frame without a getBoundingClientRect() per frame.
interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// The point cloud. Owns geometry/material, runs the sim, morphs across the four
// state clouds, crossfades color/alpha, reports the active index/progress, and
// does the pointer physics by reading the global pointer channel.
// ---------------------------------------------------------------------------
function PointCloud({
  sim,
  clouds,
  scroll,
  rect,
  onRotateStart,
  onRotateEnd,
}: {
  sim: ParticleSim;
  clouds: Float32Array[];
  scroll: ScrollChannel;
  rect: React.RefObject<CanvasRect | null>;
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
    g.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, 0, 0),
      ORGAN_WORLD,
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
        uColorLo: {
          value: new THREE.Color(INTRO_LO[0], INTRO_LO[1], INTRO_LO[2]),
        },
        uColorHi: {
          value: new THREE.Color(INTRO_HI[0], INTRO_HI[1], INTRO_HI[2]),
        },
        uBaseAlpha: { value: PALETTES[0].base },
        uBrightFront: { value: 0 },
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

  // Local-space pointer state handed to the sim each frame.
  const simPointer = useRef<PointerState>({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    active: false,
  });

  // Preallocated scratch — morph target buffer + color/alpha accumulators.
  const scratch = useMemo(() => new Float32Array(count * 3), [count]);
  const colorAcc = useMemo(
    () => ({
      lo: [...INTRO_LO] as Rgb,
      hi: [...INTRO_HI] as Rgb,
      base: PALETTES[0].base,
      bright: 0,
    }),
    [],
  );
  const lastActive = useRef(0);
  const lastReportedProgress = useRef(-1);

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
      // once input has been idle ~140ms, settle toward the nearest integer.
      if (idleMs > 140) {
        const snap = Math.round(s.targetScroll);
        s.targetScroll += (snap - s.targetScroll) * Math.min(1, dt * 6);
      }
      s.scrollPos += (s.targetScroll - s.scrollPos) * Math.min(1, dt * 7);
    }
    s.scrollPos = Math.min(LAST, Math.max(0, s.scrollPos));

    // build the per-particle blend cloud[i] -> cloud[i+1]
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

    // report progress to the store, throttled to meaningful deltas (so the
    // rail / intro overlay update without thrashing the store every frame).
    // setProgress derives index = round(progress) internally, so the store's
    // integer `index` stays correct without a separate setIndex call (calling
    // setIndex here would snap progress back to the integer for one frame).
    if (Math.abs(pos - lastReportedProgress.current) > 0.01) {
      lastReportedProgress.current = pos;
      sceneActions.setProgress(pos);
    }
    // On the rare settle (e.g. a programmatic jump that lands exactly), push a
    // final exact integer once so progress/index agree at rest.
    const active = Math.round(pos);
    if (active !== lastActive.current) {
      lastActive.current = active;
      if (Math.abs(pos - active) < 1e-4) sceneActions.setIndex(active);
    }

    // --- color / alpha / brightness crossfade toward the active palette --
    const pal = PALETTES[active];
    const cLerp = Math.min(1, dt * 4);
    lerpRgb(colorAcc.lo, colorAcc.lo, pal.lo, cLerp);
    lerpRgb(colorAcc.hi, colorAcc.hi, pal.hi, cLerp);
    colorAcc.base += (pal.base - colorAcc.base) * cLerp;
    // brain gets the strongest front-brightness; others get a restrained touch
    const targetBright = active === 2 ? 1.0 : active === 0 ? 0.25 : 0.45;
    colorAcc.bright += (targetBright - colorAcc.bright) * cLerp;

    const uLo = material.uniforms.uColorLo.value as THREE.Color;
    const uHi = material.uniforms.uColorHi.value as THREE.Color;
    uLo.setRGB(colorAcc.lo[0], colorAcc.lo[1], colorAcc.lo[2]);
    uHi.setRGB(colorAcc.hi[0], colorAcc.hi[1], colorAcc.hi[2]);
    material.uniforms.uBaseAlpha.value = colorAcc.base;
    material.uniforms.uBrightFront.value = colorAcc.bright;

    // --- pointer physics in the rotating group's local space ------------
    // Map the global pointer (clientX/Y) into NDC over the canvas rect, then
    // unproject onto the camera-facing plane through the origin.
    const r = rect.current;
    const sp = simPointer.current;
    const overCanvas =
      r !== null &&
      r.width > 0 &&
      r.height > 0 &&
      pointer.x >= r.left &&
      pointer.x <= r.left + r.width &&
      pointer.y >= r.top &&
      pointer.y <= r.top + r.height &&
      !pointer.overEkg;

    if (overCanvas && group && r) {
      const ndcX = ((pointer.x - r.left) / r.width) * 2 - 1;
      const ndcY = -(((pointer.y - r.top) / r.height) * 2 - 1);
      tmp.ndcVec.set(ndcX, ndcY);
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

        sp.x = tmp.local.x;
        sp.y = tmp.local.y;
        sp.z = tmp.local.z;
        sp.vx = tmp.smoothVel.x;
        sp.vy = tmp.smoothVel.y;
        sp.vz = tmp.smoothVel.z;
        sp.active = true;
      } else {
        sp.active = false;
        tmp.hasPrev = false;
      }
    } else {
      sp.active = false;
      tmp.hasPrev = false;
      tmp.smoothVel.set(0, 0, 0);
    }

    sim.update(dt, sp);
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
        autoRotateSpeed={0.85}
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

// ---------------------------------------------------------------------------
export default function Specimen() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [progress, setProgress] = useState(0);
  const [sim, setSim] = useState<ParticleSim | null>(null);
  const [clouds, setClouds] = useState<Float32Array[] | null>(null);
  const [attempt, setAttempt] = useState(0);

  // active state index drives only the rail; it changes a handful of times.
  const activeIndex = useScene((s) => s.index);
  const panelOpen = useScene((s) => s.panel.open);

  // Live channels: stable identity, mutated outside the render cycle.
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

  // Canvas rect kept fresh (resize + scroll) for the per-frame NDC mapping.
  const rectRef = useRef<CanvasRect | null>(null);

  // Honor prefers-reduced-motion for the rail tick transition.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // keep scroll.paused in sync with panel state (read inside the frame loop)
  useEffect(() => {
    scroll.paused = panelOpen;
  }, [panelOpen, scroll]);

  // -------------------------------------------------------------------------
  // Keep the cached canvas rect fresh.
  // -------------------------------------------------------------------------
  const measure = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    rectRef.current = {
      left: b.left,
      top: b.top,
      width: b.width,
      height: b.height,
    };
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [status, measure]);

  // -------------------------------------------------------------------------
  // Build the four state clouds: intro name (runtime) + three organs (fetched).
  // The name cloud is rebuilt after fonts are ready and on resize so the bold
  // Bricolage glyphs render crisply at the current DPR.
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const count = getCount();
    const organStates = STATES.filter((st) => st.organFile !== null);
    const pcts = new Array(organStates.length).fill(0) as number[];

    const report = () => {
      if (cancelled) return;
      const avg = pcts.reduce((s, v) => s + v, 0) / organStates.length;
      setProgress(Math.max(0, Math.min(100, Math.round(avg))));
    };

    // Build the name cloud after fonts settle so glyph metrics are final.
    const nameReady: Promise<Float32Array> = (
      document.fonts?.ready ?? Promise.resolve()
    ).then(() => buildNameCloud(NAME_TEXT, count, NAME_WORLD_HEIGHT));

    Promise.all([
      nameReady,
      ...organStates.map((st, idx) =>
        loadOrganCloud(st.organFile as string, count, (pct) => {
          pcts[idx] = pct;
          report();
        }),
      ),
    ])
      .then((loaded) => {
        if (cancelled) return;
        // loaded = [name, heart, brain, liver] — already in STATES order.
        const next = new ParticleSim(count);
        next.setTargets(loaded[0]); // seed with the intro name cloud
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

  // Rebuild only the name cloud on resize (organs are scale-independent). Keep
  // the same Float32Array identity by mutating clouds[0] in place so the frame
  // loop's `a === b` fast-path and morph stay valid.
  useEffect(() => {
    if (status !== "ready" || !clouds) return;
    let raf = 0;
    const rebuild = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const count = clouds[0].length / 3;
        const fresh = buildNameCloud(NAME_TEXT, count, NAME_WORLD_HEIGHT);
        clouds[0].set(fresh);
      });
    };
    window.addEventListener("resize", rebuild);
    return () => {
      window.removeEventListener("resize", rebuild);
      cancelAnimationFrame(raf);
    };
  }, [status, clouds]);

  const retry = useCallback(() => {
    setStatus("loading");
    setProgress(0);
    setSim(null);
    setClouds(null);
    scroll.scrollPos = 0;
    scroll.targetScroll = 0;
    sceneActions.setIndex(0);
    sceneActions.setProgress(0);
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
        touchRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (scroll.paused) return;
      const t = touchRef.current;
      if (!t || e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const dx = x - t.x;
      const dy = t.y - y;
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
  // Click-vs-drag → open panel. We attach our OWN pointerdown/up listeners on
  // the canvas container so OrbitControls can't swallow the pointerup (the v2
  // bug). A click is short (<220ms), near-stationary (<7px), NOT an in-flight
  // OrbitControls drag, NOT just-after a rotation, NOT over a UI overlay, and
  // only opens for organ states (index 1..3 carry a section; intro is null).
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (status !== "ready") return;
    const el = wrapperRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      downRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onUp = (e: PointerEvent) => {
      const d = downRef.current;
      downRef.current = null;
      if (!d) return;
      if (scroll.paused) return; // panel already open
      const held = performance.now() - d.t;
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      // Click-vs-drag rests ONLY on per-gesture movement/time. We do NOT consult
      // scroll.rotating: three's OrbitControls dispatches its 'start' event
      // synchronously on every left pointerdown (state→ROTATE even for a
      // stationary click), and fires 'end' at document level AFTER this bubble
      // listener — so scroll.rotating is true for 100% of pointerups and would
      // reject every click. A genuine drag still moves >=7px (rejected by
      // `moved`); a held press is rejected by `held`. sinceRotate is likewise
      // dropped: rotatedAtRef is stamped by the document-level 'end' that runs
      // after onUp, so it only ever held the PREVIOUS gesture's timestamp.
      if (held > 220 || moved >= 7) {
        return;
      }
      // reject clicks that land on an interactive UI overlay (rail, contact
      // buttons, console, intro buttons) — those handle their own pointers.
      const target = e.target as HTMLElement | null;
      if (target && target.closest("[data-ui-overlay]")) return;
      // intro (index 0) has no section → no panel
      const st = STATES[Math.round(scroll.scrollPos)];
      if (!st.section) return;
      sceneActions.openPanel(st.section, { x: e.clientX, y: e.clientY });
    };
    const onCancel = () => {
      downRef.current = null;
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    el.addEventListener("pointerleave", onCancel);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("pointerleave", onCancel);
    };
  }, [status, scroll]);

  const onRotateStart = useCallback(() => {
    scroll.rotating = true;
  }, [scroll]);
  const onRotateEnd = useCallback(() => {
    // Clear the live-drag flag synchronously and stamp a monotonic time.
    // onUp rejects clicks within ~250ms of this, immune to the event-ordering /
    // pointer-capture gaps a 0ms timeout couldn't cover.
    scroll.rotating = false;
    rotatedAtRef.current = performance.now();
  }, [scroll]);

  // Click a rail tick → ease targetScroll to that state (frame loop eases).
  const goToState = useCallback(
    (i: number) => {
      if (panelOpen) return;
      scroll.targetScroll = i;
      scroll.lastInput = performance.now();
    },
    [panelOpen, scroll],
  );

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: "#070808" }}
    >
      {/* canvas wrapper: pointer/click-vs-drag detection lives here */}
      <div
        ref={wrapperRef}
        className="absolute inset-0"
        style={{ touchAction: "none" }}
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
            onCreated={measure}
          >
            <color attach="background" args={["#070808"]} />
            <PointCloud
              sim={sim}
              clouds={clouds}
              scroll={scroll}
              rect={rectRef}
              onRotateStart={onRotateStart}
              onRotateEnd={onRotateEnd}
            />
          </Canvas>
        )}
      </div>

      {/* right rail: bars ONLY (4 ticks for the 4 states), no text labels.
          z below intro/panel overlays; marked as a UI overlay so a tick click
          never doubles as an organ click. */}
      {status === "ready" && (
        <nav
          aria-label="specimen states"
          data-ui-overlay
          className="absolute right-5 top-1/2 z-20 flex -translate-y-1/2 flex-col items-end gap-4 md:right-8"
        >
          {STATES.map((st, i) => {
            const active = i === activeIndex;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => goToState(i)}
                aria-current={active ? "true" : undefined}
                aria-label={st.label}
                className="flex cursor-pointer items-center bg-transparent focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-[#e8e3d8]/60"
                style={{ border: "none", padding: "4px 0", borderRadius: 0 }}
              >
                <span
                  aria-hidden
                  style={{
                    // fixed box; active/inactive via transform + opacity only
                    display: "block",
                    width: 16,
                    height: 2,
                    background: BONE,
                    transformOrigin: "right center",
                    // active: full; inactive: shorter + thinner + dim
                    transform: active
                      ? "scaleX(1) scaleY(1)"
                      : "scaleX(0.5) scaleY(0.5)",
                    opacity: active ? 1 : 0.32,
                    transition: reducedMotion
                      ? "none"
                      : "transform 180ms ease, opacity 180ms ease",
                  }}
                />
              </button>
            );
          })}
        </nav>
      )}

      {/* loading / error overlays */}
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p
            style={{
              fontFamily:
                'var(--font-mono), "IBM Plex Mono", ui-monospace, Menlo, monospace',
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
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
          <p
            style={{
              fontFamily:
                'var(--font-mono), "IBM Plex Mono", ui-monospace, Menlo, monospace',
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
            data-ui-overlay
            className="cursor-pointer focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-[#e8e3d8]/60"
            style={{
              fontFamily:
                'var(--font-mono), "IBM Plex Mono", ui-monospace, Menlo, monospace',
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

      {/* screen-reader-only context (the visible tagline lives in IntroBlock).
          Inline visually-hidden styles so this doesn't depend on a utility
          class existing in globals.css. */}
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        Mounish Mavuduru. {TAGLINE}
      </span>
    </div>
  );
}
