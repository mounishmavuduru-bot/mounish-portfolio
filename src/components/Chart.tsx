"use client";

/**
 * Chart — the medical CHART station, read as a single printed page.
 *
 * One paper-card panel in atlas styling. No tabs, no KPI cards — the chart is
 * ruled hairlines top to bottom:
 *
 *   • VITALS  — one mono line, "pulse N · rate NN · rhythm sinus", with
 *               oxblood numerals; the live global pulse count is read from
 *               /api/pulse when the panel opens.
 *   • LOGBOOK — recent visitor signatures as ruled ledger lines
 *               ("— msg · time-ago") with the sign field inline as the last
 *               line; signing POSTs to /api/pulse and refreshes the shared
 *               count via sceneActions.setPulses.
 *   • ORDERS  — a command line at the bottom routed to /api/console. The
 *               route returns { lines, ekg? }; when an ekg effect comes back
 *               (the easter eggs — "code blue", "defib", "tachy", …) we
 *               forward it to emitEkg() so the rhythm strip reacts.
 *
 * Launcher = a small chart-clip control bottom-left; the backtick key toggles
 * from anywhere. Escape closes. Stateless except the pulse round-trips.
 *
 * The panel is content-sized (maxHeight-bounded, no filler middle); only the
 * logbook ledger scrolls internally, and only when it actually overflows.
 *
 * Atlas language only: paper card (--paper-2), --line hairlines, --ink text,
 * Spectral entries, IBM Plex Mono meta, --oxblood accents. Sharp corners
 * (small controls ≤2px), no green, no glass/backdrop-blur, no glow, no emoji.
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
  'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';
const DISPLAY = "var(--font-display), Spectral, Georgia, serif";

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
// Pulse refresh — shared by the panel open and the orders sign command.
// ---------------------------------------------------------------------------

async function fetchPulses(): Promise<PulseState | null> {
  try {
    const res = await fetch("/api/pulse", { method: "GET" });
    if (!res.ok) return null;
    const data = (await res.json()) as PulseState;
    if (!data || typeof data.count !== "number") return null;
    const state: PulseState = {
      count: data.count,
      recent: Array.isArray(data.recent) ? data.recent : [],
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
// Panel — one printed-chart view: vitals line, logbook ledger, orders.
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

        <Logbook />
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
// Logbook — ruled ledger lines + the sign field inline as the last line.
// ===========================================================================

function Logbook() {
  const pulses = useScene((s) => s.pulses);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [signed, setSigned] = useState(false);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const msg = value.trim();
      if (!msg || submitting) return;
      setSubmitting(true);
      setError("");
      try {
        const res = await fetch("/api/pulse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ msg }),
        });
        if (!res.ok) {
          setError("could not sign the logbook. please try again.");
        } else {
          const data = (await res.json()) as PulseState;
          if (data && typeof data.count === "number") {
            sceneActions.setPulses({
              count: data.count,
              recent: Array.isArray(data.recent) ? data.recent : [],
              persisted: Boolean(data.persisted),
            });
          }
          setValue("");
          setSigned(true);
        }
      } catch {
        setError("could not reach the logbook. please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [value, submitting],
  );

  return (
    <div style={logbookStyle}>
      <h3 style={logLabelStyle}>logbook</h3>

      {pulses.recent.length === 0 ? (
        <p style={emptyStyle}>No signatures yet. Be the first to sign in.</p>
      ) : (
        <ul style={ledgerStyle}>
          {pulses.recent.map((r, i) => (
            <li key={`${r.ts}-${i}`} style={ledgerLineStyle}>
              <span style={ledgerMsgStyle}>— {r.msg}</span>
              <span style={ledgerAgoStyle}>· {formatAgo(r.ts)}</span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onSubmit} style={signFormStyle}>
        <span aria-hidden style={signDashStyle}>
          —
        </span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={submitting}
          maxLength={80}
          spellCheck={false}
          autoComplete="off"
          aria-label="sign the logbook"
          placeholder="sign the logbook…"
          style={signInputStyle}
          className="chart-sign-input"
        />
        <button
          type="submit"
          disabled={submitting || !value.trim()}
          className="chart-sign-btn"
          style={{
            ...signButtonStyle,
            opacity: submitting || !value.trim() ? 0.55 : 1,
            cursor: submitting || !value.trim() ? "default" : "pointer",
          }}
        >
          {submitting ? "…" : "sign"}
        </button>
      </form>

      {error ? (
        <p role="alert" style={signErrorStyle}>
          {error}
        </p>
      ) : null}
      {signed && !error ? (
        <p role="status" style={signOkStyle}>
          Signed — your beat is on the strip.
        </p>
      ) : null}

      <style>{`
        .chart-sign-input:focus-visible { border-bottom-color: var(--oxblood); }
        .chart-sign-btn:hover:enabled,
        .chart-sign-btn:focus-visible { color: var(--oxblood); }
      `}</style>
    </div>
  );
}

/** Relative "time-ago" for ledger lines; falls back to a short date. */
function formatAgo(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d ago`;
  try {
    return new Date(ts)
      .toLocaleDateString(undefined, { month: "short", day: "numeric" })
      .toLowerCase();
  } catch {
    return "";
  }
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

          // pulse-mutating verbs refresh the shared count.
          const verb = cmd.split(/\s+/)[0]?.toLowerCase();
          if (verb === "sign" || verb === "leave") {
            void fetchPulses();
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
// Styles (atlas: paper card, ink, oxblood, Spectral + mono, sharp, hairline)
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
  borderRadius: 2,
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
  borderRadius: 2,
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
  borderRadius: 2,
  color: "var(--ink-soft)",
  font: `500 9px/1 ${MONO}`,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  padding: "4px 7px",
  cursor: "pointer",
  transition: "border-color 150ms linear, color 150ms linear",
};

const bodyStyle: CSSProperties = {
  // Does not grow — the panel fits its content. minHeight 0 lets the ledger
  // list (the only internal scroller) shrink when the maxHeight bound bites.
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
  padding: "0 0 14px",
  borderBottom: "1px solid var(--line)",
};

const vitalNumStyle: CSSProperties = {
  color: "var(--oxblood)",
  fontWeight: 600,
};

// --- logbook ledger ----------------------------------------------------------

const logbookStyle: CSSProperties = {
  // Flex column so only the ledger list scrolls when the panel is bounded.
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  flex: "0 1 auto",
};

const logLabelStyle: CSSProperties = {
  flex: "0 0 auto",
  fontFamily: MONO,
  fontSize: "0.56rem",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--sepia)",
  fontWeight: 500,
  margin: "14px 0 4px",
};

const emptyStyle: CSSProperties = {
  flex: "0 0 auto",
  fontFamily: DISPLAY,
  fontSize: "0.88rem",
  color: "var(--ink-soft)",
  margin: "6px 0 0",
  padding: "0 0 8px",
  borderBottom: "1px solid var(--line)",
};

const ledgerStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  // Scrolls internally only when the signatures actually overflow the bound.
  flex: "0 1 auto",
  minHeight: 0,
  overflowY: "auto",
};

const ledgerLineStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 10,
  padding: "7px 0",
  borderBottom: "1px solid var(--line)",
};

const ledgerMsgStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontSize: "0.9rem",
  lineHeight: 1.35,
  color: "var(--ink)",
  wordBreak: "break-word",
  minWidth: 0,
};

const ledgerAgoStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.56rem",
  letterSpacing: "0.06em",
  color: "var(--sepia)",
  flex: "0 0 auto",
};

// --- inline sign line ---------------------------------------------------------

const signFormStyle: CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  padding: "8px 0 0",
};

const signDashStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontSize: "0.9rem",
  color: "var(--sepia)",
  flex: "0 0 auto",
};

const signInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: "transparent",
  border: "none",
  borderBottom: "1px solid var(--line)",
  borderRadius: 0,
  padding: "0 0 5px",
  fontFamily: DISPLAY,
  fontSize: "0.9rem",
  color: "var(--ink)",
  outline: "none",
  transition: "border-color 150ms linear",
};

const signButtonStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  borderRadius: 0,
  padding: "0 2px 5px",
  fontFamily: MONO,
  fontSize: "0.6rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--ink-soft)",
  transition: "color 150ms linear, opacity 150ms linear",
};

const signErrorStyle: CSSProperties = {
  flex: "0 0 auto",
  fontFamily: MONO,
  fontSize: "0.62rem",
  lineHeight: 1.4,
  color: "var(--oxblood)",
  margin: "8px 0 0",
};

const signOkStyle: CSSProperties = {
  flex: "0 0 auto",
  fontFamily: MONO,
  fontSize: "0.62rem",
  lineHeight: 1.4,
  color: "var(--ink-soft)",
  margin: "8px 0 0",
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
