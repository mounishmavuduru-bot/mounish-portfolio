"use client";

import type { JSX } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import {
  projects,
  awards,
  positions,
  siteLabels,
  type Site,
} from "@/data/content";
import { useScene, sceneActions } from "@/lib/sceneStore";

const MARGIN = 14; // viewport edge gap
const BG = "#0a0c0c";
const HAIRLINE = "rgba(232, 227, 216, 0.12)";
const MONO =
  'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';
const DISPLAY = "var(--font-display), sans-serif";

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

/**
 * A narrow vertical rectangle that grows DOWNWARD from the click anchor and
 * shows the active organ's content section. Self-contained: it reads the panel
 * slice from the scene store and renders nothing while closed. Escape,
 * outside-click, and the close button all call sceneActions.closePanel().
 *
 * Solid (#0a0c0c — never glass), sharp corners, 1px hairline border. Opens via
 * scaleY 0→1 from the top edge while the contents fade in (transform/opacity
 * only); max-height is capped with internal vertical scroll.
 */
export default function SectionPanel(): JSX.Element | null {
  const panel = useScene((s) => s.panel);
  const open = panel.open;
  const section = panel.section;
  const anchor = panel.anchor;

  if (!open || !section || !anchor) return null;
  // Remount per open so the entrance animation replays from a clean state and
  // position is recomputed for the new anchor.
  return (
    <PanelBody
      key={`${section}-${anchor.x}-${anchor.y}`}
      section={section}
      anchor={anchor}
    />
  );
}

function PanelBody({
  section,
  anchor,
}: {
  section: Site;
  anchor: { x: number; y: number };
}): JSX.Element {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Resolved on-screen position. Top sits AT the anchor (panel grows down);
  // horizontally near anchor.x, clamped on-screen using the measured width.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const rows = rowsFor(section);
  const title = siteLabels[section];

  // Clamp into the viewport from the measured size, before paint.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const vw = window.innerWidth;
    const rect = el.getBoundingClientRect();
    const w = rect.width || 280;

    // Horizontal: nudge left so the cursor sits a little inside the panel,
    // then clamp to the viewport.
    let left = anchor.x - 18;
    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));

    // Vertical: top AT the anchor. If that leaves too little room below, lift
    // it just enough that the (capped) panel stays on-screen.
    const top = Math.max(MARGIN, anchor.y);

    setPos({ left, top });
  }, [anchor.x, anchor.y]);

  // Open animation: scaleY 0→1 from the top edge, contents fade in. ~280ms
  // power3.out. Transform/opacity only.
  useLayoutEffect(() => {
    if (!pos) return;
    const panel = panelRef.current;
    const body = bodyRef.current;
    if (!panel || !body) return;

    const tl = gsap.timeline();
    tl.set(panel, {
      opacity: 1,
      scaleY: 0,
      transformOrigin: "50% 0%",
    });
    tl.set(body, { opacity: 0 });
    tl.to(panel, { scaleY: 1, duration: 0.28, ease: "power3.out" });
    tl.to(body, { opacity: 1, duration: 0.2, ease: "power1.out" }, "-=0.16");
    tl.call(() => {
      panel.focus({ preventScroll: true });
    });

    return () => {
      tl.kill();
    };
  }, [pos]);

  // Escape closes; cleaned up on unmount.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        sceneActions.closePanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    // Transparent full-screen catcher: any outside pointerdown closes.
    <div
      className="fixed inset-0 z-40"
      style={{ background: "transparent" }}
      onPointerDown={() => sceneActions.closePanel()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label={`${title} section`}
        tabIndex={-1}
        className="fixed flex flex-col outline-none"
        style={{
          left: pos ? pos.left : anchor.x,
          top: pos ? pos.top : anchor.y,
          width: "clamp(240px, 22vw, 320px)",
          maxHeight: "min(70vh, calc(100vh - 28px))",
          background: BG,
          border: `1px solid ${HAIRLINE}`,
          borderRadius: 0,
          // hidden until clamp+open animation places it (avoids a flash)
          opacity: pos ? undefined : 0,
          willChange: "transform, opacity",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          ref={bodyRef}
          className="flex min-h-0 flex-col overflow-y-auto"
        >
          {/* header */}
          <div
            className="flex items-start justify-between gap-3"
            style={{
              position: "sticky",
              top: 0,
              background: BG,
              padding: "14px 14px 12px",
              borderBottom: `1px solid ${HAIRLINE}`,
              zIndex: 1,
            }}
          >
            <div className="flex flex-col gap-1.5">
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: "0.56rem",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "color-mix(in srgb, var(--green) 70%, transparent)",
                }}
              >
                specimen — {section}
              </span>
              <h2
                style={{
                  fontFamily: DISPLAY,
                  fontWeight: 800,
                  fontSize: "1.35rem",
                  lineHeight: 1.05,
                  color: "var(--bone)",
                  margin: 0,
                }}
              >
                {title}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => sceneActions.closePanel()}
              style={{
                fontFamily: MONO,
                fontSize: "0.6rem",
                letterSpacing: "0.06em",
                textTransform: "lowercase",
                color: "color-mix(in srgb, var(--bone) 70%, transparent)",
                border:
                  "1px solid color-mix(in srgb, var(--bone) 25%, transparent)",
                borderRadius: "2px",
                padding: "4px 8px",
                background: "transparent",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "color 150ms linear, border-color 150ms linear",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--green)";
                e.currentTarget.style.borderColor =
                  "color-mix(in srgb, var(--green) 55%, transparent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color =
                  "color-mix(in srgb, var(--bone) 70%, transparent)";
                e.currentTarget.style.borderColor =
                  "color-mix(in srgb, var(--bone) 25%, transparent)";
              }}
            >
              close
            </button>
          </div>

          {/* rows */}
          <div className="flex flex-col" style={{ padding: "2px 14px 12px" }}>
            {rows.map((row, i) => (
              <div
                key={i}
                className="row group flex flex-col gap-1"
                style={{
                  padding: "11px 2px",
                  borderBottom: `1px solid ${HAIRLINE}`,
                }}
              >
                <span
                  className="row-primary"
                  style={{
                    fontFamily: DISPLAY,
                    fontWeight: 800,
                    fontSize: "1rem",
                    lineHeight: 1.2,
                    color: "var(--bone)",
                    transition: "color 150ms linear",
                  }}
                >
                  {row.primary}
                </span>
                {row.meta ? (
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: "0.6rem",
                      letterSpacing: "0.06em",
                      color: "color-mix(in srgb, var(--bone) 45%, transparent)",
                    }}
                  >
                    {row.meta}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* row hover: primary text -> green, color only (no lift/scale/shadow) */}
      <style>{`
        .row:hover .row-primary { color: var(--green); }
      `}</style>
    </div>
  );
}
