"use client";

// Atlas PAPER texture (formerly the fluoroscopy overlay — same export/filename
// so imports don't break). It dresses the cream ground like an 1800s engraving
// plate: subtle paper-fiber grain, a light plate vignette, a whisper-quiet
// cursor smudge/lens, and — replacing the old static CSS hatch — a CANVAS
// cross-hatch of short diagonal ink strokes that are gently displaced AWAY
// from the cursor and spring back, like nudging loose engraving lines. All
// layers are pointer-events-none and driven by a single rAF reading the shared
// `pointer` channel — never setState per frame, never blocking pointer events.
// No scanlines, no glow, no neon.

import type { JSX } from "react";
import { useEffect, useRef } from "react";
import { pointer } from "@/lib/sceneStore";

// Low-opacity paper-fiber grain: feTurbulence rendered once to a data-URI, then
// drifted with a slow transform-only animation. Encoded inline so there is no
// extra fetch. A higher base frequency reads as fine paper tooth rather than
// film grain.
const GRAIN_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220">' +
      '<filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.82" ' +
      'numOctaves="3" stitchTiles="stitch"/>' +
      '<feColorMatrix type="saturate" values="0"/></filter>' +
      '<rect width="220" height="220" filter="url(#g)"/></svg>',
  );

// ---- hatch layer tuning -----------------------------------------------------
const HATCH_SPACING = 22; // css px between stroke centers
const HATCH_LEN_MIN = 7; // css px — shortest stroke
const HATCH_LEN_MAX = 10; // css px — longest stroke
const HATCH_ALPHA = 0.065; // ink alpha of the whole hatch
const HATCH_JITTER = 4; // css px of positional jitter per stroke
const REPEL_RADIUS = 140; // css px — falloff radius around the cursor
const REPEL_PUSH = 10; // css px — max displacement at the cursor center

export default function Fluoroscopy(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const grainRef = useRef<HTMLDivElement>(null);
  const hatchRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const lens = lensRef.current;
    const grain = grainRef.current;
    const canvas = hatchRef.current;
    if (!root || !lens || !grain || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // honor reduced-motion: no rAF at all — the hatch is painted once,
    // undisplaced (grain drift CSS is already disabled via media query below)
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let running = false;
    let lastTs = 0;
    let dpr = 1;
    let cssW = 0;
    let cssH = 0;

    // eased pointer position 0..1 so the lens glides rather than snaps
    let ex = 0.5;
    let ey = 0.5;

    // ---- hatch state: typed-array base positions + live offsets -------------
    // baseX/baseY — stroke centers; hx/hy — half-segment vector (direction *
    // half length); offX/offY — current displacement, eased toward a target
    // that points away from the cursor with smooth falloff.
    let count = 0;
    let baseX = new Float32Array(0);
    let baseY = new Float32Array(0);
    let hx = new Float32Array(0);
    let hy = new Float32Array(0);
    let offX = new Float32Array(0);
    let offY = new Float32Array(0);
    // once every offset has settled (cursor gone / at rest) we stop repainting
    let settled = false;

    const buildGrid = () => {
      const cols = Math.ceil(cssW / HATCH_SPACING) + 2;
      const rows = Math.ceil(cssH / HATCH_SPACING) + 2;
      count = cols * rows;
      baseX = new Float32Array(count);
      baseY = new Float32Array(count);
      hx = new Float32Array(count);
      hy = new Float32Array(count);
      offX = new Float32Array(count);
      offY = new Float32Array(count);
      let i = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++, i++) {
          baseX[i] =
            (c - 0.5) * HATCH_SPACING + (Math.random() * 2 - 1) * HATCH_JITTER;
          baseY[i] =
            (r - 0.5) * HATCH_SPACING + (Math.random() * 2 - 1) * HATCH_JITTER;
          // ~45° (lower-left → upper-right) with a touch of angular jitter so
          // the field reads hand-hatched, not printed
          const ang = -Math.PI / 4 + (Math.random() * 2 - 1) * 0.12;
          const len =
            HATCH_LEN_MIN + Math.random() * (HATCH_LEN_MAX - HATCH_LEN_MIN);
          hx[i] = Math.cos(ang) * len * 0.5;
          hy[i] = Math.sin(ang) * len * 0.5;
        }
      }
      settled = false;
    };

    // one batched path per frame — a single beginPath/stroke for all strokes
    const drawHatch = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.strokeStyle = `rgba(26,23,20,${HATCH_ALPHA})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const x = baseX[i] + offX[i];
        const y = baseY[i] + offY[i];
        ctx.moveTo(x - hx[i], y - hy[i]);
        ctx.lineTo(x + hx[i], y + hy[i]);
      }
      ctx.stroke();
    };

    const resize = () => {
      dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      cssW = Math.max(1, root.clientWidth);
      cssH = Math.max(1, root.clientHeight);
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      buildGrid();
      drawHatch(); // immediate paint — this is also the reduced-motion static state
    };

    const R2 = REPEL_RADIUS * REPEL_RADIUS;

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      if (lastTs === 0) {
        lastTs = ts;
        return;
      }
      let dt = (ts - lastTs) / 1000;
      lastTs = ts;
      if (dt > 0.05) dt = 0.05;

      // ease toward the live normalized pointer (read-only; no renders)
      ex += (pointer.nx - ex) * 0.08;
      ey += (pointer.ny - ey) * 0.08;

      // (1) faint ink smudge / lens following the cursor. On cream the lens is
      // a barely-there darkening (ink at <=0.05) — like a thumb pressed to the
      // plate, never a glow.
      lens.style.background = `radial-gradient(34% 26% at ${(ex * 100).toFixed(
        2,
      )}% ${(ey * 100).toFixed(
        2,
      )}%, rgba(26,23,20,0.05), rgba(26,23,20,0.018) 45%, transparent 72%)`;

      // (2) grain parallax — shift a few px toward the cursor (transform only).
      // ±5px is the whole travel, centered, so the paper tooth stays still-ish.
      const gx = (ex - 0.5) * 10;
      const gy = (ey - 0.5) * 10;
      grain.style.transform = `translate3d(${gx.toFixed(2)}px, ${gy.toFixed(
        2,
      )}px, 0)`;

      // (3) hatch repulsion — each stroke's offset eases toward a target that
      // pushes it AWAY from the cursor (smoothstep falloff over REPEL_RADIUS),
      // and back to zero when the cursor leaves. Direct eased offset doubles
      // as the spring-back.
      const px = pointer.x;
      const py = pointer.y;
      // pointer.t === 0 means PointerBridge has never written the channel —
      // don't repel toward the default (0,0) corner before any real input
      const live = pointer.t > 0;
      const k = 1 - Math.exp(-dt * 9); // framerate-independent easing
      let maxMoveSq = 0;
      for (let i = 0; i < count; i++) {
        const dx = baseX[i] - px;
        const dy = baseY[i] - py;
        const d2 = dx * dx + dy * dy;
        let tx = 0;
        let ty = 0;
        if (live && d2 < R2 && d2 > 1e-4) {
          const d = Math.sqrt(d2);
          const t = 1 - d / REPEL_RADIUS;
          const fall = t * t * (3 - 2 * t); // smoothstep falloff
          const f = (REPEL_PUSH * fall) / d;
          tx = dx * f;
          ty = dy * f;
        }
        const nx = offX[i] + (tx - offX[i]) * k;
        const ny = offY[i] + (ty - offY[i]) * k;
        const mx = nx - offX[i];
        const my = ny - offY[i];
        const m = mx * mx + my * my;
        if (m > maxMoveSq) maxMoveSq = m;
        offX[i] = nx;
        offY[i] = ny;
      }
      // repaint only while something is actually moving; draw one final frame
      // when motion dies so the field rests exactly on its targets
      if (maxMoveSq > 1e-4) {
        settled = false;
        drawHatch();
      } else if (!settled) {
        settled = true;
        drawHatch();
      }
    };

    const start = () => {
      if (running || reduce) return;
      running = true;
      lastTs = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(root);
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();

    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1]"
    >
      {/* (a) light plate vignette — sepia/ink warming the edges of the cream
          ground so it sits like a printed page, not a flat fill. Kept soft. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(125% 105% at 50% 46%, transparent 58%, rgba(138,122,92,0.10) 84%, rgba(26,23,20,0.16) 100%)",
        }}
      />
      {/* (b) cursor-following ink smudge / lens — gradient written each rAF.
          Starts centered so the first paint matches the resting pointer. */}
      <div
        ref={lensRef}
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(34% 26% at 50% 50%, rgba(26,23,20,0.05), rgba(26,23,20,0.018) 45%, transparent 72%)",
          willChange: "background",
          mixBlendMode: "multiply",
        }}
      />
      {/* (c) very low-opacity drifting paper-fiber grain. Inner layer keeps the
          slow autonomous drift; the wrapper takes the cursor parallax transform
          so the two transforms don't fight. multiply keeps it dark-on-cream. */}
      <div
        ref={grainRef}
        className="absolute inset-0"
        style={{ willChange: "transform" }}
      >
        <div
          className="paper-grain absolute -inset-[120px] opacity-[0.06]"
          style={{
            backgroundImage: `url("${GRAIN_SVG}")`,
            backgroundRepeat: "repeat",
            mixBlendMode: "multiply",
            animation: "paperDrift 18s linear infinite",
            willChange: "transform",
          }}
        />
      </div>
      {/* (d) engraving cross-hatch CANVAS — short diagonal ink strokes nudged
          away from the cursor with smooth falloff, springing back at rest.
          Static (undisplaced) under prefers-reduced-motion. */}
      <canvas ref={hatchRef} className="absolute inset-0 h-full w-full" />
      <style>{`
        @keyframes paperDrift {
          0%   { transform: translate3d(0, 0, 0); }
          25%  { transform: translate3d(-22px, 16px, 0); }
          50%  { transform: translate3d(16px, -18px, 0); }
          75%  { transform: translate3d(-14px, -10px, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .paper-grain { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
