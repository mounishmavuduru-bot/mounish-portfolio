"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import Chart from "@/components/Chart";
import Incision from "@/components/Incision";

const Specimen = dynamic(() => import("@/components/Specimen"), {
  ssr: false,
});

type Phase = "specimen" | "opening" | "chart" | "closing";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("specimen");
  // True once the Incision panels fully cover the screen — the moment
  // it is safe to swap which scene renders underneath.
  const [covered, setCovered] = useState(false);

  const handleEnter = useCallback(() => {
    setPhase((p) => (p === "specimen" ? "opening" : p));
  }, []);

  const handleClose = useCallback(() => {
    setPhase((p) => (p === "chart" ? "closing" : p));
  }, []);

  const handleCovered = useCallback(() => {
    setCovered(true);
  }, []);

  const handleFinished = useCallback(() => {
    setPhase((p) => {
      if (p === "opening") return "chart";
      if (p === "closing") return "specimen";
      return p;
    });
    setCovered(false);
  }, []);

  const showChart =
    phase === "chart" ||
    (phase === "opening" && covered) ||
    (phase === "closing" && !covered);

  const incisionMode =
    phase === "opening" ? "opening" : phase === "closing" ? "closing" : "idle";

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#070808]">
      {showChart ? (
        <Chart onClose={handleClose} />
      ) : (
        <Specimen onEnter={handleEnter} />
      )}
      <Incision
        mode={incisionMode}
        onCovered={handleCovered}
        onFinished={handleFinished}
      />
    </div>
  );
}
