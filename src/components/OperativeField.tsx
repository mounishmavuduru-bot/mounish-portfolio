/* eslint-disable react-hooks/set-state-in-effect -- delayed reveal of cavity content after open animation */
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
          className="of-card flex items-start justify-between gap-4"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <span className="font-display text-[var(--bone)] text-base md:text-lg leading-snug">
            {p.name}
          </span>
          <span className="hud-text shrink-0 text-[0.55rem] opacity-75">
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
          className="of-card flex items-center justify-between gap-4"
          style={{ animationDelay: `${i * 90}ms` }}
        >
          <span className="font-display text-[var(--bone)] text-base md:text-lg">
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
    <ul className="space-y-2.5">
      {positions.map((p, i) => (
        <li
          key={i}
          className="of-card flex items-center justify-between gap-4"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <span className="font-display text-[var(--bone)] text-base md:text-lg">
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
  const [contentVisible, setContentVisible] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => setContentVisible(true), 420);
      return () => clearTimeout(t);
    } else {
      setContentVisible(false);
    }
  }, [open]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
      style={{ perspective: "1400px" }}
    >
      {/* Incision opening — cavity that scales from a line */}
      <div
        className="relative pointer-events-auto"
        style={{
          width: "min(760px, 90vw)",
          height: "min(640px, 82vh)",
          transform: open
            ? "scaleY(1) rotateX(8deg)"
            : "scaleY(0.04) rotateX(0deg)",
          transformOrigin: "center center",
          transition:
            "transform 720ms cubic-bezier(.6, 0, .25, 1), opacity 400ms ease",
          transformStyle: "preserve-3d",
          opacity: open ? 1 : 0.6,
        }}
      >
        {/* Tissue cavity rim — irregular organic boundary */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 40%, #5a0f12 0%, #2d0608 60%, #0c0306 100%)",
            borderRadius: "48% 52% 46% 54% / 38% 42% 38% 42%",
            boxShadow:
              "inset 0 0 80px rgba(0,0,0,0.85), inset 0 -10px 30px rgba(255, 70, 70, 0.15), 0 0 120px rgba(180, 30, 35, 0.45)",
            border: "1px solid rgba(220, 80, 90, 0.4)",
          }}
        />

        {/* Wet tissue specular ring */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 65% 18% at 50% 18%, rgba(255, 200, 200, 0.22), transparent 60%)",
            borderRadius: "48% 52% 46% 54% / 38% 42% 38% 42%",
            mixBlendMode: "screen",
          }}
        />

        {/* Surgical site light — strong top-down spot */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 55% 38% at 50% 20%, rgba(255, 248, 220, 0.35), transparent 65%)",
            borderRadius: "48% 52% 46% 54% / 38% 42% 38% 42%",
            mixBlendMode: "screen",
          }}
        />

        {/* Inner darker basin */}
        <div
          className="absolute inset-[6%] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 60%, transparent 30%, rgba(20,5,6,0.6) 80%)",
            borderRadius: "44% 56% 42% 58% / 36% 44% 36% 44%",
          }}
        />

        {/* CONTENT layer — perspective tilted */}
        <div
          className="absolute inset-0 flex flex-col p-10 md:p-12 overflow-y-auto"
          style={{
            opacity: contentVisible ? 1 : 0,
            transform: contentVisible
              ? "translateZ(40px) rotateX(-6deg)"
              : "translateZ(0px) rotateX(0deg)",
            transformOrigin: "50% 30%",
            transition:
              "opacity 500ms ease 100ms, transform 600ms cubic-bezier(.16,.84,.32,1) 100ms",
          }}
        >
          <div className="flex items-start justify-between mb-7 flex-shrink-0">
            <div>
              <p className="hud-text opacity-70">
                ▸ SITE / {site.toUpperCase()}
              </p>
              <h2
                className="font-display text-4xl md:text-5xl mt-2 font-light"
                style={{
                  color: "#fbf6e8",
                  textShadow: "0 0 24px rgba(255, 220, 200, 0.4)",
                }}
              >
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

      {/* Incision line — bright horizontal "cut" that becomes the opening */}
      <div
        className="absolute left-1/2 top-1/2 pointer-events-none"
        style={{
          width: "min(680px, 80vw)",
          height: "2px",
          background:
            "linear-gradient(90deg, transparent 0%, #ff8080 20%, #fff0e0 50%, #ff8080 80%, transparent 100%)",
          boxShadow: "0 0 24px rgba(255, 120, 120, 0.85)",
          transform: "translate(-50%, -50%)",
          opacity: open ? 0 : 1,
          transition: "opacity 300ms ease",
        }}
      />
    </div>
  );
}
