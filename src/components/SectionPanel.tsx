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

const PANEL_W = 440; // max-width in css px
const MARGIN = 16; // viewport edge gap
const BG = "#0a0c0c";
const HAIRLINE = "rgba(232, 227, 216, 0.12)";
const MONO =
  'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';
const DISPLAY = 'var(--font-fraunces), serif';

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

export default function SectionPanel({
  section,
  anchor,
  onClose,
}: {
  section: Site;
  anchor: { x: number; y: number };
  onClose: () => void;
}): JSX.Element {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lineRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);

  // Resolved on-screen position + which side the anchor sits on (drives the
  // expand transform-origin). Computed once on mount from the panel's own size.
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    originX: "left" | "right";
  } | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const rows = rowsFor(section);
  const title = siteLabels[section];

  // Clamp the panel into the viewport based on its measured size, before paint.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = el.getBoundingClientRect();
    const w = rect.width || PANEL_W;
    const h = rect.height || 0;

    // Default: panel opens to the right and below the anchor. Flip if it would
    // overflow the right/bottom edge so it never spills off-screen.
    let left = anchor.x + 14;
    let originX: "left" | "right" = "left";
    if (left + w + MARGIN > vw) {
      left = anchor.x - 14 - w;
      originX = "right";
    }
    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));

    let top = anchor.y - 12;
    if (top + h + MARGIN > vh) top = vh - h - MARGIN;
    top = Math.max(MARGIN, top);

    setPos({ left, top, originX });
  }, [anchor.x, anchor.y]);

  // Open animation: the green incision line draws (scaleY 0->1), then the panel
  // body expands/clips open from the anchor side. Transform/clip/opacity only.
  useLayoutEffect(() => {
    if (!pos) return;
    const panel = panelRef.current;
    const line = lineRef.current;
    const body = bodyRef.current;
    if (!panel || !line || !body) return;

    const tl = gsap.timeline();
    tl.set(panel, { opacity: 1 });
    tl.set(line, { scaleY: 0, transformOrigin: "50% 0%" });
    tl.set(body, {
      opacity: 0,
      scaleY: 0.04,
      transformOrigin: `${pos.originX === "left" ? "0%" : "100%"} 0%`,
      clipPath: "inset(0 0 100% 0)",
    });
    tl.to(line, { scaleY: 1, duration: 0.18, ease: "power2.in" });
    tl.to(
      body,
      {
        opacity: 1,
        scaleY: 1,
        clipPath: "inset(0 0 0% 0)",
        duration: 0.26,
        ease: "power3.out",
      },
      ">-0.02"
    );
    // focus the panel once it is in place
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
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    // Full-screen transparent catcher: a click outside the panel closes it.
    <div
      className="fixed inset-0 z-40"
      style={{ background: "transparent" }}
      onPointerDown={() => onCloseRef.current()}
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
          width: "min(440px, calc(100vw - 32px))",
          maxHeight: "70vh",
          background: BG,
          border: `1px solid ${HAIRLINE}`,
          borderRadius: 0,
          // hidden until clamp+open animation places it (avoids a flash)
          opacity: pos ? undefined : 0,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* green incision line on the left edge */}
        <div
          ref={lineRef}
          aria-hidden="true"
          className="absolute inset-y-0 left-0"
          style={{
            width: "1px",
            background: "var(--green)",
            transform: "scaleY(0)",
            transformOrigin: "50% 0%",
          }}
        />

        <div
          ref={bodyRef}
          className="flex min-h-0 flex-col overflow-y-auto"
          style={{ willChange: "transform, clip-path, opacity" }}
        >
          {/* header */}
          <div
            className="flex items-start justify-between gap-3"
            style={{
              padding: "16px 16px 14px",
              borderBottom: `1px solid ${HAIRLINE}`,
            }}
          >
            <div className="flex flex-col gap-2">
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: "0.62rem",
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
                  fontSize: "1.6rem",
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
              onClick={() => onCloseRef.current()}
              style={{
                fontFamily: MONO,
                fontSize: "0.62rem",
                letterSpacing: "0.08em",
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
                  "color-mix(in srgb, var(--green) 60%, transparent)";
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
          <div className="flex flex-col" style={{ padding: "4px 14px 14px" }}>
            {rows.map((row, i) => (
              <div
                key={i}
                className="row group flex items-baseline justify-between gap-4"
                style={{
                  padding: "12px 2px",
                  borderBottom: `1px solid ${HAIRLINE}`,
                }}
              >
                <span
                  className="row-primary"
                  style={{
                    fontFamily: DISPLAY,
                    fontSize: "1.05rem",
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
                      fontSize: "0.62rem",
                      letterSpacing: "0.06em",
                      whiteSpace: "nowrap",
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
