/* eslint-disable react-hooks/set-state-in-effect -- sanctioned: a loading toggle around an async pulse fetch, and a collapse-on-organ-change reset; neither cascades */
"use client";

/**
 * Chart — the unified medical CHART station (replaces the old terminal Console).
 *
 * One paper-card panel in atlas styling that folds together everything the
 * portfolio used to scatter across separate widgets:
 *
 *   • VITALS       — patient = "visitor"; the live global pulse count rendered
 *                    as a vitals readout (a bpm-ish reading), read from
 *                    /api/pulse on open.
 *   • HISTORY      — projects / achievements / positions from content.ts as
 *                    chart entries.
 *   • LOGBOOK      — recent visitor signatures from /api/pulse; a "sign the
 *                    logbook" field POSTs to /api/pulse and refreshes.
 *   • AUSCULTATION — points of interest for the CURRENT organ (read useScene
 *                    index → STATES); clicking a point reveals a note, a couple
 *                    tied to real projects / research.
 *   • ORDERS       — a command line at the bottom routed to /api/console. The
 *                    route returns { lines, ekg? }; when an ekg effect comes
 *                    back (the easter eggs — "code blue", "defib", "tachy", …)
 *                    we forward it to emitEkg() so the rhythm strip reacts.
 *
 * Launcher = a small chart-clip control bottom-left; the backtick key toggles
 * from anywhere. Escape closes. Stateless except the pulse round-trips.
 *
 * Atlas language only: paper card (--paper-2), --line hairlines, --ink text,
 * Spectral names, IBM Plex Mono meta, --oxblood on hover/active. Sharp corners
 * (small controls ≤2px), no green, no glass/backdrop-blur, no glow, no emoji.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  useScene,
  sceneActions,
  emitEkg,
  STATES,
  type EkgEvent,
  type PulseState,
} from "@/lib/sceneStore";
import { projects, awards, positions, EMAIL } from "@/data/content";

const MONO =
  'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';
const DISPLAY = "var(--font-display), Spectral, Georgia, serif";

const CLEAR_SENTINEL = "::clear::";

type Tab = "vitals" | "history" | "logbook" | "auscultation";

const TABS: { id: Tab; label: string }[] = [
  { id: "vitals", label: "vitals" },
  { id: "history", label: "history" },
  { id: "logbook", label: "logbook" },
  { id: "auscultation", label: "auscultation" },
];

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
// Auscultation notes, keyed by the current organ state. A couple are tied to
// real projects / research from content.ts so the chart stays content-derived.
// ---------------------------------------------------------------------------

interface AuscultationPoint {
  point: string;
  site: string;
  note: string;
}

function auscultationFor(stateId: string): {
  organ: string;
  points: AuscultationPoint[];
} {
  const heart = projects[0]?.name ?? "the work";
  const research = projects[1]?.name ?? "the research";
  const review = projects[3]?.name ?? "the review";

  switch (stateId) {
    case "heart":
      return {
        organ: "heart",
        points: [
          {
            point: "apex",
            site: "S1 · mitral",
            note: `A steady drive — ${heart}. The thing he keeps building.`,
          },
          {
            point: "base",
            site: "S2 · aortic",
            note: "Clean closure. Decisions made, then lived with.",
          },
          {
            point: "margin",
            site: "soft murmur",
            note: "A surgeon's hands, still in training — listening more than cutting.",
          },
        ],
      };
    case "brain":
      return {
        organ: "brain",
        points: [
          {
            point: "frontal",
            site: "planning",
            note: `Ongoing inquiry — ${research}.`,
          },
          {
            point: "temporal",
            site: "language",
            note: `On how words shape choice — ${review}.`,
          },
          {
            point: "cerebellum",
            site: "coordination",
            note: "Awards and honors held lightly; the work is the point.",
          },
        ],
      };
    case "liver":
      return {
        organ: "liver",
        points: [
          {
            point: "right lobe",
            site: "synthesis",
            note: "Roles held — quietly load-bearing for a team.",
          },
          {
            point: "portal",
            site: "throughput",
            note: "Operations: turning intent into something that ships.",
          },
          {
            point: "margin",
            site: "reserve",
            note: "Resilient tissue. Regenerates. So does the person.",
          },
        ],
      };
    case "contact":
      return {
        organ: "the envelope",
        points: [
          {
            point: "address",
            site: "where to write",
            note: `Reach him directly at ${EMAIL}.`,
          },
          {
            point: "seal",
            site: "elsewhere",
            note: "GitHub and LinkedIn are linked at the foot of the page.",
          },
        ],
      };
    default:
      // intro / name state — there is no organ on the table yet.
      return {
        organ: "the specimen",
        points: [
          {
            point: "overview",
            site: "no organ selected",
            note: "Scroll to bring the heart, brain, or liver onto the table — then auscultate.",
          },
        ],
      };
  }
}

// ---------------------------------------------------------------------------
// Pulse refresh — shared with the logbook tab + orders sign command.
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
  const [tab, setTab] = useState<Tab>("vitals");
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
          tab={tab}
          setTab={setTab}
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
// Panel
// ===========================================================================

function ChartPanel({
  tab,
  setTab,
  onClose,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  onClose: () => void;
}) {
  const stateIndex = useScene((s) => s.index);
  const currentState = STATES[stateIndex] ?? STATES[0];

  return (
    <section role="dialog" aria-label="patient chart" style={panelStyle}>
      {/* header */}
      <header style={headerStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={chartTitleStyle}>Patient chart</span>
          <span style={chartSubStyle}>
            visitor · {currentState.label.toLowerCase()}
          </span>
        </div>
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

      {/* tabs */}
      <nav style={tabsStyle} aria-label="chart sections">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={active}
              className="chart-tab"
              style={{
                ...tabButtonStyle,
                color: active ? "var(--ink)" : "var(--sepia)",
                borderBottomColor: active ? "var(--oxblood)" : "transparent",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* body */}
      <div style={bodyStyle}>
        {tab === "vitals" ? <VitalsTab /> : null}
        {tab === "history" ? <HistoryTab /> : null}
        {tab === "logbook" ? <LogbookTab /> : null}
        {tab === "auscultation" ? (
          <AuscultationTab stateId={currentState.id} />
        ) : null}
      </div>

      {/* orders input — always present, the running command line */}
      <OrdersBar />

      <style>{`
        .chart-tab:hover { color: var(--ink); }
        .chart-tab:focus-visible { color: var(--oxblood); }
        .chart-close:hover,
        .chart-close:focus-visible { border-color: var(--oxblood); color: var(--oxblood); }
        .chart-entry:hover { border-left-color: var(--oxblood); }
        .ausc-point:hover,
        .ausc-point:focus-visible { border-color: var(--oxblood); color: var(--ink); }
        .ausc-point[aria-expanded="true"] { border-color: var(--oxblood); }
        .chart-sign-btn:hover,
        .chart-sign-btn:focus-visible { background: var(--oxblood); color: var(--paper); }
        .chart-link:hover,
        .chart-link:focus-visible { color: var(--oxblood); }
      `}</style>
    </section>
  );
}

// ===========================================================================
// VITALS tab
// ===========================================================================

function VitalsTab() {
  const pulses = useScene((s) => s.pulses);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  // Refresh the live count when the tab mounts (best-effort).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void fetchPulses().finally(() => {
      if (alive) {
        setLoading(false);
        setTouched(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // A bpm-ish reading derived from the live pulse count — purely cosmetic, a
  // steady atlas-ish vitals number that nods at the count without faking data.
  const bpm = 60 + (pulses.count % 40);

  return (
    <div>
      <SectionLabel>vitals — visitor</SectionLabel>

      <div style={vitalsGridStyle}>
        <Vital
          label="pulse"
          value={loading && !touched ? "··" : String(pulses.count)}
          unit="beats logged"
          accent
        />
        <Vital
          label="rate"
          value={loading && !touched ? "··" : String(bpm)}
          unit="bpm (est.)"
        />
        <Vital
          label="rhythm"
          value="sinus"
          unit={pulses.persisted ? "persisted" : "in-memory"}
        />
      </div>

      <p style={vitalsNoteStyle}>
        Each visit adds a beat to the global pulse. Sign the logbook to leave
        your mark on the strip.
      </p>
    </div>
  );
}

function Vital({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div style={vitalCardStyle}>
      <span style={vitalLabelStyle}>{label}</span>
      <span
        style={{
          ...vitalValueStyle,
          color: accent ? "var(--oxblood)" : "var(--ink)",
        }}
      >
        {value}
      </span>
      <span style={vitalUnitStyle}>{unit}</span>
    </div>
  );
}

// ===========================================================================
// HISTORY tab
// ===========================================================================

function HistoryTab() {
  return (
    <div>
      <SectionLabel>history — projects &amp; research</SectionLabel>
      {projects.map((p) => (
        <Entry key={p.name} primary={p.name} meta={p.tag} />
      ))}

      <SectionLabel spaced>history — achievements</SectionLabel>
      {awards.map((a) => (
        <Entry key={a.name} primary={a.name} meta={a.org} />
      ))}

      <SectionLabel spaced>history — positions</SectionLabel>
      {positions.map((p) => (
        <Entry
          key={`${p.role}-${p.org}`}
          primary={p.role}
          meta={p.org || "—"}
        />
      ))}
    </div>
  );
}

function Entry({ primary, meta }: { primary: string; meta: string }) {
  return (
    <div className="chart-entry" style={entryStyle}>
      <span style={entryPrimaryStyle}>{primary}</span>
      <span style={entryMetaStyle}>{meta}</span>
    </div>
  );
}

// ===========================================================================
// LOGBOOK tab
// ===========================================================================

function LogbookTab() {
  const pulses = useScene((s) => s.pulses);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    void fetchPulses();
  }, []);

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
    <div>
      <SectionLabel>logbook — visitor signatures</SectionLabel>

      {pulses.recent.length === 0 ? (
        <p style={emptyStyle}>No signatures yet. Be the first to sign in.</p>
      ) : (
        <ul style={logListStyle}>
          {pulses.recent.map((r, i) => (
            <li key={`${r.ts}-${i}`} style={logItemStyle}>
              <span style={logMsgStyle}>{r.msg}</span>
              <span style={logTsStyle}>{formatTs(r.ts)}</span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onSubmit} style={signFormStyle}>
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
        .chart-sign-input:focus-visible { border-color: var(--oxblood); }
      `}</style>
    </div>
  );
}

function formatTs(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "";
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

// ===========================================================================
// AUSCULTATION tab — points for the CURRENT organ; click reveals a note.
// ===========================================================================

function AuscultationTab({ stateId }: { stateId: string }) {
  const data = useMemo(() => auscultationFor(stateId), [stateId]);
  const [openPoint, setOpenPoint] = useState<string | null>(null);

  // Collapse any open note when the organ changes underneath us.
  useEffect(() => {
    setOpenPoint(null);
  }, [stateId]);

  return (
    <div>
      <SectionLabel>auscultation — {data.organ}</SectionLabel>
      <p style={auscIntroStyle}>
        Place the bell. Tap a point to listen.
      </p>
      <ul style={auscListStyle}>
        {data.points.map((pt) => {
          const isOpen = openPoint === pt.point;
          return (
            <li key={pt.point}>
              <button
                type="button"
                className="ausc-point"
                aria-expanded={isOpen}
                onClick={() => setOpenPoint(isOpen ? null : pt.point)}
                style={auscPointStyle}
              >
                <span style={auscPointNameStyle}>{pt.point}</span>
                <span style={auscPointSiteStyle}>{pt.site}</span>
              </button>
              {isOpen ? <p style={auscNoteStyle}>{pt.note}</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
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
// Small shared label
// ===========================================================================

function SectionLabel({
  children,
  spaced,
}: {
  children: React.ReactNode;
  spaced?: boolean;
}) {
  return (
    <h3 style={{ ...sectionLabelStyle, marginTop: spaced ? 16 : 0 }}>
      {children}
    </h3>
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
  height: "min(64vh, 520px)",
  display: "flex",
  flexDirection: "column",
  background: "var(--paper-2)",
  border: "1px solid var(--line)",
  borderRadius: 2,
  boxShadow: "0 1px 0 rgba(26,23,20,0.06)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
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

const chartSubStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.58rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--sepia)",
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

const tabsStyle: CSSProperties = {
  display: "flex",
  gap: 2,
  padding: "0 12px",
  borderBottom: "1px solid var(--line)",
  flex: "0 0 auto",
};

const tabButtonStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  borderBottom: "2px solid transparent",
  borderRadius: 0,
  font: `500 9.5px/1 ${MONO}`,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  padding: "8px 6px",
  marginBottom: -1,
  cursor: "pointer",
  transition: "color 150ms linear, border-color 150ms linear",
};

const bodyStyle: CSSProperties = {
  flex: "1 1 auto",
  overflowY: "auto",
  padding: "12px",
};

const sectionLabelStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.58rem",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--sepia)",
  margin: "0 0 8px",
  fontWeight: 500,
};

// --- vitals ---------------------------------------------------------------

const vitalsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
};

const vitalCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  padding: "10px 10px 9px",
  background: "var(--paper)",
  border: "1px solid var(--line)",
  borderRadius: 2,
};

const vitalLabelStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.54rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--sepia)",
};

const vitalValueStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontWeight: 600,
  fontSize: "1.5rem",
  lineHeight: 1,
};

const vitalUnitStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.52rem",
  letterSpacing: "0.06em",
  color: "var(--ink-soft)",
};

const vitalsNoteStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontSize: "0.86rem",
  lineHeight: 1.45,
  color: "var(--ink-soft)",
  margin: "12px 0 0",
};

// --- history --------------------------------------------------------------

const entryStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "7px 0 7px 10px",
  borderLeft: "2px solid var(--line)",
  marginBottom: 2,
  transition: "border-color 150ms linear",
};

const entryPrimaryStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontWeight: 500,
  fontSize: "0.94rem",
  lineHeight: 1.3,
  color: "var(--ink)",
};

const entryMetaStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.58rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--sepia)",
};

// --- logbook --------------------------------------------------------------

const emptyStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontSize: "0.88rem",
  color: "var(--ink-soft)",
  margin: "0 0 12px",
};

const logListStyle: CSSProperties = {
  listStyle: "none",
  margin: "0 0 12px",
  padding: 0,
  display: "flex",
  flexDirection: "column",
};

const logItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 10,
  padding: "6px 0",
  borderBottom: "1px solid var(--line)",
};

const logMsgStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontSize: "0.9rem",
  lineHeight: 1.35,
  color: "var(--ink)",
  wordBreak: "break-word",
  minWidth: 0,
};

const logTsStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.54rem",
  letterSpacing: "0.06em",
  color: "var(--sepia)",
  flex: "0 0 auto",
};

const signFormStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "stretch",
};

const signInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: "var(--paper)",
  border: "1px solid var(--line)",
  borderRadius: 2,
  padding: "7px 9px",
  fontFamily: DISPLAY,
  fontSize: "0.9rem",
  color: "var(--ink)",
  outline: "none",
  transition: "border-color 150ms linear",
};

const signButtonStyle: CSSProperties = {
  background: "var(--paper-2)",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: 2,
  padding: "0 14px",
  fontFamily: MONO,
  fontSize: "0.6rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  transition: "background 150ms linear, color 150ms linear, border-color 150ms linear",
};

const signErrorStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.62rem",
  lineHeight: 1.4,
  color: "var(--oxblood)",
  margin: "8px 0 0",
};

const signOkStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.62rem",
  lineHeight: 1.4,
  color: "var(--ink-soft)",
  margin: "8px 0 0",
};

// --- auscultation ---------------------------------------------------------

const auscIntroStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontSize: "0.86rem",
  fontStyle: "italic",
  color: "var(--ink-soft)",
  margin: "0 0 10px",
};

const auscListStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const auscPointStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 10,
  width: "100%",
  background: "var(--paper)",
  border: "1px solid var(--line)",
  borderRadius: 2,
  padding: "8px 10px",
  cursor: "pointer",
  color: "var(--ink-soft)",
  textAlign: "left",
  transition: "border-color 150ms linear, color 150ms linear",
};

const auscPointNameStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontWeight: 500,
  fontSize: "0.94rem",
  color: "inherit",
};

const auscPointSiteStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.56rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--sepia)",
  flex: "0 0 auto",
};

const auscNoteStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontSize: "0.88rem",
  lineHeight: 1.45,
  color: "var(--ink)",
  margin: "6px 0 0",
  padding: "0 4px 4px 4px",
};

// --- orders ---------------------------------------------------------------

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
