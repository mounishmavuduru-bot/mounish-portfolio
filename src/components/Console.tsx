"use client";

/**
 * Console — a small fluoroscopy terminal.
 *
 * A minimal launcher control sits bottom-left ("›_ console"); the backtick key
 * toggles the panel from anywhere. Open, it shows a scrollback log and a mono
 * input. Submitting a command hits /api/console and prints the returned lines.
 *
 * The `leave <message>` and `pulse` commands round-trip the pulse store; after
 * a `leave` we refresh the live pulse state via sceneActions.setPulses so the
 * rest of the scene sees the new count.
 *
 * Visual language: --green on #0a0c0c, IBM Plex Mono, sharp corners, no glow.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { sceneActions } from "@/lib/sceneStore";
import type { PulseState } from "@/lib/sceneStore";

const CLEAR_SENTINEL = "::clear::";

interface LogLine {
  id: number;
  kind: "in" | "out" | "err";
  text: string;
}

const BANNER: Omit<LogLine, "id">[] = [
  { kind: "out", text: "specimen console — type 'help'." },
];

let lineSeq = 0;
function nextId(): number {
  lineSeq += 1;
  return lineSeq;
}

export default function Console() {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<LogLine[]>(() =>
    BANNER.map((l) => ({ ...l, id: nextId() })),
  );
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- toggle via backtick, close via Escape -----------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Backtick toggles, but never while typing into another field.
      if (e.key === "`") {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName;
        const typingElsewhere =
          (tag === "INPUT" && t !== inputRef.current) ||
          tag === "TEXTAREA" ||
          (t?.isContentEditable ?? false);
        if (typingElsewhere) return;
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // --- focus input + keep scrollback pinned to bottom --------------------
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, open]);

  const append = useCallback((lines: Omit<LogLine, "id">[]) => {
    setLog((prev) => [...prev, ...lines.map((l) => ({ ...l, id: nextId() }))]);
  }, []);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const cmd = value.trim();
      if (!cmd || submitting) return;

      append([{ kind: "in", text: `› ${cmd}` }]);
      setValue("");
      setSubmitting(true);

      try {
        const res = await fetch("/api/console", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cmd }),
        });
        if (!res.ok) {
          append([{ kind: "err", text: `error: console returned ${res.status}` }]);
        } else {
          const data = (await res.json()) as { lines?: string[] };
          const lines = Array.isArray(data.lines) ? data.lines : [];

          if (lines.length === 1 && lines[0] === CLEAR_SENTINEL) {
            setLog([]);
          } else {
            append(lines.map((text) => ({ kind: "out" as const, text })));
          }

          // Side effects: pulse-mutating commands refresh the shared count.
          const verb = cmd.split(/\s+/)[0]?.toLowerCase();
          if (verb === "leave") {
            void refreshPulses();
          }
        }
      } catch {
        append([{ kind: "err", text: "error: could not reach console." }]);
      } finally {
        setSubmitting(false);
        // Refocus after React commits the disabled→enabled flip.
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    },
    [value, submitting, append],
  );

  return (
    <>
      {/* Launcher — bottom-left, sharp, mono. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "close console" : "open console"}
        style={{
          position: "fixed",
          left: 14,
          bottom: 14,
          zIndex: 60,
          padding: "5px 9px",
          background: "#0a0c0c",
          color: "var(--green)",
          border: "1px solid rgba(54,201,124,0.45)",
          borderRadius: 2,
          font: "500 11px/1 var(--font-mono), monospace",
          letterSpacing: "0.08em",
          cursor: "pointer",
          opacity: open ? 0.55 : 1,
          transition: "opacity 150ms linear, border-color 150ms linear",
        }}
      >
        ›_ console
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="console"
          style={{
            position: "fixed",
            left: 14,
            bottom: 52,
            zIndex: 60,
            width: "min(420px, calc(100vw - 28px))",
            height: "min(46vh, 360px)",
            display: "flex",
            flexDirection: "column",
            background: "#0a0c0c",
            border: "1px solid rgba(54,201,124,0.30)",
            borderRadius: 0,
          }}
        >
          {/* header */}
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 10px",
              borderBottom: "1px solid rgba(54,201,124,0.18)",
              flex: "0 0 auto",
            }}
          >
            <span
              style={{
                font: "500 9px/1 var(--font-mono), monospace",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(54,201,124,0.6)",
              }}
            >
              specimen — console
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="close console"
              style={{
                background: "transparent",
                border: "1px solid rgba(54,201,124,0.30)",
                borderRadius: 2,
                color: "var(--green)",
                font: "500 9px/1 var(--font-mono), monospace",
                letterSpacing: "0.1em",
                padding: "3px 6px",
                cursor: "pointer",
              }}
            >
              close
            </button>
          </header>

          {/* scrollback */}
          <div
            ref={scrollRef}
            style={{
              flex: "1 1 auto",
              overflowY: "auto",
              padding: "8px 10px",
              font: "400 11.5px/1.5 var(--font-mono), monospace",
              color: "rgba(54,201,124,0.82)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {log.map((l) => (
              <div
                key={l.id}
                style={{
                  color:
                    l.kind === "err"
                      ? "var(--blood)"
                      : l.kind === "in"
                        ? "var(--green)"
                        : "rgba(54,201,124,0.78)",
                  opacity: l.kind === "out" ? 0.92 : 1,
                }}
              >
                {l.text}
              </div>
            ))}
          </div>

          {/* input */}
          <form
            onSubmit={onSubmit}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderTop: "1px solid rgba(54,201,124,0.18)",
              flex: "0 0 auto",
            }}
          >
            <span
              aria-hidden
              style={{
                color: "var(--green)",
                font: "500 12px/1 var(--font-mono), monospace",
              }}
            >
              ›
            </span>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={submitting}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              aria-label="console command"
              placeholder={submitting ? "working…" : "help"}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--green)",
                font: "400 12px/1.4 var(--font-mono), monospace",
                caretColor: "var(--green)",
                opacity: submitting ? 0.6 : 1,
              }}
            />
          </form>
        </section>
      )}
    </>
  );
}

/** Refresh shared pulse state after a guestbook write. Tolerates failure. */
async function refreshPulses(): Promise<void> {
  try {
    const res = await fetch("/api/pulse", { method: "GET" });
    if (!res.ok) return;
    const data = (await res.json()) as PulseState;
    if (data && typeof data.count === "number") {
      sceneActions.setPulses({
        count: data.count,
        recent: Array.isArray(data.recent) ? data.recent : [],
        persisted: Boolean(data.persisted),
      });
    }
  } catch {
    // best-effort; the count will reconcile on the next load.
  }
}
