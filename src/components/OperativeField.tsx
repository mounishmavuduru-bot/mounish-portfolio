/* eslint-disable react-hooks/set-state-in-effect -- delayed reveal of content after camera zoom */
"use client";

import { useEffect, useState } from "react";
import {
  Site,
  projects,
  awards,
  positions,
  siteLabels,
} from "@/data/content";

function ProjectsList() {
  return (
    <ul className="space-y-2.5">
      {projects.map((p, i) => (
        <li
          key={i}
          className="flex items-start justify-between gap-4 px-4 py-3 rounded-md border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <span className="font-display text-[var(--bone)] text-base md:text-lg leading-snug">
            {p.name}
          </span>
          <span className="hud-text shrink-0 text-[0.55rem] opacity-70">
            {p.tag}
          </span>
        </li>
      ))}
    </ul>
  );
}

function AwardsList() {
  return (
    <ul className="space-y-2.5">
      {awards.map((a, i) => (
        <li
          key={i}
          className="flex items-center justify-between gap-4 px-4 py-3 rounded-md border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
          style={{ animationDelay: `${i * 90}ms` }}
        >
          <span className="font-display text-[var(--bone)] text-base md:text-lg">
            {a.name}
          </span>
          <span className="hud-text text-[0.6rem] opacity-70">{a.org}</span>
        </li>
      ))}
    </ul>
  );
}

function PositionsList() {
  return (
    <ul className="space-y-2.5">
      {positions.map((p, i) => (
        <li
          key={i}
          className="flex items-center justify-between gap-4 px-4 py-3 rounded-md border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <span className="font-display text-[var(--bone)] text-base md:text-lg">
            {p.role}
          </span>
          {p.org && (
            <span className="hud-text text-[0.6rem] opacity-70">{p.org}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function SectionContent({ site }: { site: Site }) {
  if (site === "projects") return <ProjectsList />;
  if (site === "achievements") return <AwardsList />;
  return <PositionsList />;
}

function SutureIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 12 H21"
        stroke="#cdf2f6"
        strokeWidth="1.2"
        strokeDasharray="3 2.5"
      />
      <path d="M5 8 L8 12 L5 16" stroke="#cdf2f6" strokeWidth="1.1" fill="none" />
      <path
        d="M19 8 L16 12 L19 16"
        stroke="#cdf2f6"
        strokeWidth="1.1"
        fill="none"
      />
    </svg>
  );
}

export default function OperativeField({
  site,
  open,
  onClose,
}: {
  site: Site;
  open: boolean;
  onClose: () => void;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => setShow(true), 80);
      return () => clearTimeout(t);
    } else {
      setShow(false);
    }
  }, [open]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
      <div
        className="liquid-glass pointer-events-auto flex flex-col p-8 md:p-10 overflow-y-auto"
        style={{
          width: "min(640px, 88vw)",
          maxHeight: "82vh",
          opacity: show ? 1 : 0,
          transform: show ? "scale(1) translateY(0)" : "scale(0.94) translateY(20px)",
          transition:
            "opacity 420ms cubic-bezier(.16,.84,.32,1), transform 480ms cubic-bezier(.16,.84,.32,1)",
        }}
      >
        <div className="flex items-start justify-between mb-7 flex-shrink-0">
          <div>
            <p
              className="font-mono opacity-65"
              style={{
                fontSize: "0.66rem",
                letterSpacing: "0.26em",
                textTransform: "uppercase",
                color: "color-mix(in oklab, var(--od-blue) 75%, white)",
              }}
            >
              ▸ SITE / {site.toUpperCase()}
            </p>
            <h2
              className="font-display text-4xl md:text-5xl mt-2 font-light"
              style={{
                color: "#fbf6e8",
              }}
            >
              {siteLabels[site]}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="group flex items-center gap-2 font-mono opacity-80 hover:opacity-100"
            style={{
              fontSize: "0.66rem",
              letterSpacing: "0.26em",
              textTransform: "uppercase",
              color: "color-mix(in oklab, var(--od-blue) 75%, white)",
            }}
            title="Close (Esc)"
          >
            <SutureIcon />
            <span>SUTURE</span>
          </button>
        </div>

        <div className="flex-1">
          <SectionContent site={site} />
        </div>

        <p
          className="font-mono opacity-40 mt-6"
          style={{
            fontSize: "0.55rem",
            letterSpacing: "0.26em",
            textTransform: "uppercase",
            color: "color-mix(in oklab, var(--od-blue) 75%, white)",
          }}
        >
          ESC OR SUTURE TO CLOSE
        </p>
      </div>
    </div>
  );
}
