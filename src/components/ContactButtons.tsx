"use client";

import type { JSX } from "react";
import { useEffect, useRef } from "react";
import { GITHUB, LINKEDIN, EMAIL } from "@/data/content";

/**
 * Three contact links rendered as engraving-style DOTTED GLYPHS — no text
 * labels, no EKG squiggle. Each glyph (GH / IN / @) is stipple-drawn on a tiny
 * canvas from a coarse dot grid so it matches the particle motif of the atlas:
 * dark ink dots on cream paper. Each mark is a real <a> (GitHub / LinkedIn /
 * mailto) with a sharp body, a hairline border, and a hover/focus that shifts
 * both the border and the stipple ink to --oxblood (color only — no lift,
 * scale, glow, or shadow).
 */

type Mark = "github" | "linkedin" | "mail";

interface Item {
  href: string;
  external: boolean;
  aria: string;
  mark: Mark;
}

const ITEMS: Item[] = [
  { href: GITHUB, external: true, aria: "GitHub profile", mark: "github" },
  { href: LINKEDIN, external: true, aria: "LinkedIn profile", mark: "linkedin" },
  { href: `mailto:${EMAIL}`, external: false, aria: "Email Mounish", mark: "mail" },
];

// ---------------------------------------------------------------------------
// Glyph masks — each is a coarse pixel grid. Non-blank cells become stipple
// dots. Hand-laid so "GH" / "IN" / "@" read clearly at small size.
// Grid is 11 wide; rows vary. 1 = inked cell.
// ---------------------------------------------------------------------------

type Mask = number[][];

// "GH" — G then H, two compact letterforms side by side.
const MASK_GH: Mask = [
  [0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 0],
  [1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0],
  [1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0],
  [1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0],
  [1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0],
  [0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 0],
];

// "IN" — I then N.
const MASK_IN: Mask = [
  [1, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0],
  [0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0],
  [0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 0],
  [0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0],
  [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0],
  [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
  [1, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0],
];

// "@" — at-sign for email.
const MASK_AT: Mask = [
  [0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  [0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  [1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0],
  [1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0],
  [1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0],
  [1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0],
];

const MASKS: Record<Mark, Mask> = {
  github: MASK_GH,
  linkedin: MASK_IN,
  mail: MASK_AT,
};

const GLYPH_PX = 38; // css px square the stipple is drawn into

/**
 * Draws the mask as soft round ink dots. `ink` is a CSS color string. A subtle
 * per-cell radius/alpha jitter (seeded by cell index, deterministic) gives the
 * marks a hand-stippled, engraved feel rather than a printed bitmap.
 */
function drawStipple(canvas: HTMLCanvasElement, mask: Mask, ink: string): void {
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const size = GLYPH_PX;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = ink;

  const cols = mask[0].length;
  const rows = mask.length;
  // Fit the grid with a little inset margin; keep the glyph centered.
  const margin = size * 0.16;
  const usableW = size - margin * 2;
  const usableH = size - margin * 2;
  const cell = Math.min(usableW / cols, usableH / rows);
  const gridW = cell * cols;
  const gridH = cell * rows;
  const ox = (size - gridW) / 2;
  const oy = (size - gridH) / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!mask[r][c]) continue;
      // deterministic jitter so dots look hand-laid but stable across redraws
      const seed = (r * 31 + c * 17) % 97;
      const jr = ((seed % 7) / 7 - 0.5) * cell * 0.18;
      const jc = (((seed * 3) % 7) / 7 - 0.5) * cell * 0.18;
      const cx = ox + (c + 0.5) * cell + jc;
      const cy = oy + (r + 0.5) * cell + jr;
      const radius = cell * (0.3 + ((seed % 5) / 5) * 0.08);
      ctx.globalAlpha = 0.82 + ((seed % 4) / 4) * 0.18;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function StippleGlyph({ mark }: { mark: Mark }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const root = canvas.closest("a"); // the link that owns the color tokens
    const readInk = (): string => {
      if (!root) return "#1a1714";
      const hovered =
        root.matches(":hover") || root.matches(":focus-visible");
      const styles = getComputedStyle(root);
      const ox = styles.getPropertyValue("--ox").trim() || "#7c1f1c";
      const ink = styles.getPropertyValue("--inkc").trim() || "#1a1714";
      return hovered ? ox : ink;
    };

    let raf = 0;
    let lastInk = "";
    const tick = () => {
      const ink = readInk();
      if (ink !== lastInk) {
        lastInk = ink;
        drawStipple(canvas, MASKS[mark], ink);
      }
      raf = requestAnimationFrame(tick);
    };
    // initial draw, then a cheap rAF that only repaints on a color change
    drawStipple(canvas, MASKS[mark], readInk());
    lastInk = readInk();
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mark]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        display: "block",
        width: GLYPH_PX,
        height: GLYPH_PX,
        imageRendering: "auto",
      }}
    />
  );
}

export default function ContactButtons(): JSX.Element {
  return (
    <nav
      aria-label="Contact"
      className="contact-buttons flex items-stretch gap-2"
      style={{ pointerEvents: "auto" }}
    >
      {ITEMS.map((it) => (
        <a
          key={it.mark}
          href={it.href}
          aria-label={it.aria}
          {...(it.external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
          className="contact-btn inline-flex items-center justify-center"
          style={
            {
              // local color tokens the canvas reads via getComputedStyle
              ["--inkc" as string]: "#1a1714",
              ["--ox" as string]: "#7c1f1c",
              border: "1px solid var(--line)",
              borderRadius: "2px",
              background: "color-mix(in srgb, var(--paper-2) 70%, transparent)",
              padding: "6px",
              textDecoration: "none",
              transition: "border-color 180ms linear, background-color 180ms linear",
            } as React.CSSProperties
          }
        >
          <StippleGlyph mark={it.mark} />
        </a>
      ))}

      {/* hover/focus: border shifts to oxblood (the glyph ink shift is handled
          in the canvas by reading :hover state — color only, no transform). */}
      <style>{`
        .contact-btn:hover,
        .contact-btn:focus-visible {
          border-color: color-mix(in srgb, var(--oxblood) 60%, transparent);
          background: color-mix(in srgb, var(--paper-2) 90%, transparent);
        }
        @media (max-width: 520px) {
          .contact-buttons { flex-wrap: wrap; justify-content: center; }
        }
      `}</style>
    </nav>
  );
}
