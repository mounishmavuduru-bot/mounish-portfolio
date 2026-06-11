"use client";

import type { JSX } from "react";
import { useRef, useState } from "react";
import { TAGLINE } from "@/data/content";
import { useScene } from "@/lib/sceneStore";
import ContactButtons from "./ContactButtons";

const MONO =
  'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';
const DISPLAY = "var(--font-display), sans-serif";
const HAIRLINE = "color-mix(in srgb, var(--bone) 14%, transparent)";

/**
 * Intro DOM that frames the particle name.
 *
 *  • At the intro state (index === 0): a centered mono tagline + the contact
 *    buttons sit in the lower-center, directly under the particle "Mounish
 *    Mavuduru". The whole layer is pointer-events:none so it never eats the
 *    canvas drag — only the buttons re-enable pointer events.
 *
 *  • Once scrolled away (index > 0): the block collapses to a fixed top-left
 *    "MM" monogram button. Hovering or focusing it expands a small panel with
 *    the full name (Bricolage), the tagline, and the contact buttons.
 *
 * Cross-fade between the two layouts uses opacity + a tiny transform only.
 */
export default function IntroBlock(): JSX.Element {
  const index = useScene((s) => s.index);
  const progress = useScene((s) => s.progress);
  const atIntro = index === 0;

  // The lower-center tagline+buttons fade out as soon as the morph begins
  // leaving the intro state (progress climbing past 0), so it doesn't sit on
  // top of the dispersing letters.
  const introOpacity = Math.max(0, 1 - progress * 1.6);
  const introVisible = introOpacity > 0.01;

  // Monogram is the inverse: present once we've committed to leaving intro.
  // It only renders while !atIntro, so returning to intro unmounts it and the
  // `expanded` state resets on the next mount — no effect needed.
  const [expanded, setExpanded] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      {/* ---- INTRO: lower-center tagline + contact buttons ---- */}
      {introVisible ? (
        <div
          aria-hidden={!atIntro}
          className="fixed inset-x-0 z-30 flex flex-col items-center"
          style={{
            bottom: "clamp(48px, 12vh, 132px)",
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
              fontFamily: MONO,
              fontSize: "clamp(0.72rem, 1.7vw, 0.86rem)",
              letterSpacing: "0.02em",
              lineHeight: 1.5,
              color: "color-mix(in srgb, var(--bone) 70%, transparent)",
              textAlign: "center",
              margin: "0 0 18px",
              maxWidth: "44ch",
            }}
          >
            {TAGLINE}
          </p>
          <ContactButtons />
          <p
            style={{
              fontFamily: MONO,
              fontSize: "0.56rem",
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "color-mix(in srgb, var(--bone) 34%, transparent)",
              margin: "20px 0 0",
              pointerEvents: "none",
            }}
          >
            scroll to dissect
          </p>
        </div>
      ) : null}

      {/* ---- COLLAPSED: top-left MM monogram, expands on hover/focus ---- */}
      {!atIntro ? (
        <div
          ref={wrapRef}
          className="fixed z-30"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 58px)",
            left: 16,
          }}
          onMouseEnter={() => setExpanded(true)}
          onMouseLeave={() => setExpanded(false)}
          onFocusCapture={() => setExpanded(true)}
          onBlurCapture={(e) => {
            const next = e.relatedTarget as Node | null;
            if (!next || !e.currentTarget.contains(next)) setExpanded(false);
          }}
        >
          <button
            type="button"
            aria-label="Mounish Mavuduru — show details"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            style={{
              display: "block",
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontSize: "1.12rem",
              lineHeight: 1,
              letterSpacing: "0.01em",
              color: expanded
                ? "var(--green)"
                : "color-mix(in srgb, var(--bone) 88%, transparent)",
              background: "color-mix(in srgb, var(--black) 60%, transparent)",
              border: `1px solid ${
                expanded
                  ? "color-mix(in srgb, var(--green) 45%, transparent)"
                  : HAIRLINE
              }`,
              borderRadius: "2px",
              padding: "8px 10px",
              cursor: "pointer",
              transition:
                "color 150ms linear, border-color 150ms linear, background-color 150ms linear",
            }}
          >
            MM
          </button>

          {/* expand card — opacity + transform only, transform-origin top-left */}
          <div
            role="group"
            aria-label="Identity"
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              width: "min(320px, calc(100vw - 32px))",
              background: "#0a0c0c",
              border: `1px solid ${HAIRLINE}`,
              borderRadius: 0,
              padding: "14px 14px 16px",
              transformOrigin: "top left",
              opacity: expanded ? 1 : 0,
              transform: expanded
                ? "scale(1) translateY(0)"
                : "scale(0.96) translateY(-4px)",
              pointerEvents: expanded ? "auto" : "none",
              transition: "opacity 160ms linear, transform 180ms ease-out",
            }}
          >
            <span
              style={{
                display: "block",
                fontFamily: MONO,
                fontSize: "0.56rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "color-mix(in srgb, var(--green) 70%, transparent)",
                marginBottom: 8,
              }}
            >
              specimen — subject
            </span>
            <h2
              style={{
                fontFamily: DISPLAY,
                fontWeight: 800,
                fontSize: "1.5rem",
                lineHeight: 1.04,
                color: "var(--bone)",
                margin: "0 0 8px",
              }}
            >
              Mounish Mavuduru
            </h2>
            <p
              style={{
                fontFamily: MONO,
                fontSize: "0.68rem",
                lineHeight: 1.5,
                color: "color-mix(in srgb, var(--bone) 66%, transparent)",
                margin: "0 0 14px",
              }}
            >
              {TAGLINE}
            </p>
            <ContactButtons />
          </div>
        </div>
      ) : null}
    </>
  );
}
