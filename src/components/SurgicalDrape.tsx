"use client";

/**
 * SurgicalDrape — full-viewport dimmed teal surgical drape that frames the heart.
 *
 * Layers (back → front):
 *   1. base teal radial gradient (drape color, lighting falloff toward edges)
 *   2. fold gradients (suggested wrinkles, soft directional sheen)
 *   3. fabric noise (SVG turbulence) for cloth texture
 *   4. iodine + blood smears near opening
 *   5. cut-skin / fascia ring inside the opening (orange-red rim)
 *   6. center darkening vignette (fades cleanly to pure black where the heart sits,
 *      so cursor repulsion that pushes dots outward still reads against black)
 *   7. retractor SVGs (one each side, holding the opening apart)
 *
 * Heart canvas mounts above this on a higher z-index.
 */
export default function SurgicalDrape() {
  return (
    <>
      {/* === Layer 1: base drape teal === */}
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

      {/* === Layer 2: folds + directional sheen === */}
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

      {/* === Layer 3: fabric weave noise === */}
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

      {/* === Layer 4: iodine + blood smears around opening === */}
      <div
        aria-hidden
        className="fixed inset-0 z-0 pointer-events-none mix-blend-multiply"
        style={{
          background: `
            radial-gradient(ellipse 38% 12% at 50% 26%, rgba(220, 120, 40, 0.55), transparent 70%),
            radial-gradient(ellipse 14% 7% at 28% 70%, rgba(120, 18, 18, 0.65), transparent 70%),
            radial-gradient(ellipse 9% 5% at 72% 73%, rgba(160, 30, 28, 0.45), transparent 70%),
            radial-gradient(ellipse 8% 4% at 58% 22%, rgba(180, 70, 30, 0.45), transparent 70%)
          `,
          opacity: 0.85,
        }}
      />

      {/* === Layer 5: cut-skin / fascia rim around opening === */}
      <div
        aria-hidden
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{
          background: `
            radial-gradient(
              ellipse 32% 42% at 50% 50%,
              transparent 52%,
              rgba(180, 60, 30, 0.55) 60%,
              rgba(120, 30, 18, 0.85) 66%,
              rgba(60, 12, 8, 0.7) 72%,
              transparent 80%
            )
          `,
          mixBlendMode: "screen",
        }}
      />

      {/* === Layer 6: center darkening — pure black at heart location === */}
      <div
        aria-hidden
        className="fixed inset-0 z-[2] pointer-events-none"
        style={{
          background: `
            radial-gradient(
              ellipse 32% 42% at 50% 50%,
              #000 0%,
              #000 38%,
              rgba(0,0,0,0.92) 50%,
              rgba(0,0,0,0.55) 62%,
              transparent 78%
            )
          `,
        }}
      />

      {/* === Layer 8: clip / suture marks where drape meets skin === */}
      <div
        aria-hidden
        className="fixed inset-0 z-[3] pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 1.2% 0.7% at 36% 32%, rgba(220,220,220,0.6), transparent 70%),
            radial-gradient(ellipse 1.2% 0.7% at 64% 32%, rgba(220,220,220,0.6), transparent 70%),
            radial-gradient(ellipse 1.2% 0.7% at 30% 68%, rgba(220,220,220,0.5), transparent 70%),
            radial-gradient(ellipse 1.2% 0.7% at 70% 68%, rgba(220,220,220,0.5), transparent 70%)
          `,
        }}
      />
    </>
  );
}
