"use client";

/**
 * ContactForm — the overlay for the 5th "contact" state.
 *
 * Renders only when the scene index === 4 (the envelope-shape state). An atlas
 * card with name / email / message fields, a hidden honeypot ("website"), and a
 * min-fill-time guard (the mount timestamp `t` is POSTed alongside; the server
 * rejects submissions faster than its threshold). Client-side validation runs
 * first so the user gets immediate feedback; the server re-validates.
 *
 * States are explicit: idle → submitting → success | error. The submit button
 * is disabled while submitting. A direct mailto link is always offered as a
 * fallback. Atlas styling throughout: paper card, ink text, oxblood submit,
 * Spectral labels, mono meta, sharp corners, hairline borders. No glass/glow.
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

export default function ContactForm() {
  const index = useScene((s) => s.index);
  const visible = index === 4;

  // Remount the body whenever the contact state is (re)entered so the mount
  // timestamp + fields reset cleanly and the timing guard measures real fill.
  if (!visible) return null;
  return <ContactCard />;
}

function ContactCard() {
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
    <div style={overlayStyle} role="region" aria-label="contact form">
      <div style={cardStyle}>
        <h2 style={titleStyle}>Get in touch</h2>
        <p style={leadStyle}>
          A note finds its way to Mounish. Leave a line and an address to reach
          you.
        </p>

        {status === "success" ? (
          <div style={successWrapStyle} role="status">
            <p style={successHeadStyle}>Sent.</p>
            <p style={successBodyStyle}>
              Thank you — your note is on its way. Mounish will reply to the
              address you left.
            </p>
            <button
              type="button"
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
          <form onSubmit={onSubmit} noValidate>
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

            <Field label="Name" htmlFor="cf-name" hint="optional">
              <input
                id="cf-name"
                ref={firstFieldRef}
                type="text"
                value={fields.name}
                maxLength={NAME_MAX}
                disabled={submitting}
                autoComplete="name"
                onChange={(e) =>
                  setFields((f) => ({ ...f, name: e.target.value }))
                }
                style={inputStyle}
              />
            </Field>

            <Field
              label="Email"
              htmlFor="cf-email"
              hint="required"
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
                  setFields((f) => ({ ...f, email: e.target.value }))
                }
                style={inputStyle}
              />
            </Field>

            <Field
              label="Message"
              htmlFor="cf-message"
              hint={`${fields.message.trim().length}/${MSG_MAX}`}
              invalid={status === "error" && !validity.message}
            >
              <textarea
                id="cf-message"
                value={fields.message}
                maxLength={MSG_MAX}
                required
                rows={4}
                disabled={submitting}
                aria-invalid={status === "error" && !validity.message}
                onChange={(e) =>
                  setFields((f) => ({ ...f, message: e.target.value }))
                }
                style={{ ...inputStyle, resize: "vertical", minHeight: 84 }}
              />
            </Field>

            {status === "error" && error ? (
              <p role="alert" style={errorStyle}>
                {error}
              </p>
            ) : null}

            <div style={actionsStyle}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  ...submitButtonStyle,
                  opacity: submitting ? 0.6 : 1,
                  cursor: submitting ? "default" : "pointer",
                }}
              >
                {submitting ? "sending…" : "send"}
              </button>
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
        #cf-name:focus-visible,
        #cf-email:focus-visible,
        #cf-message:focus-visible {
          border-color: var(--oxblood);
        }
        .cf-mailto:hover,
        .cf-mailto:focus-visible { color: var(--oxblood); }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field wrapper
// ---------------------------------------------------------------------------

function Field({
  label,
  htmlFor,
  hint,
  invalid,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
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
// Styles (atlas: paper card, ink, oxblood, Spectral + mono, sharp, hairline)
// ---------------------------------------------------------------------------

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 45,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
  // The 3D envelope sits behind; let pointer events pass except over the card.
  pointerEvents: "none",
};

const cardStyle: CSSProperties = {
  pointerEvents: "auto",
  width: "min(420px, calc(100vw - 32px))",
  maxHeight: "calc(100vh - 96px)",
  overflowY: "auto",
  background: "var(--paper-2)",
  border: "1px solid var(--line)",
  borderRadius: "2px",
  padding: "20px 20px 18px",
  boxShadow: "0 1px 0 rgba(26,23,20,0.06)",
};

const titleStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontWeight: 600,
  fontSize: "1.5rem",
  lineHeight: 1.05,
  color: "var(--ink)",
  margin: "0 0 4px",
};

const leadStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontWeight: 400,
  fontSize: "0.92rem",
  lineHeight: 1.45,
  color: "var(--ink-soft)",
  margin: "0 0 16px",
};

const fieldHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  marginBottom: 4,
};

const labelStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontWeight: 500,
  fontSize: "0.86rem",
  color: "var(--ink)",
};

const hintStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.58rem",
  letterSpacing: "0.06em",
  textTransform: "lowercase",
};

const inputStyle: CSSProperties = {
  width: "100%",
  background: "var(--paper)",
  border: "1px solid var(--line)",
  borderRadius: "2px",
  padding: "8px 10px",
  fontFamily: DISPLAY,
  fontSize: "0.94rem",
  lineHeight: 1.4,
  color: "var(--ink)",
  outline: "none",
  transition: "border-color 150ms linear",
};

const actionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "12px",
  marginTop: 6,
};

const submitButtonStyle: CSSProperties = {
  background: "var(--oxblood)",
  color: "var(--paper)",
  border: "1px solid var(--oxblood)",
  borderRadius: "2px",
  padding: "8px 18px",
  fontFamily: MONO,
  fontSize: "0.66rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const ghostButtonStyle: CSSProperties = {
  background: "transparent",
  color: "var(--ink-soft)",
  border: "1px solid var(--line)",
  borderRadius: "2px",
  padding: "7px 14px",
  fontFamily: MONO,
  fontSize: "0.62rem",
  letterSpacing: "0.08em",
  textTransform: "lowercase",
  cursor: "pointer",
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

// Visually-hidden honeypot: off-screen, zero footprint, not display:none (some
// bots skip display:none fields, but will still fill an off-screen one).
const honeypotWrapStyle: CSSProperties = {
  position: "absolute",
  left: "-9999px",
  width: 1,
  height: 1,
  overflow: "hidden",
};
