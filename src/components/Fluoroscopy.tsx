// Decorative fluoroscopy / cardiac-monitor overlay. Pure CSS + one inline SVG
// grain data-URI. No client JS, no blur, no glow — whisper-quiet per anti-vibe.

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

export default function Fluoroscopy() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[1]">
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
      {/* (c) very low-opacity drifting film grain (transform-only drift) */}
      <div
        className="fluoro-grain absolute -inset-[120px] opacity-[0.05]"
        style={{
          backgroundImage: `url("${GRAIN_SVG}")`,
          backgroundRepeat: "repeat",
          animation: "fluoroDrift 14s linear infinite",
          willChange: "transform",
        }}
      />
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
