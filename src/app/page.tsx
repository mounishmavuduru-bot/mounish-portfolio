"use client";

import dynamic from "next/dynamic";
import Fluoroscopy from "@/components/Fluoroscopy";

const Specimen = dynamic(() => import("@/components/Specimen"), {
  ssr: false,
});

export default function Home() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#070808]">
      <Fluoroscopy />
      <Specimen />
    </div>
  );
}
