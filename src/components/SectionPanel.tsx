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
const BG = "var(--paper-2)";
const HAIRLINE = "var(--line)";
const MONO =
  'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';
const DISPLAY = "var(--font-display), Spectral, Georgia, serif";

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
 * Atlas styling: a solid cream-paper card (--paper-2, never glass), sharp 2px
 * corners, 1px ink hairline border, Spectral names, mono meta, oxblood on
 * hover. No "specimen —" label. Opens via scaleY 0→1 from the top edge while
 * the contents fade in (transform/opacity only); max-height capped with
 * internal vertical scroll.
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

    // Vertical: top AT the anchor, clamped so the (capped) panel stays on-screen.
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
          width: "clamp(244px, 23vw, 328px)",
          maxHeight: "min(70vh, calc(100vh - 28px))",
          background: BG,
          border: `1px solid ${HAIRLINE}`,
          borderRadius: "2px",
          // hidden until clamp+open animation places it (avoids a flash)
          opacity: pos ? undefined : 0,
          willChange: "transform, opacity",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div ref={bodyRef} className="flex min-h-0 flex-col overflow-y-auto">
          {/* header — no "specimen —" label, just the section title + close */}
          <div
            className="flex items-center justify-between gap-3"
            style={{
              position: "sticky",
              top: 0,
              background: BG,
              padding: "13px 14px 11px",
              borderBottom: `1px solid ${HAIRLINE}`,
              zIndex: 1,
            }}
          >
            <h2
              style={{
                fontFamily: DISPLAY,
                fontWeight: 600,
                fontSize: "1.32rem",
                lineHeight: 1.05,
                color: "var(--ink)",
                margin: 0,
              }}
            >
              {title}
            </h2>

            <button
              type="button"
              onClick={() => sceneActions.closePanel()}
              className="panel-close font-mono"
              style={{
                fontFamily: MONO,
                fontSize: "0.6rem",
                letterSpacing: "0.06em",
                textTransform: "lowercase",
                color: "var(--ink-soft)",
                border: "1px solid var(--line)",
                borderRadius: "2px",
                padding: "4px 8px",
                background: "transparent",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "color 150ms linear, border-color 150ms linear",
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
                    fontWeight: 500,
                    fontSize: "1.02rem",
                    lineHeight: 1.22,
                    color: "var(--ink)",
                    transition: "color 150ms linear",
                  }}
                >
                  {row.primary}
                </span>
                {row.meta ? (
                  <span
                    className="font-mono"
                    style={{
                      fontFamily: MONO,
                      fontSize: "0.6rem",
                      letterSpacing: "0.06em",
                      color: "var(--sepia)",
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

      {/* hover: row primary + close shift to oxblood, color only (no lift) */}
      <style>{`
        .row:hover .row-primary { color: var(--oxblood); }
        .panel-close:hover,
        .panel-close:focus-visible {
          color: var(--oxblood);
          border-color: color-mix(in srgb, var(--oxblood) 55%, transparent);
        }
      `}</style>
    </div>
  );
}
