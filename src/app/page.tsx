"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import Fluoroscopy from "@/components/Fluoroscopy";
import PointerBridge from "@/components/PointerBridge";
import EkgMonitor from "@/components/EkgMonitor";
import IntroBlock from "@/components/IntroBlock";
import SectionPanel from "@/components/SectionPanel";
import ContactForm from "@/components/ContactForm";
import Chart from "@/components/Chart";
import StateReadout from "@/components/StateReadout";
import PulseButton from "@/components/PulseButton";
import SoundToggle from "@/components/SoundToggle";
import { sceneActions, type PulseState } from "@/lib/sceneStore";

// The particle scene owns the R3F <Canvas> and must never render on the
// server (it touches WebGL / window during init).
const Specimen = dynamic(() => import("@/components/Specimen"), {
  ssr: false,
});

export default function Home() {
  // Record this visit's pulse once on mount: a bare POST that only INCRs the
  // global counter (no body — the logbook is closed) and returns the refreshed
  // state, which seeds the store. Tolerate failure: the store keeps its
  // initial empty state and the UI degrades gracefully.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/pulse", {
          method: "POST",
          cache: "no-store",
        });
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

  // Transparent root: the matte cream gradient (globals.css, on html/body) is
  // the page ground — nothing here may paint an opaque full-viewport fill.
  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Paper texture + whisper-quiet cursor response (was Fluoroscopy). */}
      <Fluoroscopy />
      <PointerBridge />
      <EkgMonitor />
      <Specimen />
      <IntroBlock />
      <SectionPanel />
      {/* Self-gates on useScene index === 4 (contact / envelope state). */}
      <ContactForm />
      {/* Unified medical chart station (replaces the old Console terminal). */}
      <Chart />
      {/* Quiet mono micro-readout of the live scene state, bottom-right. */}
      <StateReadout />
      {/* One-click pulse, fixed bottom-center between chart + state readout. */}
      <PulseButton />
      {/* Heartbeat audio toggle, top-right below the EKG strip. */}
      <SoundToggle />
    </div>
  );
}
