"use client";

import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { TAGLINE } from "@/data/content";
import { ui, useScene } from "@/lib/sceneStore";
import ContactButtons from "./ContactButtons";

const MONO =
  'var(--font-mono), "Spline Sans Mono", ui-monospace, SFMono-Regular, monospace';
const DISPLAY = "var(--font-display), Archivo, sans-serif";

/** Height the EKG header bar reserves at the top; the monogram centers in it. */
const BAR_H = 54;

/**
 * Intro DOM that frames the particle name (atlas styling — ink on cream, no
 * specimen label).
 *
 *  • At the intro state (index === 0): one TIGHT centered stack tucked under
 *    the giant stacked particle name — single-line tagline, glyph row 12px
 *    below, "scroll to dissect" hint 16px below that — anchored at bottom
 *    ~7vh. The layer is pointer-events:none so it never eats the canvas
 *    drag; only the contact links re-enable pointer events.
 *
 *  • Once scrolled away (index > 0): the block collapses to ONLY the "M M"
 *    monogram at the LEFT of the EKG header bar — no always-visible name text.
 *    Hover/focus expands the initials IN PLACE on the bar: the first M grows
 *    rightward into "Mounish" and the second into "Mavuduru" (clip-width +
 *    slide, ~220ms — transform/clip/opacity only), reading as one Spectral
 *    line. The tagline appears as a single smaller line directly under the
 *    bar, with the three dotted contact glyphs inline after it (compact,
 *    borderless). No floating card, no duplicate name. Collapses cleanly on
 *    mouseleave/blur.
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

  // Mirror expand/collapse into the shared non-reactive ui channel so
  // EkgMonitor can widen its left inset and keep the name zone clean.
  const setMonogram = (v: boolean) => {
    ui.monogramExpanded = v;
    setExpanded(v);
  };

  // Keep the shared flag honest when the monogram block unmounts (back at
  // intro): the local `expanded` state resets on remount, the channel must too.
  // (Plain mutable-channel write — not setState — so this effect never renders.)
  useEffect(() => {
    if (atIntro) ui.monogramExpanded = false;
  }, [atIntro]);

  return (
    <>
      {/* ---- INTRO: lower-center tagline + contact glyphs ---- */}
      {introVisible ? (
        <div
          aria-hidden={!atIntro}
          className="fixed inset-x-0 z-30 flex flex-col items-center"
          style={{
            bottom: "7vh",
            pointerEvents: "none",
            opacity: introOpacity,
            transform: `translateY(${(1 - introOpacity) * 10}px)`,
            transition: "opacity 120ms linear",
            paddingLeft: 16,
            paddingRight: 16,
          }}
        >
          <p
            className="intro-tagline"
            style={{
              fontFamily: DISPLAY,
              fontWeight: 400,
              fontSize: "clamp(0.85rem, 2vw, 1.05rem)",
              letterSpacing: "0.01em",
              lineHeight: 1.35,
              color: "var(--ink-soft)",
              textAlign: "center",
              margin: "0 0 12px",
              whiteSpace: "nowrap",
              maxWidth: "100%",
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
              margin: "16px 0 0",
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
          onMouseEnter={() => setMonogram(true)}
          onMouseLeave={() => setMonogram(false)}
          onFocusCapture={() => setMonogram(true)}
          onBlurCapture={(e) => {
            const next = e.relatedTarget as Node | null;
            if (!next || !e.currentTarget.contains(next)) setMonogram(false);
          }}
        >
          {/* The monogram button: two initials that expand in place into the
              full name. Each name is rendered as [M][rest], with `rest`
              clipped to width 0 when collapsed and revealed when expanded.
              No backing, no card — the letters sit straight on the page,
              layered with the rhythm trace. */}
          <button
            type="button"
            aria-label={`Mounish Mavuduru — ${
              expanded ? "collapse" : "expand"
            } name`}
            aria-expanded={expanded}
            onClick={() => setMonogram(!expanded)}
            className="mono-btn"
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: 0,
              fontFamily: DISPLAY,
              fontWeight: 600,
              fontSize: "1.18rem",
              lineHeight: 1,
              letterSpacing: "0.01em",
              color: "var(--ink)",
              background: "transparent",
              border: "none",
              borderRadius: "var(--radius-ctl, 8px)",
              padding: "6px 6px 6px 4px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color 180ms linear",
            }}
          >
            <NamePart initial="M" rest="ounish" expanded={expanded} />
            <span aria-hidden="true" style={{ margin: "0 0.04em" }}>
              .
            </span>
            <NamePart initial="M" rest="avuduru" expanded={expanded} />
          </button>
        </div>
      ) : null}

      {/* Hover affordance on the monogram/name: ink shifts to oxblood
          (color only — no transform, no box). On the narrowest viewports the
          single-line tagline is allowed to reflow so it never clips. */}
      <style>{`
        .mono-btn:hover { color: var(--oxblood); }
        @media (max-width: 480px) {
          .intro-tagline { white-space: normal; max-width: 34ch; }
        }
      `}</style>
    </>
  );
}

/**
 * One half of the monogram: a fixed initial plus the rest of the word, where
 * the rest is revealed by growing its clip width from 0 → its natural width
 * and sliding it in from the left (~220ms). Pure clip/transform/opacity — the
 * max-width cap is generous enough for either word so the reveal reads as a
 * clip, not a squash.
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
