"use client";

/**
 * SurgicalDrape — full-viewport dimmed teal drape that frames the heart.
 *
 * Layers (back → front):
 *   1. base teal radial gradient
 *   2. fold gradients + directional sheen
 *   3. fabric noise (SVG turbulence)
 *   4. center darkening vignette (pure black where the heart sits)
 */
export default function SurgicalDrape() {
  return (
    <>
      {/* Layer 1: base drape teal */}
      <div
        aria-hidden
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 110% 90% at 50% 55%, #2b5853 0%, #1e423d 45%, #122723 75%, #07120f 100%),
            linear-gradient(180deg, #1a3b35 0%, #234e47 50%, #14302b 100%)
          `,
          backgroundBlendMode: "multiply",
        }}
      />

      {/* Layer 2: folds + sheen */}
      <div
        aria-hidden
        className="fixed inset-0 z-0 pointer-events-none mix-blend-overlay"
        style={{
          background: `
            radial-gradient(ellipse 18% 80% at 8% 60%, rgba(255,255,255,0.04), transparent 70%),
            radial-gradient(ellipse 22% 70% at 92% 50%, rgba(255,255,255,0.045), transparent 70%),
            radial-gradient(ellipse 70% 25% at 50% 100%, rgba(0,0,0,0.5), transparent 70%),
            radial-gradient(ellipse 60% 18% at 50% 0%, rgba(0,0,0,0.45), transparent 70%),
            repeating-linear-gradient(
              112deg,
              rgba(0,0,0,0.0) 0px,
              rgba(0,0,0,0.0) 80px,
              rgba(0,0,0,0.07) 80px,
              rgba(0,0,0,0.07) 81px,
              rgba(255,255,255,0.025) 81px,
              rgba(255,255,255,0.025) 83px,
              rgba(0,0,0,0.0) 83px,
              rgba(0,0,0,0.0) 240px
            ),
            repeating-linear-gradient(
              -68deg,
              rgba(0,0,0,0.0) 0px,
              rgba(0,0,0,0.0) 140px,
              rgba(0,0,0,0.05) 140px,
              rgba(0,0,0,0.05) 142px
            )
          `,
        }}
      />

      {/* Layer 3: fabric weave noise */}
      <svg
        aria-hidden
        className="fixed inset-0 z-0 pointer-events-none w-full h-full opacity-[0.18] mix-blend-overlay"
      >
        <filter id="drapeNoise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.95"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.6
                    0 0 0 0 0.6
                    0 0 0 0 0.6
                    0 0 0 0.6 0"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#drapeNoise)" />
      </svg>

      {/* Layer 4: center darkening — pure black where heart sits */}
      <div
        aria-hidden
        className="fixed inset-0 z-[2] pointer-events-none"
        style={{
          background: `
            radial-gradient(
              ellipse 44% 56% at 50% 50%,
              #000 0%,
              #000 52%,
              rgba(0,0,0,0.92) 64%,
              rgba(0,0,0,0.55) 76%,
              transparent 90%
            )
          `,
        }}
      />
    </>
  );
}
