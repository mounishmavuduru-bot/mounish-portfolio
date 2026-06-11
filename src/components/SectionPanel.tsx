"use client";

import type { JSX } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import {
  projects,
  awards,
  positions,
  siteLabels,
  type Site,
} from "@/data/content";
import { useScene, sceneActions } from "@/lib/sceneStore";

const BG = "var(--paper-2)";
const HAIRLINE = "var(--line)";
const MONO =
  'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';
const DISPLAY = "var(--font-display), Spectral, Georgia, serif";
/** Faint paper wash over the dimmed organ — never opaque, never blurred. */
const WASH = "rgba(239, 231, 214, 0.42)";

type Row = { primary: string; meta: string };

function rowsFor(section: Site): Row[] {
  if (section === "projects") {
    return projects.map((p) => ({ primary: p.name, meta: p.tag }));
  }
  if (section === "achievements") {
    return awards.map((a) => ({ primary: a.name, meta: a.org }));
  }
  return positions.map((p) => ({ primary: p.role, meta: p.org }));
}

/** Section → EKG lead + organ, shown as the tiny mono line above the title. */
const leadFor: Record<Site, string> = {
  projects: "lead I — heart",
  achievements: "lead II — brain",
  positions: "lead III — liver",
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Full-viewport showcase overlay (johwska-style work view): a scrollable
 * gallery of typographic tiles floating over the dimmed 3D organ. No solid
 * background — only a faint paper wash, so the dimmed specimen and grid stay
 * visible behind. Self-contained: reads the panel slice from the scene store
 * and renders nothing while closed. Escape, the close control, and clicking
 * the backdrop outside the header/tile column all call
 * sceneActions.closePanel().
 *
 * Atlas styling: paper-2 tiles with 1px ink hairlines and sharp corners, big
 * mono index numerals, Spectral names, mono meta, oxblood only on hover.
 * Open = title first, then tiles rise+fade with a 50ms stagger; close = quick
 * fade. Transform/opacity only; prefers-reduced-motion gets no movement. The
 * stored click anchor is used solely as the transform-origin hint for a
 * subtle scale-from-click on open — the overlay is full-viewport regardless.
 */
export default function SectionPanel(): JSX.Element | null {
  const panel = useScene((s) => s.panel);

  if (!panel.open || !panel.section) return null;
  // Remount per open so the entrance animation replays from a clean state.
  return (
    <ShowcaseOverlay
      key={`${panel.section}-${panel.anchor?.x ?? 0}-${panel.anchor?.y ?? 0}`}
      section={panel.section}
      anchor={panel.anchor}
    />
  );
}

function ShowcaseOverlay({
  section,
  anchor,
}: {
  section: Site;
  anchor: { x: number; y: number } | null;
}): JSX.Element {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const openTlRef = useRef<gsap.core.Timeline | null>(null);
  const closingRef = useRef(false);

  const rows = rowsFor(section);
  const title = siteLabels[section];
  const lead = leadFor[section];

  /** Quick reverse fade (~160ms), then actually close via the store. */
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const overlay = overlayRef.current;
    if (!overlay || prefersReducedMotion()) {
      sceneActions.closePanel();
      return;
    }
    openTlRef.current?.kill();
    gsap.to(overlay, {
      opacity: 0,
      duration: 0.16,
      ease: "power1.in",
      onComplete: () => sceneActions.closePanel(),
    });
  }, []);

  // Open animation: title fades in first, tiles rise+fade with a 50ms
  // stagger (translateY(14px)→0, ~320ms power2.out). The whole content block
  // scales from ~0.985 toward the click anchor. Transform/opacity only.
  // The "showcase-ready" class gates the tile hover transition until the
  // gsap-driven transforms are done (and cleared), so they never fight.
  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const zoom = zoomRef.current;
    const head = headRef.current;
    const list = listRef.current;
    if (!overlay || !zoom || !head || !list) return;

    if (prefersReducedMotion()) {
      // No movement: everything renders in place; just mark ready + focus.
      overlay.classList.add("showcase-ready");
      closeRef.current?.focus({ preventScroll: true });
      return;
    }

    const tiles = Array.from(
      list.querySelectorAll<HTMLElement>(".showcase-tile"),
    );
    const closeEl = closeRef.current;
    const ox = anchor ? anchor.x : window.innerWidth / 2;
    const oy = anchor ? anchor.y : window.innerHeight / 2;

    const tl = gsap.timeline();
    openTlRef.current = tl;
    tl.set(overlay, { opacity: 0 });
    tl.set(zoom, { scale: 0.985, transformOrigin: `${ox}px ${oy}px` });
    tl.set(head, { opacity: 0, y: 10 });
    if (closeEl) tl.set(closeEl, { opacity: 0 });
    tl.set(tiles, { opacity: 0, y: 14 });
    tl.to(overlay, { opacity: 1, duration: 0.18, ease: "power1.out" }, 0);
    tl.to(
      zoom,
      { scale: 1, duration: 0.36, ease: "power2.out", clearProps: "transform" },
      0.02,
    );
    tl.to(
      head,
      {
        opacity: 1,
        y: 0,
        duration: 0.26,
        ease: "power2.out",
        clearProps: "transform",
      },
      0.05,
    );
    if (closeEl) {
      tl.to(closeEl, { opacity: 1, duration: 0.2, ease: "power1.out" }, 0.12);
    }
    tl.to(
      tiles,
      {
        opacity: 1,
        y: 0,
        duration: 0.32,
        ease: "power2.out",
        stagger: 0.05,
        clearProps: "transform",
      },
      0.16,
    );
    tl.call(() => {
      overlay.classList.add("showcase-ready");
      closeRef.current?.focus({ preventScroll: true });
    });

    return () => {
      tl.kill();
      openTlRef.current = null;
    };
  }, [anchor]);

  // Escape closes; cleaned up on unmount.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  return (
    // Full-viewport overlay: sits above the canvas, just under the EKG strip
    // (z-30) and the monogram (z-40). The overlay itself is the scroller, so
    // wheel/touch scrolling moves the tile column; overscroll-behavior keeps
    // it from leaking into the (paused) organ scroll behind.
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="false"
      aria-label={`${title} — showcase`}
      data-backdrop="true"
      className="fixed inset-0 overflow-y-auto"
      style={{
        zIndex: 28,
        background: WASH,
        overscrollBehavior: "contain",
      }}
      onPointerDown={(e) => {
        // Backdrop close: only when the press lands on the wash itself (or
        // the full-bleed content wrapper), never inside the header, tiles,
        // or close control.
        const t = e.target as HTMLElement;
        if (!t.dataset || t.dataset.backdrop !== "true") return;
        requestClose();
      }}
    >
      {/* close control — pinned top-right, clear of the EKG strip */}
      <button
        ref={closeRef}
        type="button"
        onClick={requestClose}
        className="showcase-close font-mono"
        style={{
          position: "fixed",
          top: "72px",
          right: "clamp(16px, 3vw, 30px)",
          zIndex: 1,
          fontFamily: MONO,
          fontSize: "0.62rem",
          letterSpacing: "0.08em",
          textTransform: "lowercase",
          color: "var(--ink-soft)",
          background: "transparent",
          border: "none",
          borderBottom: `1px solid ${HAIRLINE}`,
          borderRadius: 0,
          padding: "2px 1px 3px",
          cursor: "pointer",
        }}
      >
        close
      </button>

      {/* scale-from-click wrapper; min-height fills the viewport so gutter
          clicks below short columns still read as backdrop */}
      <div
        ref={zoomRef}
        data-backdrop="true"
        style={{
          minHeight: "100%",
          paddingTop: "72px",
          paddingBottom: "min(14vh, 120px)",
        }}
      >
        {/* header — lead line over the Spectral title, centered */}
        <header
          ref={headRef}
          style={{
            textAlign: "center",
            padding: "0 56px",
            marginBottom: "clamp(28px, 5vh, 48px)",
          }}
        >
          <p
            className="font-mono"
            style={{
              fontFamily: MONO,
              fontSize: "0.6rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--sepia)",
              margin: "0 0 10px",
            }}
          >
            {lead}
          </p>
          <h2
            style={{
              fontFamily: DISPLAY,
              fontWeight: 600,
              fontSize: "clamp(1.8rem, 4vw, 2.6rem)",
              lineHeight: 1.05,
              color: "var(--ink)",
              margin: 0,
            }}
          >
            {title}
          </h2>
        </header>

        {/* typographic tiles — generous single column, centered */}
        <ol
          ref={listRef}
          style={{
            listStyle: "none",
            maxWidth: "720px",
            margin: "0 auto",
            padding: "0 16px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {rows.map((row, i) => (
            <li
              key={i}
              className="showcase-tile"
              style={{
                background: BG,
                border: `1px solid ${HAIRLINE}`,
                borderRadius: 0,
                padding: "clamp(22px, 3vw, 26px)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "clamp(14px, 2.5vw, 22px)",
                }}
              >
                <span
                  aria-hidden="true"
                  className="font-mono"
                  style={{
                    fontFamily: MONO,
                    fontSize: "1.6rem",
                    lineHeight: 1,
                    color: "color-mix(in srgb, var(--sepia) 45%, transparent)",
                    minWidth: "2.2ch",
                    flexShrink: 0,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    minWidth: 0,
                  }}
                >
                  <span
                    className="tile-name"
                    style={{
                      fontFamily: DISPLAY,
                      fontWeight: 500,
                      fontSize: "clamp(1.18rem, 2.4vw, 1.42rem)",
                      lineHeight: 1.25,
                      color: "var(--ink)",
                    }}
                  >
                    {row.primary}
                  </span>
                  {row.meta ? (
                    <span
                      className="font-mono"
                      style={{
                        fontFamily: MONO,
                        fontSize: "0.62rem",
                        letterSpacing: "0.08em",
                        color: "var(--sepia)",
                      }}
                    >
                      {row.meta}
                    </span>
                  ) : null}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* hover: name→oxblood + a 2px lift, transform/color only, 160ms. The
          lift transition only arms once the open stagger has finished
          (showcase-ready), so it never tweens against gsap. */}
      <style>{`
        .showcase-ready .showcase-tile { transition: transform 160ms ease; }
        .showcase-tile:hover { transform: translateY(-2px); }
        .tile-name { transition: color 160ms ease; }
        .showcase-tile:hover .tile-name { color: var(--oxblood); }
        .showcase-close {
          transition: color 160ms linear, border-color 160ms linear;
        }
        .showcase-close:hover,
        .showcase-close:focus-visible {
          color: var(--oxblood);
          border-color: var(--oxblood);
        }
        .showcase-close:focus-visible {
          outline: 1px solid var(--oxblood);
          outline-offset: 3px;
        }
        @media (prefers-reduced-motion: reduce) {
          .showcase-ready .showcase-tile,
          .showcase-tile:hover { transform: none; transition: none; }
        }
      `}</style>
    </div>
  );
}
