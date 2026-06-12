"use client";

/**
 * Chart — the medical CHART station, read as a single printed page.
 *
 * One paper-card panel in atlas styling. No tabs, no KPI cards:
 *
 *   • VITALS  — one mono line, "pulse N · rate NN · rhythm sinus", with
 *               oxblood numerals; the live global pulse count is read from
 *               /api/pulse when the panel opens. The count is a bare number —
 *               the logbook is gone, no visitor text is fetched or shown.
 *   • ORDERS  — a command line at the bottom routed to /api/console. The
 *               route returns { lines, ekg? }; when an ekg effect comes back
 *               (the easter eggs — "code blue", "defib", "tachy", …) we
 *               forward it to emitEkg() so the rhythm strip reacts.
 *
 * Launcher = a small chart-clip control bottom-left; the backtick key toggles
 * from anywhere. Escape closes. Stateless except the pulse round-trips.
 *
 * The panel is content-sized (maxHeight-bounded, no filler middle); only the
 * orders scrollback scrolls internally.
 *
 * Atlas language only: paper card (--paper-2), --line hairlines, --ink text,
 * Spectral entries, IBM Plex Mono meta, --oxblood accents. Rounded corners
 * via the global tokens (--radius-card panels, --radius-ctl controls), no
 * green, no glass/backdrop-blur, no glow, no emoji.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  useScene,
  sceneActions,
  emitEkg,
  type EkgEvent,
  type PulseState,
} from "@/lib/sceneStore";

const MONO =
  'var(--font-mono), "Spline Sans Mono", ui-monospace, SFMono-Regular, monospace';
const DISPLAY = "var(--font-display), 'Archivo Black', Archivo, sans-serif";

const CLEAR_SENTINEL = "::clear::";

// ---------------------------------------------------------------------------
// Orders scrollback line model
// ---------------------------------------------------------------------------

interface OrderLine {
  id: number;
  kind: "in" | "out" | "err";
  text: string;
}

let lineSeq = 0;
function nextId(): number {
  lineSeq += 1;
  return lineSeq;
}

const ORDERS_BANNER: Omit<OrderLine, "id">[] = [
  { kind: "out", text: "orders — type 'help' for the list of commands." },
];

// ---------------------------------------------------------------------------
// Pulse refresh — the live count read when the panel opens. The logbook is
// closed: `recent` is always empty and no visitor text is ever rendered.
// ---------------------------------------------------------------------------

async function fetchPulses(): Promise<PulseState | null> {
  try {
    const res = await fetch("/api/pulse", { method: "GET" });
    if (!res.ok) return null;
    const data = (await res.json()) as PulseState;
    if (!data || typeof data.count !== "number") return null;
    const state: PulseState = {
      count: data.count,
      recent: [],
      persisted: Boolean(data.persisted),
    };
    sceneActions.setPulses(state);
    return state;
  } catch {
    return null;
  }
}

// ===========================================================================
// Root
// ===========================================================================

export default function Chart() {
  const [open, setOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement | null>(null);

  // backtick toggles from anywhere; Escape closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "`") {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName;
        const typingElsewhere =
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          (t?.isContentEditable ?? false);
        // Allow the orders input itself to be toggled shut from within.
        if (typingElsewhere && !(t?.dataset?.chartInput === "1")) return;
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        // Return focus to the launcher so keyboard users aren't stranded.
        requestAnimationFrame(() => launcherRef.current?.focus());
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "close chart" : "open chart"}
        style={{
          ...launcherStyle,
          opacity: open ? 0.55 : 1,
        }}
        className="chart-launcher"
      >
        <ClipMark />
        <span style={{ letterSpacing: "0.12em" }}>chart</span>
      </button>

      {open ? (
        <ChartPanel
          onClose={() => {
            setOpen(false);
            requestAnimationFrame(() => launcherRef.current?.focus());
          }}
        />
      ) : null}

      <style>{`
        .chart-launcher:hover,
        .chart-launcher:focus-visible { border-color: var(--oxblood); color: var(--oxblood); }
        .chart-launcher:hover .chart-clip,
        .chart-launcher:focus-visible .chart-clip { stroke: var(--oxblood); }
      `}</style>
    </>
  );
}

/** A tiny chart-clip glyph for the launcher — a clipboard clasp in ink. */
function ClipMark() {
  return (
    <svg
      className="chart-clip"
      width="11"
      height="13"
      viewBox="0 0 11 13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      aria-hidden
      style={{ display: "block", transition: "stroke 150ms linear" }}
    >
      <rect x="0.5" y="2.5" width="10" height="10" rx="0.5" />
      <rect x="3" y="0.5" width="5" height="3" rx="0.5" />
    </svg>
  );
}

// ===========================================================================
// Panel — one printed-chart view: vitals line + orders.
// ===========================================================================

function ChartPanel({ onClose }: { onClose: () => void }) {
  const pulses = useScene((s) => s.pulses);
  const [loading, setLoading] = useState(true);

  // Refresh the live count once when the panel opens (best-effort).
  useEffect(() => {
    let alive = true;
    void fetchPulses().finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // A bpm-ish reading derived from the live pulse count — purely cosmetic, a
  // steady atlas-ish vitals number that nods at the count without faking data.
  const bpm = 60 + (pulses.count % 40);

  return (
    <section role="dialog" aria-label="patient chart" style={panelStyle}>
      {/* header */}
      <header style={headerStyle}>
        <span style={chartTitleStyle}>Patient chart</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="close chart"
          style={closeButtonStyle}
          className="chart-close"
        >
          close
        </button>
      </header>

      {/* body — the printed page */}
      <div style={bodyStyle}>
        <p style={vitalsLineStyle}>
          pulse{" "}
          <span style={vitalNumStyle}>
            {loading ? "··" : String(pulses.count)}
          </span>
          {" · "}rate{" "}
          <span style={vitalNumStyle}>{loading ? "··" : String(bpm)}</span>
          {" · "}rhythm sinus
        </p>
      </div>

      {/* orders input — always present, the running command line */}
      <OrdersBar />

      <style>{`
        .chart-close:hover,
        .chart-close:focus-visible { border-color: var(--oxblood); color: var(--oxblood); }
      `}</style>
    </section>
  );
}

// ===========================================================================
// ORDERS bar — the running command line, routed to /api/console.
// ===========================================================================

function OrdersBar() {
  const [log, setLog] = useState<OrderLine[]>(() =>
    ORDERS_BANNER.map((l) => ({ ...l, id: nextId() })),
  );
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Pin scrollback to the newest line.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const append = useCallback((lines: Omit<OrderLine, "id">[]) => {
    setLog((prev) => [...prev, ...lines.map((l) => ({ ...l, id: nextId() }))]);
  }, []);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const cmd = value.trim();
      if (!cmd || submitting) return;

      append([{ kind: "in", text: `order: ${cmd}` }]);
      setValue("");
      setSubmitting(true);

      try {
        const res = await fetch("/api/console", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cmd }),
        });
        if (!res.ok) {
          append([{ kind: "err", text: `error: chart returned ${res.status}.` }]);
        } else {
          const data = (await res.json()) as {
            lines?: string[];
            ekg?: EkgEvent;
          };
          const lines = Array.isArray(data.lines) ? data.lines : [];

          if (lines.length === 1 && lines[0] === CLEAR_SENTINEL) {
            setLog([]);
          } else {
            append(lines.map((text) => ({ kind: "out" as const, text })));
          }

          // Forward any EKG effect to the rhythm strip (the easter eggs).
          if (data.ekg) {
            emitEkg(data.ekg);
          }
        }
      } catch {
        append([{ kind: "err", text: "error: could not reach the chart." }]);
      } finally {
        setSubmitting(false);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    },
    [value, submitting, append],
  );

  return (
    <div style={ordersWrapStyle}>
      <div ref={scrollRef} style={ordersLogStyle}>
        {log.map((l) => (
          <div
            key={l.id}
            style={{
              color:
                l.kind === "err"
                  ? "var(--oxblood)"
                  : l.kind === "in"
                    ? "var(--ink)"
                    : "var(--ink-soft)",
            }}
          >
            {l.text}
          </div>
        ))}
      </div>
      <form onSubmit={onSubmit} style={ordersFormStyle}>
        <span aria-hidden style={ordersPromptStyle}>
          Rx
        </span>
        <input
          ref={inputRef}
          data-chart-input="1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={submitting}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          aria-label="orders command"
          placeholder={submitting ? "working…" : "help"}
          style={{ ...ordersInputStyle, opacity: submitting ? 0.6 : 1 }}
          className="chart-orders-input"
        />
      </form>
      <style>{`
        .chart-orders-input:focus-visible { color: var(--oxblood); }
        .chart-orders-input::placeholder { color: var(--sepia); }
      `}</style>
    </div>
  );
}

// ===========================================================================
// Styles (atlas: paper card, ink, oxblood, Archivo + mono, rounded, hairline)
// ===========================================================================

const launcherStyle: CSSProperties = {
  position: "fixed",
  left: 14,
  bottom: 14,
  zIndex: 60,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "5px 10px",
  background: "var(--paper-2)",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-ctl)",
  font: `500 10px/1 ${MONO}`,
  textTransform: "uppercase",
  cursor: "pointer",
  transition: "opacity 150ms linear, border-color 150ms linear, color 150ms linear",
};

const panelStyle: CSSProperties = {
  position: "fixed",
  left: 14,
  bottom: 52,
  zIndex: 60,
  width: "min(440px, calc(100vw - 28px))",
  // Content-sized: the panel hugs its sections; maxHeight only bounds it.
  maxHeight: "min(64vh, 520px)",
  display: "flex",
  flexDirection: "column",
  background: "var(--paper-2)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-card)",
  // Clip the orders strip's paper fill to the rounded card corners.
  overflow: "hidden",
  boxShadow: "0 1px 0 rgba(26,23,20,0.06)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  padding: "10px 12px 8px",
  borderBottom: "1px solid var(--line)",
  flex: "0 0 auto",
};

const chartTitleStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontWeight: 600,
  fontSize: "1.02rem",
  lineHeight: 1.05,
  color: "var(--ink)",
};

const closeButtonStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-ctl)",
  color: "var(--ink-soft)",
  font: `500 9px/1 ${MONO}`,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  padding: "4px 7px",
  cursor: "pointer",
  transition: "border-color 150ms linear, color 150ms linear",
};

const bodyStyle: CSSProperties = {
  // Does not grow — the panel fits its content (just the vitals line now).
  flex: "0 1 auto",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  padding: "14px 12px 16px",
};

// --- vitals line ------------------------------------------------------------

const vitalsLineStyle: CSSProperties = {
  flex: "0 0 auto",
  fontFamily: MONO,
  fontSize: "0.68rem",
  letterSpacing: "0.08em",
  lineHeight: 1.4,
  color: "var(--ink-soft)",
  margin: 0,
  // No bottom rule: the orders strip's hairline top border is the next rule.
  padding: 0,
};

const vitalNumStyle: CSSProperties = {
  color: "var(--oxblood)",
  fontWeight: 600,
};

// --- orders -------------------------------------------------------------------

const ordersWrapStyle: CSSProperties = {
  flex: "0 0 auto",
  borderTop: "1px solid var(--line)",
  background: "var(--paper)",
};

const ordersLogStyle: CSSProperties = {
  maxHeight: 86,
  overflowY: "auto",
  padding: "7px 12px 0",
  font: `400 11px/1.5 ${MONO}`,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const ordersFormStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "6px 12px 8px",
};

const ordersPromptStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.7rem",
  fontWeight: 600,
  letterSpacing: "0.04em",
  color: "var(--oxblood)",
};

const ordersInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: "transparent",
  border: "none",
  outline: "none",
  color: "var(--ink)",
  caretColor: "var(--oxblood)",
  font: `400 12px/1.4 ${MONO}`,
};
