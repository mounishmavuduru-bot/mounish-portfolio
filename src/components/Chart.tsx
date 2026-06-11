"use client";

import { useEffect, useState } from "react";
import EcgTrace from "./EcgTrace";
import {
  GITHUB,
  LINKEDIN,
  EMAIL,
  TAGLINE,
  projects,
  positions,
  awards,
} from "@/data/content";

const BONE = "#e8e3d8";
const GREEN = "#36c97c";
const HAIRLINE = "rgba(232, 227, 216, 0.08)";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, monospace';
const DISPLAY = "var(--font-display), Fraunces, Georgia, serif";

type Lead = "projects" | "positions" | "awards";

const LEADS: { id: Lead; label: string }[] = [
  { id: "projects", label: "Lead I — projects" },
  { id: "positions", label: "Lead II — positions" },
  { id: "awards", label: "Lead III — awards" },
];

const CONTACTS: { label: string; href: string; external: boolean }[] = [
  { label: "github", href: GITHUB, external: true },
  { label: "linkedin", href: LINKEDIN, external: true },
  { label: "email", href: `mailto:${EMAIL}`, external: false },
];

function rowsFor(lead: Lead): { primary: string; meta: string }[] {
  if (lead === "projects") {
    return projects.map((p) => ({ primary: p.name, meta: p.tag }));
  }
  if (lead === "positions") {
    return positions.map((p) => ({ primary: p.role, meta: p.org }));
  }
  return awards.map((a) => ({ primary: a.name, meta: a.org }));
}

export default function Chart({ onClose }: { onClose: () => void }) {
  const [lead, setLead] = useState<Lead>("projects");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = rowsFor(lead);

  return (
    <div
      className="absolute inset-0 overflow-y-auto bg-[#070808]"
      style={{ fontFamily: MONO, color: BONE }}
    >
      <style>{`
        @keyframes chartRowsFade { from { opacity: 0 } to { opacity: 1 } }
        .chart-focus:focus-visible { outline: 1px solid ${GREEN}; outline-offset: 2px; }
      `}</style>

      <div style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
        <EcgTrace height={88} />
      </div>

      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-x-14 gap-y-12 px-6 py-10 md:grid-cols-[38fr_62fr] md:px-10 md:py-14">
        {/* Left — patient block */}
        <div className="flex flex-col items-start">
          <p
            className="uppercase"
            style={{
              fontSize: "0.62rem",
              letterSpacing: "0.22em",
              color: "rgba(232, 227, 216, 0.4)",
            }}
          >
            patient
          </p>

          <h1
            className="mt-3 leading-[1.05]"
            style={{
              fontFamily: DISPLAY,
              fontSize: "clamp(2rem, 4.5vw, 3.2rem)",
              color: BONE,
            }}
          >
            Mavuduru, Mounish
          </h1>

          <p
            className="mt-4"
            style={{ fontSize: "0.8rem", color: "rgba(232, 227, 216, 0.6)" }}
          >
            {TAGLINE}
          </p>

          <div className="mt-8 w-full">
            {CONTACTS.map((c) => (
              <a
                key={c.label}
                href={c.href}
                {...(c.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="chart-focus block w-full py-[10px] text-[rgba(232,227,216,0.7)] underline underline-offset-[3px] transition-colors duration-150 hover:text-[#36c97c]"
                style={{
                  fontSize: "0.78rem",
                  borderBottom: `1px solid ${HAIRLINE}`,
                  borderRadius: 0,
                }}
              >
                {c.label}
              </a>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="chart-focus mt-12 border border-solid border-[rgba(232,227,216,0.25)] lowercase text-[rgba(232,227,216,0.7)] transition-colors duration-150 hover:border-[#36c97c] hover:text-[#36c97c]"
            style={{
              fontFamily: MONO,
              fontSize: "0.72rem",
              letterSpacing: "0.06em",
              padding: "8px 14px",
              borderRadius: 2,
              background: "transparent",
            }}
          >
            close incision
          </button>
        </div>

        {/* Right — leads */}
        <div>
          <div
            role="tablist"
            aria-label="Chart sections"
            className="flex flex-wrap gap-x-7 gap-y-2"
            style={{ borderBottom: `1px solid ${HAIRLINE}` }}
          >
            {LEADS.map((l) => {
              const active = l.id === lead;
              return (
                <button
                  key={l.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setLead(l.id)}
                  className={`chart-focus -mb-px pb-[9px] transition-colors duration-150 ${
                    active
                      ? "text-[#36c97c]"
                      : "text-[rgba(232,227,216,0.45)] hover:text-[rgba(232,227,216,0.7)]"
                  }`}
                  style={{
                    fontFamily: MONO,
                    fontSize: "0.72rem",
                    letterSpacing: "0.04em",
                    background: "transparent",
                    border: "none",
                    borderBottom: active
                      ? `1px solid ${GREEN}`
                      : "1px solid transparent",
                    borderRadius: 0,
                  }}
                >
                  {l.label}
                </button>
              );
            })}
          </div>

          <div key={lead} style={{ animation: "chartRowsFade 120ms ease-out" }}>
            {rows.map((row) => (
              <div
                key={row.primary}
                className="group flex items-baseline justify-between gap-6"
                style={{
                  padding: "14px 2px",
                  borderBottom: `1px solid ${HAIRLINE}`,
                  borderRadius: 0,
                }}
              >
                <span
                  className="text-[#e8e3d8] transition-colors duration-150 group-hover:text-[#36c97c]"
                  style={{
                    fontFamily: DISPLAY,
                    fontSize: "clamp(1.05rem, 1.4vw, 1.25rem)",
                    lineHeight: 1.3,
                  }}
                >
                  {row.primary}
                </span>
                {row.meta ? (
                  <span
                    className="shrink-0 text-right"
                    style={{
                      fontSize: "0.66rem",
                      letterSpacing: "0.05em",
                      color: "rgba(232, 227, 216, 0.45)",
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
    </div>
  );
}
