"use client";

/**
 * PulseButton — the one-click "pulse" control, fixed bottom-CENTER (clear of
 * the Chart launcher bottom-left and the StateReadout bottom-right).
 *
 * A real <button> in atlas styling (paper-2 fill, hairline border, --radius-ctl)
 * with a code-drawn heart OUTLINE in --oxblood — never an emoji. The heart mark
 * gently pulses scale 1→1.08→1 on a ~1s loop (transform only); under
 * prefers-reduced-motion it sits perfectly still. A tiny mono label beside it
 * reads the live global count, "pulse N", from useScene(s => s.pulses.count).
 *
 * On click:
 *   (a) optimistically bump the count, then POST /api/pulse (bare, no body) and
 *       reconcile to the server-returned PulseState via sceneActions.setPulses;
 *   (b) emitEkg("ectopic") so the rhythm strip visibly beats;
 *   (c) dispatch a window CustomEvent "pulse:beat" the audio toggle can use to
 *       emphasize.
 *
 * Disabled while a request is in flight; rapid clicks are debounced (min
 * ~250ms). Keyboard-accessible (real button, focus-visible handled globally).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  useScene,
  sceneActions,
  emitEkg,
  type PulseState,
} from "@/lib/sceneStore";

const MONO =
  'var(--font-mono), "Spline Sans Mono", ui-monospace, SFMono-Regular, monospace';

/** Minimum spacing between accepted clicks (ms). */
const DEBOUNCE_MS = 250;

export default function PulseButton() {
  const count = useScene((s) => s.pulses.count);
  const [inflight, setInflight] = useState(false);

  // Non-reactive guards: last accepted click time + an alive flag so a resolving
  // fetch never touches state after unmount.
  const lastClickRef = useRef(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const onClick = useCallback(async () => {
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    // Debounce rapid clicks and refuse while a request is already in flight.
    if (inflight) return;
    if (now - lastClickRef.current < DEBOUNCE_MS) return;
    lastClickRef.current = now;

    setInflight(true);

    // Beat the trace + emphasize audio immediately (independent of the network).
    emitEkg("ectopic");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("pulse:beat"));
    }

    // Optimistic increment so the count moves the instant you click; the server
    // response reconciles it below.
    const optimistic: PulseState = {
      count: count + 1,
      recent: [],
      persisted: false,
    };
    sceneActions.setPulses(optimistic);

    try {
      const res = await fetch("/api/pulse", {
        method: "POST",
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as PulseState;
        if (aliveRef.current && data && typeof data.count === "number") {
          sceneActions.setPulses({
            count: data.count,
            recent: [],
            persisted: Boolean(data.persisted),
          });
        }
      }
      // On a non-ok response we keep the optimistic value — it self-corrects on
      // the next successful GET/POST elsewhere (Chart, mount).
    } catch {
      // network/parse failure — leave the optimistic value in place.
    } finally {
      if (aliveRef.current) setInflight(false);
    }
  }, [count, inflight]);

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={inflight}
        aria-label="record a pulse"
        style={rootStyle}
        className="pulse-button"
      >
        <span className="pulse-heart-wrap" style={heartWrapStyle}>
          <HeartMark />
        </span>
        <span style={labelStyle}>pulse {count}</span>
      </button>

      <style>{`
        .pulse-button:hover:not(:disabled),
        .pulse-button:focus-visible {
          border-color: var(--oxblood);
        }
        .pulse-button:disabled { cursor: default; opacity: 0.7; }
        .pulse-heart {
          transform-box: fill-box;
          transform-origin: center;
          animation: pulse-heart-beat 1s ease-in-out infinite;
        }
        @keyframes pulse-heart-beat {
          0%   { transform: scale(1); }
          18%  { transform: scale(1.08); }
          36%  { transform: scale(1); }
          100% { transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .pulse-heart { animation: none; }
        }
      `}</style>
    </>
  );
}

/** A code-drawn heart OUTLINE in --oxblood — never an emoji. */
function HeartMark() {
  return (
    <svg
      className="pulse-heart"
      width="14"
      height="13"
      viewBox="0 0 14 13"
      fill="none"
      stroke="var(--oxblood)"
      strokeWidth="1.2"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: "block" }}
    >
      <path d="M7 12 1.4 6.3a3.1 3.1 0 0 1 4.4-4.4L7 3.1l1.2-1.2a3.1 3.1 0 0 1 4.4 4.4L7 12Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Styles (atlas: paper-2 fill, hairline, oxblood mark, mono, rounded control)
// ---------------------------------------------------------------------------

const rootStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: 14,
  transform: "translateX(-50%)",
  zIndex: 55,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 11px",
  background: "var(--paper-2)",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-ctl)",
  cursor: "pointer",
  userSelect: "none",
  transition: "border-color 150ms linear, opacity 150ms linear",
};

const heartWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 14,
  height: 13,
  flex: "none",
};

const labelStyle: CSSProperties = {
  font: `500 10px/1 ${MONO}`,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink-soft)",
  whiteSpace: "nowrap",
};
