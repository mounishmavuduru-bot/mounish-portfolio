"use client";

import type { JSX } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  'var(--font-mono), "Spline Sans Mono", ui-monospace, SFMono-Regular, monospace';
const DISPLAY = "var(--font-display), 'Archivo Black', Archivo, sans-serif";
const RADIUS_CARD = "var(--radius-card, 14px)";
const RADIUS_CTL = "var(--radius-ctl, 8px)";

/** `note` (operative note) is present only on rows that expand — projects. */
type Row = { primary: string; meta: string; note?: string };

function rowsFor(section: Site): Row[] {
  if (section === "projects") {
    return projects.map((p) => ({
      primary: p.name,
      meta: p.tag,
      // Read the optional note safely — a project may omit it.
      note: typeof p.note === "string" ? p.note : undefined,
    }));
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

/** Panel placement, computed once per open from the click anchor. */
interface Placement {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  /** Anchor x relative to the panel's left edge — the scaleY origin hint. */
  originX: number;
}

/**
 * Clamp-on-screen dropdown geometry. The panel hangs DOWNWARD from the click
 * point: top sits just under the anchor (nudged up only when the click is so
 * low that less than ~280px would remain), horizontally centered on the click
 * but clamped inside the viewport. Width follows clamp(300px, 26vw, 380px),
 * shrunk further on very narrow viewports; height caps at 62vh and whatever
 * room remains above the bottom margin. Never throws — falls back to a
 * centered placement when window is unavailable (it never is in practice:
 * the panel only mounts after a client-side click).
 */
function placePanel(anchor: { x: number; y: number } | null): Placement {
  if (typeof window === "undefined") {
    return { left: 24, top: 96, width: 320, maxHeight: 420, originX: 160 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 16;
  const topMin = 76; // stays clear of the EKG strip
  const width = Math.min(Math.max(300, vw * 0.26), 380, vw - margin * 2);
  const ax = anchor ? anchor.x : vw / 2;
  const ay = anchor ? anchor.y : vh * 0.35;
  const left = Math.min(
    Math.max(ax - width / 2, margin),
    Math.max(margin, vw - margin - width),
  );
  const minRoom = Math.min(280, vh * 0.5);
  const top = Math.min(
    Math.max(ay + 10, topMin),
    Math.max(topMin, vh - margin - minRoom),
  );
  const maxHeight = Math.max(160, Math.min(vh * 0.62, vh - top - margin));
  const originX = Math.min(Math.max(ax - left, 0), width);
  return { left, top, width, maxHeight, originX };
}

/**
 * Cursor-anchored section dropdown: a solid paper-2 card that expands
 * downward from the click point (clamped on-screen), with the showcase's
 * header treatment (tiny mono lead line over the Spectral title) and
 * index-numeral rows. The row list scrolls INTERNALLY (overscroll contained);
 * the organ stays dimmed behind via Specimen's panelDim — nothing here paints
 * a wash. Self-contained: reads the panel slice from the scene store and
 * renders nothing while closed. Escape, the close control, and the
 * full-viewport outside-click catcher all call sceneActions.closePanel().
 *
 * Atlas styling: rounded --radius-card card with a 1px ink hairline, mono
 * index numerals at 45% sepia, Spectral names, mono meta, oxblood only on
 * hover/focus. Open = scaleY/opacity from the anchor (~240ms power3.out);
 * close = quick fade. Transform/opacity only; prefers-reduced-motion is
 * instant both ways.
 */
export default function SectionPanel(): JSX.Element | null {
  const panel = useScene((s) => s.panel);

  if (!panel.open || !panel.section) return null;
  // Remount per open so placement + entrance replay from a clean state.
  return (
    <AnchoredPanel
      key={`${panel.section}-${panel.anchor?.x ?? 0}-${panel.anchor?.y ?? 0}`}
      section={panel.section}
      anchor={panel.anchor}
    />
  );
}

function AnchoredPanel({
  section,
  anchor,
}: {
  section: Site;
  anchor: { x: number; y: number } | null;
}): JSX.Element {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const closingRef = useRef(false);
  // Operative-note accordion: index of the single open row, or null. Only rows
  // that carry a note can be opened; opening one closes the previous (single
  // expand). This is a click-driven state change — never set inside an effect.
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleRow = useCallback((i: number) => {
    setOpenIndex((cur) => (cur === i ? null : i));
  }, []);

  const rows = rowsFor(section);
  const title = siteLabels[section];
  const lead = leadFor[section];
  // Placement is per-open (the component remounts on every openPanel), so a
  // single memo on the anchor is enough; resizes mid-open are not tracked —
  // the panel is ephemeral and Escape is always available.
  const place = useMemo(() => placePanel(anchor), [anchor]);

  /** Quick reverse fade (~140ms), then actually close via the store. */
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const el = panelRef.current;
    if (!el || prefersReducedMotion()) {
      sceneActions.closePanel();
      return;
    }
    gsap.killTweensOf(el);
    gsap.to(el, {
      opacity: 0,
      duration: 0.14,
      ease: "power1.in",
      onComplete: () => sceneActions.closePanel(),
    });
  }, []);

  // Entrance: scaleY 0.7→1 + fade, transform-origin pinned to the click
  // anchor along the top edge, ~240ms power3.out. Transform/opacity only;
  // clearProps afterwards so the row hover transitions never fight gsap.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      closeRef.current?.focus({ preventScroll: true });
      return;
    }
    const tween = gsap.fromTo(
      el,
      {
        opacity: 0,
        scaleY: 0.7,
        transformOrigin: `${place.originX}px 0px`,
      },
      {
        opacity: 1,
        scaleY: 1,
        duration: 0.24,
        ease: "power3.out",
        clearProps: "transform",
        onComplete: () => {
          closeRef.current?.focus({ preventScroll: true });
        },
      },
    );
    return () => {
      tween.kill();
    };
  }, [place]);

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
    // Sits above the canvas, under the EKG strip (z-30) and monogram (z-40).
    <div className="fixed inset-0" style={{ zIndex: 28 }}>
      {/* outside-click catcher — transparent; the dim behind is Specimen's */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        onPointerDown={requestClose}
      />

      <section
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label={title}
        className="absolute flex flex-col"
        style={{
          left: `${place.left}px`,
          top: `${place.top}px`,
          width: `${place.width}px`,
          maxHeight: `${place.maxHeight}px`,
          background: BG,
          border: `1px solid ${HAIRLINE}`,
          borderRadius: RADIUS_CARD,
          overflow: "hidden",
          boxShadow: "0 1px 0 rgba(26, 23, 20, 0.05)",
        }}
      >
        {/* header — lead line over the Spectral title, close control right */}
        <header
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "12px",
            padding: "14px 16px 12px",
            borderBottom: `1px solid ${HAIRLINE}`,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              className="font-mono"
              style={{
                fontFamily: MONO,
                fontSize: "0.6rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--sepia)",
                margin: "0 0 6px",
              }}
            >
              {lead}
            </p>
            <h2
              style={{
                fontFamily: DISPLAY,
                fontWeight: 600,
                fontSize: "1.35rem",
                lineHeight: 1.1,
                color: "var(--ink)",
                margin: 0,
              }}
            >
              {title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={requestClose}
            className="panel-close font-mono"
            style={{
              flexShrink: 0,
              fontFamily: MONO,
              fontSize: "0.62rem",
              letterSpacing: "0.08em",
              textTransform: "lowercase",
              color: "var(--ink-soft)",
              background: "transparent",
              border: `1px solid ${HAIRLINE}`,
              borderRadius: RADIUS_CTL,
              padding: "3px 9px 4px",
              cursor: "pointer",
            }}
          >
            close
          </button>
        </header>

        {/* rows — the internal scroller; overscroll stays contained */}
        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: "6px 16px 12px",
            overflowY: "auto",
            overscrollBehavior: "contain",
            minHeight: 0,
            scrollbarWidth: "thin",
          }}
        >
          {rows.map((row, i) => {
            const numeral = String(i + 1).padStart(2, "0");
            const expandable = typeof row.note === "string" && row.note.length > 0;
            const isOpen = expandable && openIndex === i;
            const noteId = `panel-note-${section}-${i}`;

            // The numeral + name + meta block, shared by both row variants.
            const body = (
              <>
                <span
                  aria-hidden="true"
                  className="font-mono"
                  style={{
                    fontFamily: MONO,
                    fontSize: "1.05rem",
                    lineHeight: 1,
                    color: "color-mix(in srgb, var(--sepia) 45%, transparent)",
                    minWidth: "2.2ch",
                    flexShrink: 0,
                  }}
                >
                  {numeral}
                </span>
                <span
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    minWidth: 0,
                    flex: "1 1 auto",
                  }}
                >
                  <span
                    className="row-name"
                    style={{
                      fontFamily: DISPLAY,
                      fontWeight: 500,
                      fontSize: "1.05rem",
                      lineHeight: 1.3,
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
                {expandable ? (
                  <span
                    aria-hidden="true"
                    className="row-caret"
                    data-open={isOpen ? "true" : "false"}
                    style={{
                      flexShrink: 0,
                      alignSelf: "center",
                      display: "inline-flex",
                      width: "12px",
                      height: "12px",
                      color: "var(--sepia)",
                    }}
                  >
                    {/* drawn chevron — rotates 90deg when open (CSS) */}
                    <svg
                      viewBox="0 0 12 12"
                      width="12"
                      height="12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4.5 2.5 L8 6 L4.5 9.5" />
                    </svg>
                  </span>
                ) : null}
              </>
            );

            return (
              <li
                key={i}
                style={{
                  borderTop: i === 0 ? "none" : `1px solid ${HAIRLINE}`,
                }}
              >
                {expandable ? (
                  <button
                    type="button"
                    className="panel-row panel-row-btn"
                    aria-expanded={isOpen}
                    aria-controls={noteId}
                    onClick={() => toggleRow(i)}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "12px",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 2px",
                      borderRadius: RADIUS_CTL,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      font: "inherit",
                      color: "inherit",
                    }}
                  >
                    {body}
                  </button>
                ) : (
                  <div
                    className="panel-row"
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "12px",
                      padding: "10px 2px",
                      borderRadius: RADIUS_CTL,
                    }}
                  >
                    {body}
                  </div>
                )}

                {expandable ? (
                  // Accordion reveal: grid-template-rows 0fr→1fr + opacity.
                  // Transform/opacity/clip only — no height/padding tween. The
                  // inner wrapper must have min-height:0 + overflow:hidden for
                  // the 0fr collapse to clip cleanly.
                  <div
                    id={noteId}
                    className="row-note-grid"
                    data-open={isOpen ? "true" : "false"}
                    role="region"
                    aria-hidden={!isOpen}
                  >
                    <div className="row-note-clip">
                      <div className="row-note-inner">
                        <p
                          className="font-mono"
                          style={{
                            fontFamily: MONO,
                            fontSize: "0.55rem",
                            letterSpacing: "0.18em",
                            textTransform: "uppercase",
                            color: "var(--sepia)",
                            margin: "0 0 6px",
                          }}
                        >
                          op-note
                        </p>
                        <p
                          style={{
                            fontFamily: DISPLAY,
                            fontWeight: 400,
                            fontSize: "0.9rem",
                            lineHeight: 1.5,
                            color: "var(--ink-soft)",
                            margin: 0,
                          }}
                        >
                          {row.note}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      {/* hover: name→oxblood, color only, 160ms; close control matches.
          Accordion: grid-template-rows 0fr→1fr + opacity (clip/opacity only,
          never height/padding); caret rotates 90deg when its row is open. */}
      <style>{`
        .panel-row .row-name { transition: color 160ms ease; }
        .panel-row:hover .row-name,
        .panel-row:focus-visible .row-name { color: var(--oxblood); }
        .panel-row-btn:focus-visible {
          outline: 1px solid var(--oxblood);
          outline-offset: 1px;
        }
        .row-caret {
          transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
          transform: rotate(0deg);
        }
        .row-caret[data-open="true"] { transform: rotate(90deg); }
        .row-note-grid {
          display: grid;
          grid-template-rows: 0fr;
          opacity: 0;
          transition: grid-template-rows 240ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 200ms ease;
        }
        .row-note-grid[data-open="true"] {
          grid-template-rows: 1fr;
          opacity: 1;
        }
        .row-note-clip { min-height: 0; overflow: hidden; }
        .row-note-inner { padding: 2px 2px 12px 2px; }
        .panel-close {
          transition: color 160ms linear, border-color 160ms linear;
        }
        .panel-close:hover,
        .panel-close:focus-visible {
          color: var(--oxblood);
          border-color: var(--oxblood);
        }
        .panel-close:focus-visible {
          outline: 1px solid var(--oxblood);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .panel-row .row-name,
          .panel-close,
          .row-caret,
          .row-note-grid { transition: none; }
        }
      `}</style>
    </div>
  );
}
