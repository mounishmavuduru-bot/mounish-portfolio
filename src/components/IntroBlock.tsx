"use client";

import type { JSX } from "react";
import { useRef, useState } from "react";
import { TAGLINE } from "@/data/content";
import { useScene } from "@/lib/sceneStore";
import ContactButtons from "./ContactButtons";

const MONO =
  'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';
const DISPLAY = "var(--font-display), Spectral, Georgia, serif";

/** Height the EKG header bar reserves at the top; the monogram centers in it. */
const BAR_H = 54;

/**
 * Intro DOM that frames the particle name (atlas styling — ink on cream, no
 * specimen label).
 *
 *  • At the intro state (index === 0): a centered serif tagline + the contact
 *    glyphs sit in the lower-center, directly under the particle "Mounish
 *    Mavuduru". The layer is pointer-events:none so it never eats the canvas
 *    drag; only the contact links re-enable pointer events.
 *
 *  • Once scrolled away (index > 0): the block collapses to the "M M" monogram
 *    that lives at the LEFT of the EKG header bar. Hover/focus expands the first
 *    M rightward into "Mounish" and the second into "Mavuduru" (the remaining
 *    letters are revealed via a clip-width grow + slide — transform/clip only),
 *    and a tidy clamped card drops below with the tagline + contact glyphs.
 *
 * Cross-fade between the two layouts is opacity + a tiny translate only.
 */
export default function IntroBlock(): JSX.Element {
  const index = useScene((s) => s.index);
  const progress = useScene((s) => s.progress);
  const atIntro = index === 0;

  // Lower-center tagline+contacts fade out the instant the morph leaves intro,
  // so they never sit on top of the dispersing letters.
  const introOpacity = Math.max(0, 1 - progress * 1.6);
  const introVisible = introOpacity > 0.01;

  // Monogram only mounts while !atIntro, so returning to intro unmounts it and
  // the `expanded` state resets on the next mount — no effect needed.
  const [expanded, setExpanded] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      {/* ---- INTRO: lower-center tagline + contact glyphs ---- */}
      {introVisible ? (
        <div
          aria-hidden={!atIntro}
          className="fixed inset-x-0 z-30 flex flex-col items-center"
          style={{
            bottom: "clamp(40px, 11vh, 120px)",
            pointerEvents: "none",
            opacity: introOpacity,
            transform: `translateY(${(1 - introOpacity) * 10}px)`,
            transition: "opacity 120ms linear",
            paddingLeft: 16,
            paddingRight: 16,
          }}
        >
          <p
            style={{
              fontFamily: DISPLAY,
              fontWeight: 400,
              fontSize: "clamp(0.92rem, 2.2vw, 1.12rem)",
              letterSpacing: "0.01em",
              lineHeight: 1.5,
              color: "var(--ink-soft)",
              textAlign: "center",
              margin: "0 0 18px",
              maxWidth: "46ch",
            }}
          >
            {TAGLINE}
          </p>
          <ContactButtons />
          <p
            className="font-mono"
            style={{
              fontFamily: MONO,
              fontSize: "0.58rem",
              letterSpacing: "0.26em",
              textTransform: "uppercase",
              color: "var(--sepia)",
              margin: "22px 0 0",
              pointerEvents: "none",
            }}
          >
            scroll to dissect
          </p>
        </div>
      ) : null}

      {/* ---- COLLAPSED: MM monogram on the LEFT of the EKG header bar ---- */}
      {!atIntro ? (
        <div
          ref={wrapRef}
          className="intro-mono fixed z-40"
          style={{
            top: 0,
            left: 0,
            height: BAR_H,
            display: "flex",
            alignItems: "center",
            paddingLeft: 14,
          }}
          onMouseEnter={() => setExpanded(true)}
          onMouseLeave={() => setExpanded(false)}
          onFocusCapture={() => setExpanded(true)}
          onBlurCapture={(e) => {
            const next = e.relatedTarget as Node | null;
            if (!next || !e.currentTarget.contains(next)) setExpanded(false);
          }}
        >
          {/* The monogram button: two initials that expand into the full names.
              Each name is rendered as [M][rest], with `rest` clipped to width 0
              when collapsed and to its natural width when expanded. */}
          <button
            type="button"
            aria-label={`Mounish Mavuduru — ${
              expanded ? "hide" : "show"
            } details`}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="mono-btn"
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: "0.42ch",
              fontFamily: DISPLAY,
              fontWeight: 600,
              fontSize: "1.18rem",
              lineHeight: 1,
              letterSpacing: "0.01em",
              color: expanded ? "var(--oxblood)" : "var(--ink)",
              background: "transparent",
              border: "none",
              padding: "6px 4px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color 180ms linear",
            }}
          >
            <NamePart initial="M" rest="ounish" expanded={expanded} />
            <NamePart initial="M" rest="avuduru" expanded={expanded} />
          </button>

          {/* Drop card: tagline + contact glyphs in a clean clamped stack.
              Anchored to the bar's bottom-left, opacity+transform only. */}
          <div
            role="group"
            aria-label="Identity"
            style={{
              position: "absolute",
              top: BAR_H,
              left: 12,
              width: "min(340px, calc(100vw - 28px))",
              background: "var(--paper-2)",
              border: "1px solid var(--line)",
              borderRadius: "2px",
              padding: "14px 16px 16px",
              transformOrigin: "top left",
              opacity: expanded ? 1 : 0,
              transform: expanded
                ? "translateY(0) scale(1)"
                : "translateY(-6px) scale(0.98)",
              pointerEvents: expanded ? "auto" : "none",
              transition: "opacity 180ms linear, transform 200ms ease-out",
              boxShadow: "0 1px 0 var(--line)",
            }}
          >
            <h2
              style={{
                fontFamily: DISPLAY,
                fontWeight: 600,
                fontSize: "1.5rem",
                lineHeight: 1.06,
                color: "var(--ink)",
                margin: "0 0 8px",
              }}
            >
              Mounish Mavuduru
            </h2>
            <p
              style={{
                fontFamily: DISPLAY,
                fontWeight: 400,
                fontSize: "0.95rem",
                lineHeight: 1.5,
                color: "var(--ink-soft)",
                margin: "0 0 14px",
                maxWidth: "34ch",
              }}
            >
              {TAGLINE}
            </p>
            <ContactButtons />
          </div>
        </div>
      ) : null}

      {/* Hover affordance: a faint oxblood underline under the initials when the
          monogram is interactive but collapsed (color/clip only). */}
      <style>{`
        .mono-btn:hover { color: var(--oxblood); }
      `}</style>
    </>
  );
}

/**
 * One half of the monogram: a fixed initial plus the rest of the word, where
 * the rest is revealed by growing its clip width from 0 → auto and sliding it
 * in from the left. Pure clip/transform/opacity — no layout width animation of
 * the surrounding flow beyond the inline-grid track, which the browser sizes
 * via the `1fr` measured track (max-width transitions the visible region).
 */
function NamePart({
  initial,
  rest,
  expanded,
}: {
  initial: string;
  rest: string;
  expanded: boolean;
}): JSX.Element {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline" }}>
      <span aria-hidden="false">{initial}</span>
      <span
        aria-hidden={!expanded}
        style={{
          display: "inline-block",
          overflow: "hidden",
          whiteSpace: "nowrap",
          // clip the remaining letters: 0 → generous cap. Using max-width keeps
          // it transform/clip-only in spirit (no padding/height animation) and
          // the cap is wide enough for either word.
          maxWidth: expanded ? "8ch" : "0ch",
          opacity: expanded ? 1 : 0,
          transform: expanded ? "translateX(0)" : "translateX(-4px)",
          transition:
            "max-width 220ms ease-out, opacity 200ms linear, transform 220ms ease-out",
        }}
      >
        {rest}
      </span>
    </span>
  );
}
