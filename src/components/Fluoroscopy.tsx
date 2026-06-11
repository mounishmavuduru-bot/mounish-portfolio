"use client";

// Atlas PAPER ground (formerly the fluoroscopy overlay — same export/filename
// so imports don't break). This round trades the hand-hatched engraving field
// for a drafting-table layer: a fine, crisp GRAPH grid (sepia minors, ink
// majors) drawn on canvas. The grid is perfectly straight — synthetic —
// except near the cursor, where line vertices bow away with a smooth falloff
// and ease back, like the sheet flexing under a hovering nib. Beneath it the
// flat cream is replaced (in globals.css) by a matte single-hue gradient.
// Paper-fiber grain + plate vignette stay, toned down to coexist with the
// grid; the whisper-quiet cursor smudge/lens stays. All layers are
// pointer-events-none and driven by a single rAF reading the shared `pointer`
// channel — never setState per frame, never blocking pointer events.
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

// ---- graph-grid layer tuning ------------------------------------------------
const GRID_MINOR = 26; // css px between minor grid lines
const GRID_MAJOR_EVERY = 5; // every Nth minor line is a major line
const MINOR_STYLE = "rgba(138,122,92,0.05)"; // sepia minors ≈ ink @ ~0.035
const MAJOR_STYLE = "rgba(26,23,20,0.055)"; // ink majors
const SEG = 24; // css px between polyline vertices (bow smoothness)
const WARP_RADIUS = 150; // css px — falloff radius around the cursor
const WARP_PUSH = 8; // css px — max vertex displacement at the cursor

export default function Fluoroscopy(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const grainRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const lens = lensRef.current;
    const grain = grainRef.current;
    const canvas = gridRef.current;
    if (!root || !lens || !grain || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // honor reduced-motion: no rAF at all — the grid is painted once, perfectly
    // straight (grain drift CSS is already disabled via media query below)
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

    // ---- grid state: typed-array vertex positions + live offsets ------------
    // Horizontal lines sit at r*GRID_MINOR and are subdivided into hVerts
    // vertices at the fixed x positions hX[j]; each vertex carries a live
    // PERPENDICULAR offset hOff (y for horizontal lines, x for vertical),
    // eased toward a target that points away from the cursor with smoothstep
    // falloff. Perpendicular-only displacement keeps the bow clean: a line the
    // cursor sits ON stays put while its neighbors belly away.
    let hCount = 0; // horizontal line count
    let vCount = 0; // vertical line count
    let hVerts = 0; // vertices per horizontal line
    let vVerts = 0; // vertices per vertical line
    let hX = new Float32Array(0); // x of each vertex along a horizontal line
    let vY = new Float32Array(0); // y of each vertex along a vertical line
    let hOff = new Float32Array(0); // [line*hVerts+j] current y offset
    let vOff = new Float32Array(0); // [line*vVerts+j] current x offset
    // once every offset has settled (cursor gone / at rest) we stop repainting
    let settled = false;

    const buildGrid = () => {
      hCount = Math.floor(cssH / GRID_MINOR) + 1;
      vCount = Math.floor(cssW / GRID_MINOR) + 1;
      hVerts = Math.ceil(cssW / SEG) + 1;
      vVerts = Math.ceil(cssH / SEG) + 1;
      hX = new Float32Array(hVerts);
      vY = new Float32Array(vVerts);
      for (let j = 0; j < hVerts; j++) hX[j] = Math.min(j * SEG, cssW);
      for (let j = 0; j < vVerts; j++) vY[j] = Math.min(j * SEG, cssH);
      hOff = new Float32Array(hCount * hVerts);
      vOff = new Float32Array(vCount * vVerts);
      settled = false;
    };

    // two batched paths per frame — one beginPath/stroke per weight class.
    // The +0.5 keeps undisplaced 1px rules crisp on integer-DPR screens.
    const drawGrid = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.lineWidth = 1;
      ctx.lineJoin = "round";
      // minor pass (sepia)
      ctx.strokeStyle = MINOR_STYLE;
      ctx.beginPath();
      for (let r = 0; r < hCount; r++) {
        if (r % GRID_MAJOR_EVERY === 0) continue;
        const y = r * GRID_MINOR + 0.5;
        const base = r * hVerts;
        ctx.moveTo(hX[0], y + hOff[base]);
        for (let j = 1; j < hVerts; j++)
          ctx.lineTo(hX[j], y + hOff[base + j]);
      }
      for (let c = 0; c < vCount; c++) {
        if (c % GRID_MAJOR_EVERY === 0) continue;
        const x = c * GRID_MINOR + 0.5;
        const base = c * vVerts;
        ctx.moveTo(x + vOff[base], vY[0]);
        for (let j = 1; j < vVerts; j++)
          ctx.lineTo(x + vOff[base + j], vY[j]);
      }
      ctx.stroke();
      // major pass (ink) — every GRID_MAJOR_EVERY-th rule
      ctx.strokeStyle = MAJOR_STYLE;
      ctx.beginPath();
      for (let r = 0; r < hCount; r += GRID_MAJOR_EVERY) {
        const y = r * GRID_MINOR + 0.5;
        const base = r * hVerts;
        ctx.moveTo(hX[0], y + hOff[base]);
        for (let j = 1; j < hVerts; j++)
          ctx.lineTo(hX[j], y + hOff[base + j]);
      }
      for (let c = 0; c < vCount; c += GRID_MAJOR_EVERY) {
        const x = c * GRID_MINOR + 0.5;
        const base = c * vVerts;
        ctx.moveTo(x + vOff[base], vY[0]);
        for (let j = 1; j < vVerts; j++)
          ctx.lineTo(x + vOff[base + j], vY[j]);
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
      drawGrid(); // immediate paint — this is also the reduced-motion static state
    };

    const R2 = WARP_RADIUS * WARP_RADIUS;

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

      // (3) grid warp — each vertex's perpendicular offset eases toward a
      // target that bows the line AWAY from the cursor (smoothstep falloff
      // over WARP_RADIUS), and back to zero when the cursor leaves. Direct
      // eased offset doubles as the spring-back.
      const px = pointer.x;
      const py = pointer.y;
      // pointer.t === 0 means PointerBridge has never written the channel —
      // don't warp toward the default (0,0) corner before any real input
      const live = pointer.t > 0;
      const k = 1 - Math.exp(-dt * 9); // framerate-independent easing
      let maxMoveSq = 0;
      // horizontal lines: vertices displace in y only
      for (let r = 0; r < hCount; r++) {
        const dy = r * GRID_MINOR + 0.5 - py;
        const base = r * hVerts;
        const near = live && Math.abs(dy) < WARP_RADIUS;
        for (let j = 0; j < hVerts; j++) {
          let ty = 0;
          if (near) {
            const dx = hX[j] - px;
            const d2 = dx * dx + dy * dy;
            if (d2 < R2 && d2 > 1e-4) {
              const d = Math.sqrt(d2);
              const t = 1 - d / WARP_RADIUS;
              const fall = t * t * (3 - 2 * t); // smoothstep falloff
              ty = (dy / d) * WARP_PUSH * fall;
            }
          }
          const i = base + j;
          const n = hOff[i] + (ty - hOff[i]) * k;
          const m = (n - hOff[i]) * (n - hOff[i]);
          if (m > maxMoveSq) maxMoveSq = m;
          hOff[i] = n;
        }
      }
      // vertical lines: vertices displace in x only
      for (let c = 0; c < vCount; c++) {
        const dx = c * GRID_MINOR + 0.5 - px;
        const base = c * vVerts;
        const near = live && Math.abs(dx) < WARP_RADIUS;
        for (let j = 0; j < vVerts; j++) {
          let tx = 0;
          if (near) {
            const dy = vY[j] - py;
            const d2 = dx * dx + dy * dy;
            if (d2 < R2 && d2 > 1e-4) {
              const d = Math.sqrt(d2);
              const t = 1 - d / WARP_RADIUS;
              const fall = t * t * (3 - 2 * t);
              tx = (dx / d) * WARP_PUSH * fall;
            }
          }
          const i = base + j;
          const n = vOff[i] + (tx - vOff[i]) * k;
          const m = (n - vOff[i]) * (n - vOff[i]);
          if (m > maxMoveSq) maxMoveSq = m;
          vOff[i] = n;
        }
      }
      // repaint only while something is actually moving; draw one final frame
      // when motion dies so the grid rests exactly straight
      if (maxMoveSq > 1e-4) {
        settled = false;
        drawGrid();
      } else if (!settled) {
        settled = true;
        drawGrid();
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
          ground so it sits like a printed page, not a flat fill. Toned down
          this round so it doesn't fight the graph grid. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(125% 105% at 50% 46%, transparent 62%, rgba(138,122,92,0.07) 86%, rgba(26,23,20,0.11) 100%)",
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
          so the two transforms don't fight. multiply keeps it dark-on-cream.
          Opacity lowered (0.06 → 0.04) to coexist with the grid. */}
      <div
        ref={grainRef}
        className="absolute inset-0"
        style={{ willChange: "transform" }}
      >
        <div
          className="paper-grain absolute -inset-[120px] opacity-[0.04]"
          style={{
            backgroundImage: `url("${GRAIN_SVG}")`,
            backgroundRepeat: "repeat",
            mixBlendMode: "multiply",
            animation: "paperDrift 18s linear infinite",
            willChange: "transform",
          }}
        />
      </div>
      {/* (d) drafting graph-grid CANVAS — fine straight rules whose vertices
          bow away from the cursor with smooth falloff, easing back straight
          at rest. Static (perfectly straight) under prefers-reduced-motion. */}
      <canvas ref={gridRef} className="absolute inset-0 h-full w-full" />
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
