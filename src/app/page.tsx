"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import Fluoroscopy from "@/components/Fluoroscopy";
import PointerBridge from "@/components/PointerBridge";
import EkgMonitor from "@/components/EkgMonitor";
import IntroBlock from "@/components/IntroBlock";
import SectionPanel from "@/components/SectionPanel";
import Console from "@/components/Console";
import { sceneActions, type PulseState } from "@/lib/sceneStore";

// The particle scene owns the R3F <Canvas> and must never render on the
// server (it touches WebGL / window during init).
const Specimen = dynamic(() => import("@/components/Specimen"), {
  ssr: false,
});

export default function Home() {
  // Seed the global pulse counter once on mount. Tolerate failure: the store
  // keeps its initial empty state and the UI degrades gracefully.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/pulse", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as PulseState;
        if (!cancelled && data && typeof data.count === "number") {
          sceneActions.setPulses(data);
        }
      } catch {
        // network/parse failure — leave the initial pulse state untouched
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#070808]">
      <Fluoroscopy />
      <PointerBridge />
      <EkgMonitor />
      <Specimen />
      <IntroBlock />
      <SectionPanel />
      <Console />
    </div>
  );
}
