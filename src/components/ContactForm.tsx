"use client";

/**
 * ContactForm — the letter the dots conjoin into (5th "contact" state).
 *
 * Renders only when the scene index === 4. The particles morph into a portrait
 * letter sheet (buildLetterCloud in Specimen); this DOM layer is the sharp
 * letter that condenses out of them. No outer card box — the form IS the sheet
 * area: a centred portrait region matching the particle sheet's aspect, with
 * Spectral text on ruled 1px underlines (no boxed inputs), small mono
 * superscript labels, an oxblood postmark-style send stamp (sharp corners,
 * -2deg), a hairline stamp square top-right echoing the particle stamp, and a
 * quiet mailto line pinned to the sheet's foot.
 *
 * Coalesce: f = clamp(progress - 3, 0, 1) from the scene store. The sheet's
 * opacity is smoothstep(0.55→0.95 of f) and it scales 0.985→1, scrubbed
 * directly by scroll (no easing fight) so reversing scroll dissolves the form
 * back into dots. Rows fade + rise in a 60ms stagger once f > 0.6; the sheet
 * only accepts pointer/keyboard input (pointer-events + inert) once f > 0.8.
 *
 * Submission behavior is unchanged: hidden honeypot ("website"), mount
 * timestamp `t` POSTed for the server's min-fill-time guard, client-side
 * validation mirroring the server, explicit idle → submitting → success |
 * error states, disabled-while-submitting, POST /api/contact.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useScene } from "@/lib/sceneStore";
import { EMAIL } from "@/data/content";

const MONO =
  'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';
const DISPLAY = "var(--font-display), Spectral, Georgia, serif";

const NAME_MAX = 80;
const MSG_MAX = 1000;
// Mirror the server's email check so client + server agree.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "submitting" | "success" | "error";

interface Fields {
  name: string;
  email: string;
  message: string;
}

const EMPTY: Fields = { name: "", email: "", message: "" };

/** Hermite smoothstep of x across [a, b], clamped. */
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export default function ContactForm() {
  const index = useScene((s) => s.index);
  const visible = index === 4;

  // Remount the body whenever the contact state is (re)entered so the mount
  // timestamp + fields reset cleanly and the timing guard measures real fill.
  if (!visible) return null;
  return <LetterSheet />;
}

function LetterSheet() {
  // Continuous morph progress; f scrubs the letter in over the 3→4 morph.
  const progress = useScene((s) => s.progress);
  const f = Math.min(1, Math.max(0, progress - 3));
  const reveal = smoothstep(0.55, 0.95, f);
  const staged = f > 0.6; // rows begin their 60ms stagger
  const interactive = f > 0.8; // pointer + focus only near full coalesce

  const [fields, setFields] = useState<Fields>(EMPTY);
  const [honeypot, setHoneypot] = useState(""); // bots fill this; humans can't see it
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");

  // Form mount time — POSTed so the server can reject too-fast (scripted) fills.
  // Initialised to 0 (pure render) and stamped with the real clock on mount in
  // the effect below, before any submit can fire.
  const mountedAt = useRef<number>(0);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  // Client-side validity (cheap, for inline feedback + button enablement).
  const validity = useMemo(() => {
    const name = fields.name.trim();
    const email = fields.email.trim();
    const message = fields.message.trim();
    return {
      name: name.length <= NAME_MAX,
      email: email.length > 0 && EMAIL_RE.test(email),
      message: message.length >= 1 && message.length <= MSG_MAX,
    };
  }, [fields]);

  const allValid = validity.name && validity.email && validity.message;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;

    if (!allValid) {
      setStatus("error");
      setError("please add a valid email and a message before sending.");
      return;
    }

    setStatus("submitting");
    setError("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fields.name.trim(),
          email: fields.email.trim(),
          message: fields.message.trim(),
          website: honeypot, // honeypot — empty for humans
          t: mountedAt.current,
        }),
      });

      if (res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean }
          | null;
        if (data && data.ok) {
          setStatus("success");
          setFields(EMPTY);
          return;
        }
      }

      // Non-2xx or unexpected body.
      const errData = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      setStatus("error");
      setError(
        (errData && typeof errData.error === "string" && errData.error) ||
          "could not send your message. please try again, or email directly.",
      );
    } catch {
      setStatus("error");
      setError("could not reach the server. please email directly instead.");
    }
  }

  const submitting = status === "submitting";

  return (
    <div style={overlayStyle} role="region" aria-label="contact letter">
      <div
        inert={!interactive}
        style={{
          ...sheetStyle,
          opacity: reveal,
          visibility: reveal > 0.001 ? "visible" : "hidden",
          transform: `scale(${0.985 + 0.015 * reveal})`,
          pointerEvents: interactive ? "auto" : "none",
        }}
      >
        {/* Stamp square — echoes the particle stamp, top-right of the sheet. */}
        <div aria-hidden style={stampStyle}>
          <span style={stampTextStyle}>mm</span>
        </div>

        <div className="cf-row" style={{ ...rowStyle(0, staged), ...headStyle }}>
          <h2 style={titleStyle}>Get in touch</h2>
          <p style={leadStyle}>
            A note finds its way to Mounish. Leave a line and an address to
            reach you.
          </p>
        </div>

        {status === "success" ? (
          <div style={successWrapStyle} role="status">
            <p style={successHeadStyle}>Sent.</p>
            <p style={successBodyStyle}>
              Thank you — your note is on its way. Mounish will reply to the
              address you left.
            </p>
            <button
              type="button"
              className="cf-ghost"
              onClick={() => {
                setStatus("idle");
                setError("");
                mountedAt.current = Date.now();
                requestAnimationFrame(() => firstFieldRef.current?.focus());
              }}
              style={ghostButtonStyle}
            >
              send another
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate style={formStyle}>
            {/* Honeypot — visually hidden, off the tab order, ignored by humans. */}
            <div aria-hidden style={honeypotWrapStyle}>
              <label htmlFor="cf-website">do not fill this field</label>
              <input
                id="cf-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            <Field
              label="name"
              htmlFor="cf-name"
              hint="optional"
              order={1}
              staged={staged}
            >
              <input
                id="cf-name"
                ref={firstFieldRef}
                type="text"
                value={fields.name}
                maxLength={NAME_MAX}
                disabled={submitting}
                autoComplete="name"
                onChange={(e) =>
                  setFields((f0) => ({ ...f0, name: e.target.value }))
                }
                style={inputStyle}
              />
            </Field>

            <Field
              label="email"
              htmlFor="cf-email"
              hint="required"
              order={2}
              staged={staged}
              invalid={status === "error" && !validity.email}
            >
              <input
                id="cf-email"
                type="email"
                inputMode="email"
                value={fields.email}
                maxLength={254}
                required
                disabled={submitting}
                autoComplete="email"
                aria-invalid={status === "error" && !validity.email}
                onChange={(e) =>
                  setFields((f0) => ({ ...f0, email: e.target.value }))
                }
                style={inputStyle}
              />
            </Field>

            <Field
              label="message"
              htmlFor="cf-message"
              hint={`${fields.message.trim().length}/${MSG_MAX}`}
              order={3}
              staged={staged}
              invalid={status === "error" && !validity.message}
            >
              <textarea
                id="cf-message"
                className="cf-rule"
                value={fields.message}
                maxLength={MSG_MAX}
                required
                rows={4}
                disabled={submitting}
                aria-invalid={status === "error" && !validity.message}
                onChange={(e) =>
                  setFields((f0) => ({ ...f0, message: e.target.value }))
                }
                style={textareaStyle}
              />
            </Field>

            {status === "error" && error ? (
              <p role="alert" style={errorStyle}>
                {error}
              </p>
            ) : null}

            <div
              className="cf-row"
              style={{ ...rowStyle(4, staged), ...actionsStyle }}
            >
              <button
                type="submit"
                className="cf-stamp-btn"
                disabled={submitting}
                style={{
                  ...postmarkStyle,
                  opacity: submitting ? 0.6 : 1,
                  cursor: submitting ? "default" : "pointer",
                }}
              >
                {submitting ? "sending…" : "send"}
              </button>
            </div>

            <div
              className="cf-row"
              style={{ ...rowStyle(5, staged), ...footStyle }}
            >
              <a
                href={`mailto:${EMAIL}`}
                style={mailtoStyle}
                className="cf-mailto"
              >
                or email {EMAIL}
              </a>
            </div>
          </form>
        )}
      </div>

      <style>{`
        .cf-row {
          transition: opacity 260ms ease, transform 260ms ease;
        }
        .cf-rule {
          background-image: repeating-linear-gradient(
            to bottom,
            transparent 0,
            transparent 27px,
            var(--line) 27px,
            var(--line) 28px
          );
          background-attachment: local;
        }
        #cf-name:focus-visible,
        #cf-email:focus-visible {
          border-bottom-color: var(--oxblood);
        }
        #cf-message:focus-visible {
          outline: 1px solid var(--oxblood);
          outline-offset: 3px;
        }
        .cf-stamp-btn:focus-visible,
        .cf-ghost:focus-visible,
        .cf-mailto:focus-visible {
          outline: 1px solid var(--oxblood);
          outline-offset: 2px;
        }
        .cf-ghost:hover {
          color: var(--ink);
          border-bottom-color: var(--oxblood);
        }
        .cf-mailto:hover,
        .cf-mailto:focus-visible {
          color: var(--oxblood);
        }
        @media (prefers-reduced-motion: reduce) {
          .cf-row {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row stagger — fields/lines fade + rise 60ms apart once the cloud has mostly
// coalesced (f > 0.6); collapsing removes the delay so the reverse is crisp.
// ---------------------------------------------------------------------------

function rowStyle(order: number, staged: boolean): CSSProperties {
  return {
    opacity: staged ? 1 : 0,
    transform: staged ? "none" : "translateY(6px)",
    transitionDelay: staged ? `${order * 60}ms` : "0ms",
  };
}

// ---------------------------------------------------------------------------
// Field wrapper — mono superscript label + ruled underline control
// ---------------------------------------------------------------------------

function Field({
  label,
  htmlFor,
  hint,
  invalid,
  order,
  staged,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  invalid?: boolean;
  order: number;
  staged: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="cf-row"
      style={{ ...rowStyle(order, staged), marginBottom: 18 }}
    >
      <div style={fieldHeadStyle}>
        <label htmlFor={htmlFor} style={labelStyle}>
          {label}
        </label>
        {hint ? (
          <span
            style={{
              ...hintStyle,
              color: invalid ? "var(--oxblood)" : "var(--sepia)",
            }}
          >
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles (atlas letter: no card box, ruled hairlines, ink/oxblood/sepia,
// Spectral script + mono superscripts, sharp corners only)
// ---------------------------------------------------------------------------

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 45,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
  // The particle sheet sits behind; the overlay itself never eats events.
  pointerEvents: "none",
};

// The sheet — portrait, same aspect as the particle letter, transparent so the
// faded dots remain visible through it. No border: the dots draw the edge.
const sheetStyle: CSSProperties = {
  position: "relative",
  width: "min(420px, calc(100vw - 40px))",
  aspectRatio: "0.72",
  maxHeight: "calc(100vh - 120px)",
  overflowY: "auto",
  background: "transparent",
  border: "none",
  borderRadius: 0,
  padding: "26px 26px 20px",
  display: "flex",
  flexDirection: "column",
};

const headStyle: CSSProperties = {
  // Clear the stamp square at top-right.
  paddingRight: 64,
  marginBottom: 18,
};

const titleStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontWeight: 600,
  fontSize: "1.4rem",
  lineHeight: 1.05,
  color: "var(--ink)",
  margin: "0 0 6px",
};

const leadStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontWeight: 400,
  fontSize: "0.9rem",
  lineHeight: 1.45,
  color: "var(--ink-soft)",
  margin: 0,
};

const formStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
};

const fieldHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  marginBottom: 2,
};

// Mono superscript label, raised small above the ruled line.
const labelStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.55rem",
  letterSpacing: "0.08em",
  textTransform: "lowercase",
  color: "var(--sepia)",
};

const hintStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.55rem",
  letterSpacing: "0.06em",
  textTransform: "lowercase",
};

// Ruled-underline field: Spectral text sitting on a single 1px hairline.
const inputStyle: CSSProperties = {
  width: "100%",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid var(--line)",
  borderRadius: 0,
  padding: "4px 0 6px",
  fontFamily: DISPLAY,
  fontSize: "0.97rem",
  lineHeight: 1.4,
  color: "var(--ink)",
  outline: "none",
  transition: "border-color 150ms linear",
};

// Message area — ruled lines under every written line (repeating hairline),
// echoing the particle sheet's rules. No box.
const textareaStyle: CSSProperties = {
  ...inputStyle,
  borderBottom: "none",
  padding: 0,
  lineHeight: "28px",
  minHeight: 112,
  resize: "vertical",
};

const actionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  marginTop: 4,
};

// The postmark — oxblood stamp, sharp corners, slight cant.
const postmarkStyle: CSSProperties = {
  background: "var(--oxblood)",
  color: "var(--paper)",
  border: "none",
  borderRadius: 0,
  padding: "9px 18px",
  fontFamily: MONO,
  fontSize: "0.62rem",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  transform: "rotate(-2deg)",
  transformOrigin: "center",
};

const footStyle: CSSProperties = {
  marginTop: "auto",
  paddingTop: 16,
};

const mailtoStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.6rem",
  letterSpacing: "0.04em",
  color: "var(--sepia)",
  textDecoration: "none",
  transition: "color 150ms linear",
};

const errorStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.66rem",
  lineHeight: 1.45,
  color: "var(--oxblood)",
  margin: "0 0 10px",
};

const successWrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const successHeadStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontWeight: 600,
  fontSize: "1.1rem",
  color: "var(--ink)",
  margin: 0,
};

const successBodyStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontSize: "0.92rem",
  lineHeight: 1.45,
  color: "var(--ink-soft)",
  margin: "0 0 4px",
};

// "send another" — quiet mono text on a hairline underline (no box).
const ghostButtonStyle: CSSProperties = {
  background: "transparent",
  color: "var(--ink-soft)",
  border: "none",
  borderBottom: "1px solid var(--line)",
  borderRadius: 0,
  padding: "2px 0 3px",
  alignSelf: "flex-start",
  fontFamily: MONO,
  fontSize: "0.62rem",
  letterSpacing: "0.08em",
  textTransform: "lowercase",
  cursor: "pointer",
  transition: "color 150ms linear, border-color 150ms linear",
};

// Hairline stamp square, top-right — the DOM echo of the particle stamp.
const stampStyle: CSSProperties = {
  position: "absolute",
  top: 22,
  right: 26,
  width: 44,
  height: 44,
  border: "1px solid var(--line)",
  borderRadius: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const stampTextStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.55rem",
  letterSpacing: "0.14em",
  textTransform: "lowercase",
  color: "var(--sepia)",
};

// Visually-hidden honeypot: off-screen, zero footprint, not display:none (some
// bots skip display:none fields, but will still fill an off-screen one).
const honeypotWrapStyle: CSSProperties = {
  position: "absolute",
  left: "-9999px",
  width: 1,
  height: 1,
  overflow: "hidden",
};
