"use client";

/**
 * SurgicalDrape — cooler teal drape with deeper folds + animated grain + dark center.
 */
export default function SurgicalDrape() {
  return (
    <>
      {/* Layer 1: cooler teal base */}
      <div
        aria-hidden
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 110% 90% at 50% 55%, #1f535a 0%, #173c42 45%, #0c2226 75%, #050f12 100%),
            linear-gradient(180deg, #163b41 0%, #1d4750 50%, #0e2c30 100%)
          `,
          backgroundBlendMode: "multiply",
        }}
      />

      {/* Layer 2: deep folds + sheen (heavier contrast than before) */}
      <div
        aria-hidden
        className="fixed inset-0 z-0 pointer-events-none mix-blend-overlay"
        style={{
          background: `
            radial-gradient(ellipse 24% 90% at 6% 60%, rgba(255,255,255,0.075), transparent 70%),
            radial-gradient(ellipse 26% 85% at 94% 50%, rgba(255,255,255,0.08), transparent 70%),
            radial-gradient(ellipse 80% 30% at 50% 100%, rgba(0,0,0,0.7), transparent 70%),
            radial-gradient(ellipse 70% 22% at 50% 0%, rgba(0,0,0,0.6), transparent 70%),
            repeating-linear-gradient(
              112deg,
              rgba(0,0,0,0) 0px,
              rgba(0,0,0,0) 70px,
              rgba(0,0,0,0.14) 70px,
              rgba(0,0,0,0.14) 72px,
              rgba(255,255,255,0.055) 72px,
              rgba(255,255,255,0.055) 75px,
              rgba(0,0,0,0) 75px,
              rgba(0,0,0,0) 220px
            ),
            repeating-linear-gradient(
              -68deg,
              rgba(0,0,0,0) 0px,
              rgba(0,0,0,0) 120px,
              rgba(0,0,0,0.09) 120px,
              rgba(0,0,0,0.09) 122px
            ),
            repeating-linear-gradient(
              40deg,
              rgba(0,0,0,0) 0px,
              rgba(0,0,0,0) 300px,
              rgba(0,0,0,0.18) 300px,
              rgba(0,0,0,0.18) 303px
            )
          `,
        }}
      />

      {/* Layer 3: static fabric weave noise */}
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
            values="0 0 0 0 0.55
                    0 0 0 0 0.6
                    0 0 0 0 0.62
                    0 0 0 0.65 0"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#drapeNoise)" />
      </svg>

      {/* Layer 4: animated drifting grain — adds subtle life to the drape */}
      <div
        aria-hidden
        className="fixed inset-[-40px] z-0 pointer-events-none opacity-[0.13] mix-blend-overlay grain-drift"
        style={{
          backgroundImage:
            'url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%221.6%22 numOctaves=%221%22 stitchTiles=%22stitch%22/><feColorMatrix values=%220 0 0 0 0.5  0 0 0 0 0.55  0 0 0 0 0.6  0 0 0 0.9 0%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/></svg>")',
          backgroundSize: "200px 200px",
        }}
      />

      {/* Layer 5: dark center vignette — pure black where heart sits */}
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
