"use client";

// Decorative fluoroscopy / cardiac-monitor overlay: scanlines + vignette + a
// drifting film grain, PLUS a whisper-quiet cursor response. The cursor work is
// driven by a single rAF reading the shared `pointer` channel and writing CSS
// custom properties / transforms onto layers — never setState per frame, never
// blocking pointer events. No blur, no glow orbs.

import type { JSX } from "react";
import { useEffect, useRef } from "react";
import { pointer } from "@/lib/sceneStore";

// Low-opacity film grain: feTurbulence rendered once to a data-URI, then drifted
// with a slow transform-only animation. Encoded inline so there is no extra fetch.
const GRAIN_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">' +
      '<filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.9" ' +
      'numOctaves="2" stitchTiles="stitch"/></filter>' +
      '<rect width="240" height="240" filter="url(#g)"/></svg>',
  );

export default function Fluoroscopy(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const liftRef = useRef<HTMLDivElement>(null);
  const grainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const lift = liftRef.current;
    const grain = grainRef.current;
    if (!root || !lift || !grain) return;

    // honor reduced-motion: skip the cursor rAF entirely (grain drift CSS is
    // already disabled via media query in the markup below)
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    // eased pointer position 0..1 so the lift glides rather than snaps
    let ex = 0.5;
    let ey = 0.5;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      // ease toward the live normalized pointer (read-only; no renders)
      ex += (pointer.nx - ex) * 0.08;
      ey += (pointer.ny - ey) * 0.08;

      // (1) gentle radial lift following the cursor — alpha capped at 0.06
      lift.style.background = `radial-gradient(40% 32% at ${(ex * 100).toFixed(
        2,
      )}% ${(ey * 100).toFixed(
        2,
      )}%, rgba(232,227,216,0.06), transparent 70%)`;

      // (2) grain parallax — shift a few px toward the cursor (transform only).
      // ±6px is the whole travel, centered, so it stays whisper-quiet.
      const px = (ex - 0.5) * 12;
      const py = (ey - 0.5) * 12;
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
      {/* (a) faint scanlines */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(232,227,216,0.035) 0px, rgba(232,227,216,0.035) 1px, transparent 1px, transparent 3px)",
        }}
      />
      {/* (b) soft radial vignette darkening the edges */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 100% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      {/* (d) cursor-following radial lift — its gradient is written each rAF.
          Starts centered so the first paint matches the resting pointer. */}
      <div
        ref={liftRef}
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(40% 32% at 50% 50%, rgba(232,227,216,0.06), transparent 70%)",
          willChange: "background",
        }}
      />
      {/* (c) very low-opacity drifting film grain. Inner layer keeps the slow
          autonomous drift animation; the wrapper takes the cursor parallax
          transform so the two transforms don't fight. */}
      <div
        ref={grainRef}
        className="absolute inset-0"
        style={{ willChange: "transform" }}
      >
        <div
          className="fluoro-grain absolute -inset-[120px] opacity-[0.05]"
          style={{
            backgroundImage: `url("${GRAIN_SVG}")`,
            backgroundRepeat: "repeat",
            animation: "fluoroDrift 14s linear infinite",
            willChange: "transform",
          }}
        />
      </div>
      <style>{`
        @keyframes fluoroDrift {
          0%   { transform: translate3d(0, 0, 0); }
          25%  { transform: translate3d(-30px, 20px, 0); }
          50%  { transform: translate3d(20px, -24px, 0); }
          75%  { transform: translate3d(-18px, -14px, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fluoro-grain { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
