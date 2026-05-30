"use client";

import { useEffect, useState } from "react";

const FULL_NAME = "Mounish Mavuduru";
const SUBLINE = "Prepping for operation.";

export default function IntroScreen({ onEnter }: { onEnter: () => void }) {
  const [typed, setTyped] = useState("");
  const [showSub, setShowSub] = useState(false);
  const [showBtn, setShowBtn] = useState(false);

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTyped(FULL_NAME.slice(0, i));
      if (i >= FULL_NAME.length) {
        clearInterval(id);
        setTimeout(() => setShowSub(true), 380);
        setTimeout(() => setShowBtn(true), 1100);
      }
    }, 95);
    return () => clearInterval(id);
  }, []);

  const handleDrape = () => {
    onEnter();
  };

  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-[#07090a] or-vignette">
      <div className="absolute top-6 left-6 hud-text opacity-60">
        <span className="text-[var(--od-blue)]">●</span> PREP ROOM · 01
      </div>
      <div className="absolute top-6 right-6 hud-text opacity-60">
        OR · 04 / STATUS: STERILE
      </div>

      <div className="text-center px-6">
        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-light tracking-tight text-[var(--bone)]">
          {typed}
          <span className="caret align-middle h-[0.9em]" />
        </h1>

        <p
          className={`mt-8 hud-text transition-opacity duration-700 ${
            showSub ? "opacity-100" : "opacity-0"
          }`}
        >
          {SUBLINE}
        </p>

        <div
          className={`mt-12 transition-opacity duration-700 ${
            showBtn ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <button onClick={handleDrape} className="btn-drape">
            Drape Up
          </button>
          <p className="hud-text mt-4 opacity-40 text-[0.62rem]">
            CLICK TO ENTER OR
          </p>
        </div>
      </div>

      <div className="absolute bottom-6 left-6 hud-text opacity-40">
        SURGEON · M. MAVUDURU
      </div>
      <div className="absolute bottom-6 right-6 hud-text opacity-40">
        EST. CASE TIME · LIFE
      </div>

    </div>
  );
}
