"use client";

import { useEffect } from "react";
import {
  Site,
  projects,
  awards,
  positions,
  siteLabels,
} from "@/data/content";

function ProjectsList() {
  return (
    <ul className="space-y-3">
      {projects.map((p, i) => (
        <li
          key={i}
          className="border border-[#7a2a2d]/50 bg-gradient-to-b from-[#3a0b0e]/70 to-[#1a0608]/40 rounded-sm px-4 py-3 backdrop-blur-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="text-[var(--bone)] text-sm md:text-base leading-snug font-display">
              {p.name}
            </span>
            <span className="hud-text shrink-0 text-[0.55rem] opacity-70">
              {p.tag}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AwardsList() {
  return (
    <ul className="divide-y divide-[#7a2a2d]/40 border border-[#7a2a2d]/50 rounded-sm bg-gradient-to-b from-[#3a0b0e]/70 to-[#1a0608]/40 backdrop-blur-sm">
      {awards.map((a, i) => (
        <li key={i} className="flex items-center justify-between px-4 py-3">
          <span className="font-display text-[var(--bone)] text-sm md:text-base">
            {a.name}
          </span>
          <span className="hud-text text-[0.6rem] opacity-75">{a.org}</span>
        </li>
      ))}
    </ul>
  );
}

function PositionsList() {
  return (
    <ul className="space-y-2">
      {positions.map((p, i) => (
        <li
          key={i}
          className="flex items-center justify-between gap-3 px-4 py-3 border border-[#7a2a2d]/50 bg-gradient-to-b from-[#3a0b0e]/70 to-[#1a0608]/40 rounded-sm backdrop-blur-sm"
        >
          <span className="font-display text-[var(--bone)] text-sm md:text-base">
            {p.role}
          </span>
          {p.org && (
            <span className="hud-text text-[0.6rem] opacity-75">{p.org}</span>
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
      {/* Incision opening — two flaps */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-700"
        style={{
          width: open ? "min(720px, 88vw)" : "10px",
          height: open ? "min(620px, 78vh)" : "10px",
          opacity: open ? 1 : 0,
        }}
      >
        {/* Tissue cavity backdrop */}
        <div
          className="absolute inset-0 rounded-[40%/30%]"
          style={{
            background:
              "radial-gradient(ellipse at 50% 35%, #6a1418 0%, #380a0d 55%, #14060a 100%)",
            boxShadow:
              "inset 0 0 60px rgba(0,0,0,0.85), inset 0 0 20px rgba(255, 100, 100, 0.25), 0 0 80px rgba(255, 50, 60, 0.35)",
            border: "1px solid rgba(220, 80, 90, 0.35)",
          }}
        />

        {/* Surgical site light */}
        <div
          className="absolute inset-0 rounded-[40%/30%] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 45% at 50% 20%, rgba(255, 245, 220, 0.18), transparent 60%)",
            mixBlendMode: "screen",
          }}
        />

        {/* Content card */}
        <div className="absolute inset-0 flex flex-col p-8 md:p-10 pointer-events-auto overflow-y-auto">
          <div className="flex items-start justify-between mb-6 flex-shrink-0">
            <div>
              <p className="hud-text opacity-70">
                ▸ INCISION OPEN · SITE / {site.toUpperCase()}
              </p>
              <h2 className="font-display text-3xl md:text-5xl mt-1 text-[var(--bone)] font-light">
                {siteLabels[site]}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="group flex items-center gap-2 hud-text opacity-80 hover:opacity-100"
              title="Suture closed (Esc)"
            >
              <SutureIcon />
              <span>SUTURE</span>
            </button>
          </div>

          <div className="flex-1">
            <SectionContent site={site} />
          </div>

          <p className="hud-text opacity-40 mt-6 text-[0.55rem]">
            ESC OR SUTURE TO CLOSE
          </p>
        </div>
      </div>
    </div>
  );
}
