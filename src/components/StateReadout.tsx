"use client";

/**
 * StateReadout — a synthetic micro-readout of the live scene state, fixed in
 * the bottom-right corner (the Chart launcher owns bottom-left). Pure
 * instrumentation: a 3px oxblood square bullet plus a tiny letterspaced mono
 * line like "02 · brain — achievements". Decorative only — pointer-events
 * none, aria-hidden — and quiet: sepia ink that flashes to full ink for a
 * beat when the state changes, via a 150ms color transition.
 */

import { useEffect, useRef, type CSSProperties } from "react";
import { STATES, useScene } from "@/lib/sceneStore";

const MONO =
  'var(--font-mono), "Spline Sans Mono", ui-monospace, SFMono-Regular, monospace';

/** How long the readout holds full ink after a state change (ms). */
const FLASH_HOLD_MS = 300;

export default function StateReadout() {
  const index = useScene((s) => s.index);

  // Flash is done by mutating the span's style directly (no setState in an
  // effect): flip to ink, hold, ease back to sepia — the CSS 150ms color
  // transition does the actual fade both ways.
  const textRef = useRef<HTMLSpanElement | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    // No flash on first mount — only on genuine state changes.
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const el = textRef.current;
    if (!el) return;
    el.style.color = "var(--ink)";
    const timer = window.setTimeout(() => {
      el.style.color = "var(--sepia)";
    }, FLASH_HOLD_MS);
    return () => {
      window.clearTimeout(timer);
      el.style.color = "var(--sepia)";
    };
  }, [index]);

  const state = STATES[index] ?? STATES[0];
  const label = state.label.toLowerCase();
  const text = state.section
    ? `0${index} · ${label} — ${state.section}`
    : `0${index} · ${label}`;

  return (
    <div aria-hidden style={rootStyle}>
      <span style={bulletStyle} />
      <span ref={textRef} style={textStyle}>
        {text}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles (atlas: ink/sepia/oxblood, mono, sharp corners, no decoration)
// ---------------------------------------------------------------------------

const rootStyle: CSSProperties = {
  position: "fixed",
  right: 14,
  bottom: 14,
  zIndex: 35,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  pointerEvents: "none",
  userSelect: "none",
};

const bulletStyle: CSSProperties = {
  width: 3,
  height: 3,
  flex: "none",
  background: "var(--oxblood)",
};

const textStyle: CSSProperties = {
  font: `500 0.6rem/1 ${MONO}`,
  letterSpacing: "0.12em",
  color: "var(--sepia)",
  transition: "color 150ms linear",
  whiteSpace: "nowrap",
};
