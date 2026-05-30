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

      {/* === Layer 7: retractors (left + right) === */}
      <Retractor side="left" />
      <Retractor side="right" />

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

function Retractor({ side }: { side: "left" | "right" }) {
  const isLeft = side === "left";
  return (
    <div
      aria-hidden
      className="fixed top-1/2 z-[4] pointer-events-none"
      style={{
        [isLeft ? "left" : "right"]: "8%",
        transform: `translateY(-50%) ${isLeft ? "scaleX(-1)" : ""}`,
        width: "240px",
        height: "440px",
        opacity: 0.92,
        filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.85))",
      }}
    >
      <svg
        viewBox="0 0 240 440"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={`steel-${side}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3a4044" />
            <stop offset="20%" stopColor="#aab2b5" />
            <stop offset="45%" stopColor="#e7ecee" />
            <stop offset="55%" stopColor="#f6f8f9" />
            <stop offset="75%" stopColor="#a4abae" />
            <stop offset="100%" stopColor="#2f3437" />
          </linearGradient>
          <linearGradient
            id={`steelV-${side}`}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#3d4448" />
            <stop offset="50%" stopColor="#cbd1d3" />
            <stop offset="100%" stopColor="#2c3134" />
          </linearGradient>
          <linearGradient id={`bone-${side}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f7eddd" />
            <stop offset="100%" stopColor="#c9b8a0" />
          </linearGradient>
          <pattern
            id={`knurlR-${side}`}
            patternUnits="userSpaceOnUse"
            width="3"
            height="3"
            patternTransform="rotate(45)"
          >
            <rect width="3" height="3" fill="#393f42" />
            <line x1="0" y1="0" x2="0" y2="3" stroke="#1c2022" strokeWidth="0.8" />
            <line x1="1.5" y1="0" x2="1.5" y2="3" stroke="#5a6266" strokeWidth="0.4" />
          </pattern>
        </defs>

        {/* Vertical crossbar (the long sliding shaft of a Finochietto retractor) */}
        <rect
          x="200"
          y="20"
          width="24"
          height="400"
          rx="3"
          fill={`url(#steelV-${side})`}
          stroke="#0e1112"
          strokeWidth="0.5"
        />
        {/* crossbar groove lines */}
        <line
          x1="210"
          y1="20"
          x2="210"
          y2="420"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="0.6"
        />
        <line
          x1="216"
          y1="20"
          x2="216"
          y2="420"
          stroke="rgba(0,0,0,0.55)"
          strokeWidth="0.5"
        />

        {/* Upper arm */}
        <g>
          {/* arm shaft */}
          <rect
            x="40"
            y="115"
            width="170"
            height="20"
            rx="3"
            fill={`url(#steel-${side})`}
            stroke="#161a1c"
            strokeWidth="0.5"
          />
          {/* arm sheen */}
          <line
            x1="42"
            y1="120"
            x2="208"
            y2="120"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="0.6"
          />

          {/* clamp collar around crossbar */}
          <rect
            x="195"
            y="105"
            width="34"
            height="40"
            rx="6"
            fill={`url(#steel-${side})`}
            stroke="#0e1112"
            strokeWidth="0.6"
          />
          {/* clamp screw */}
          <circle
            cx="228"
            cy="125"
            r="6"
            fill={`url(#steel-${side})`}
            stroke="#0e1112"
            strokeWidth="0.4"
          />
          <line
            x1="223"
            y1="125"
            x2="233"
            y2="125"
            stroke="#0e1112"
            strokeWidth="1.2"
            strokeLinecap="round"
          />

          {/* hook/blade at end (the part inside the wound) */}
          <path
            d="
              M 40 115
              L 28 115
              Q 12 115, 8 132
              L 8 156
              Q 14 165, 30 155
              L 40 145
              Z
            "
            fill={`url(#bone-${side})`}
            stroke="#5d4e36"
            strokeWidth="0.5"
          />
          {/* blade specular */}
          <path
            d="M 12 122 Q 22 118, 36 122"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="0.5"
            fill="none"
          />
        </g>

        {/* Lower arm */}
        <g transform="translate(0, 150)">
          <rect
            x="40"
            y="115"
            width="170"
            height="20"
            rx="3"
            fill={`url(#steel-${side})`}
            stroke="#161a1c"
            strokeWidth="0.5"
          />
          <line
            x1="42"
            y1="120"
            x2="208"
            y2="120"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="0.6"
          />
          <rect
            x="195"
            y="105"
            width="34"
            height="40"
            rx="6"
            fill={`url(#steel-${side})`}
            stroke="#0e1112"
            strokeWidth="0.6"
          />
          <circle
            cx="228"
            cy="125"
            r="6"
            fill={`url(#steel-${side})`}
            stroke="#0e1112"
            strokeWidth="0.4"
          />
          <line
            x1="223"
            y1="125"
            x2="233"
            y2="125"
            stroke="#0e1112"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            d="
              M 40 115
              L 28 115
              Q 12 115, 8 132
              L 8 156
              Q 14 165, 30 155
              L 40 145
              Z
            "
            fill={`url(#bone-${side})`}
            stroke="#5d4e36"
            strokeWidth="0.5"
          />
          <path
            d="M 12 122 Q 22 118, 36 122"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="0.5"
            fill="none"
          />
        </g>

        {/* Crank/handle at bottom of crossbar (the ratchet knob) */}
        <g transform="translate(212, 410)">
          <rect
            x="-14"
            y="-4"
            width="28"
            height="8"
            rx="2"
            fill={`url(#steel-${side})`}
            stroke="#0e1112"
            strokeWidth="0.4"
          />
          <rect
            x="-2"
            y="-12"
            width="4"
            height="24"
            fill={`url(#steel-${side})`}
            stroke="#0e1112"
            strokeWidth="0.4"
          />
          <rect
            x="-10"
            y="4"
            width="20"
            height="6"
            rx="1"
            fill={`url(#knurlR-${side})`}
          />
        </g>

        {/* slight blood smear near hooks */}
        <ellipse
          cx="20"
          cy="142"
          rx="14"
          ry="6"
          fill="#7a1414"
          opacity="0.45"
        />
        <ellipse
          cx="22"
          cy="292"
          rx="12"
          ry="5"
          fill="#7a1414"
          opacity="0.4"
        />
      </svg>
    </div>
  );
}
