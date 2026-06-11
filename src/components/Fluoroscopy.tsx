"use client";

// Atlas PAPER texture (formerly the fluoroscopy overlay — same export/filename
// so imports don't break). It dresses the cream ground like an 1800s engraving
// plate: subtle paper-fiber grain, faint hatch lines, a light plate vignette,
// all in ink/sepia at very low alpha. A whisper-quiet cursor response follows
// the pointer (a faint ink smudge/lens + grain parallax), driven by a single
// rAF reading the shared `pointer` channel — never setState per frame, never
// blocking pointer events. No scanlines, no glow, no neon.

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

export default function Fluoroscopy(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const grainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const lens = lensRef.current;
    const grain = grainRef.current;
    if (!root || !lens || !grain) return;

    // honor reduced-motion: skip the cursor rAF entirely (grain drift CSS is
    // already disabled via media query in the markup below)
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    // eased pointer position 0..1 so the lens glides rather than snaps
    let ex = 0.5;
    let ey = 0.5;

    const frame = () => {
      raf = requestAnimationFrame(frame);
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
      const px = (ex - 0.5) * 10;
      const py = (ey - 0.5) * 10;
      grain.style.transform = `translate3d(${px.toFixed(2)}px, ${py.toFixed(
        2,
      )}px, 0)`;
    };

    if (!reduce) raf = requestAnimationFrame(frame);

    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1]"
    >
      {/* (a) faint engraving hatch — two near-orthogonal sets of hairlines in
          ink at very low alpha, evoking plate cross-hatch without a pattern
          that reads as UI. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(28deg, rgba(26,23,20,0.022) 0px, rgba(26,23,20,0.022) 1px, transparent 1px, transparent 7px)," +
            "repeating-linear-gradient(-62deg, rgba(138,122,92,0.018) 0px, rgba(138,122,92,0.018) 1px, transparent 1px, transparent 9px)",
        }}
      />
      {/* (b) light plate vignette — sepia/ink warming the edges of the cream
          ground so it sits like a printed page, not a flat fill. Kept soft. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(125% 105% at 50% 46%, transparent 58%, rgba(138,122,92,0.10) 84%, rgba(26,23,20,0.16) 100%)",
        }}
      />
      {/* (c) cursor-following ink smudge / lens — gradient written each rAF.
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
      {/* (d) very low-opacity drifting paper-fiber grain. Inner layer keeps the
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
