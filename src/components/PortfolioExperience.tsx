"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import IntroScreen from "./IntroScreen";
import ScalpelCursor from "./ScalpelCursor";

const OperatingRoom = dynamic(() => import("./OperatingRoom"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-[#07090a]">
      <p className="hud-text opacity-60">PREPARING OR …</p>
    </div>
  ),
});

export default function PortfolioExperience() {
  const [entered, setEntered] = useState(false);

  return (
    <>
      <ScalpelCursor />
      {!entered ? (
        <IntroScreen onEnter={() => setEntered(true)} />
      ) : (
        <OperatingRoom />
      )}
    </>
  );
}
