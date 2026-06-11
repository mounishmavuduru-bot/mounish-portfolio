"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

type Mode = "opening" | "closing" | "idle";

/**
 * Transition overlay. 'opening': a 1px bone line draws top-to-bottom,
 * panels snap shut (invisible, black on black), onCovered fires so the
 * page can swap scenes underneath, then the panels part. 'closing'
 * mirrors it: panels slide in to cover, onCovered, the line retracts
 * upward, the overlay fades, onFinished.
 */
export default function Incision({
  mode,
  onCovered,
  onFinished,
}: {
  mode: Mode;
  onCovered: () => void;
  onFinished: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lineRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const onCoveredRef = useRef(onCovered);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onCoveredRef.current = onCovered;
    onFinishedRef.current = onFinished;
  }, [onCovered, onFinished]);

  useEffect(() => {
    if (mode === "idle") return;
    const root = rootRef.current;
    const line = lineRef.current;
    const left = leftRef.current;
    const right = rightRef.current;
    if (!root || !line || !left || !right) return;

    // Guard against double-firing if GSAP replays or the effect re-runs.
    let coveredFired = false;
    let finishedFired = false;
    const fireCovered = () => {
      if (coveredFired) return;
      coveredFired = true;
      onCoveredRef.current();
    };
    const fireFinished = () => {
      if (finishedFired) return;
      finishedFired = true;
      onFinishedRef.current();
    };

    const tl = gsap.timeline();

    if (mode === "opening") {
      tl.set(root, { opacity: 1 });
      tl.set(line, { scaleY: 0, opacity: 1, transformOrigin: "50% 0%" });
      tl.set(left, { xPercent: -100 });
      tl.set(right, { xPercent: 100 });
      // 1. draw the incision line top to bottom
      tl.to(line, { scaleY: 1, duration: 0.32, ease: "power2.in" });
      // 2. snap panels closed — invisible, black on black
      tl.set([left, right], { xPercent: 0 });
      tl.call(fireCovered);
      // 3. brief hold, then part the panels over the new scene
      tl.addLabel("part", "+=0.05");
      tl.to(left, { xPercent: -100, duration: 0.62, ease: "power3.inOut" }, "part");
      tl.to(right, { xPercent: 100, duration: 0.62, ease: "power3.inOut" }, "part");
      tl.to(line, { opacity: 0, duration: 0.3, ease: "power1.out" }, "part");
      tl.call(fireFinished);
    } else {
      tl.set(root, { opacity: 1 });
      tl.set(line, { scaleY: 1, opacity: 0, transformOrigin: "50% 0%" });
      tl.set(left, { xPercent: -100 });
      tl.set(right, { xPercent: 100 });
      // 1. panels slide in to cover the chart
      tl.addLabel("cover");
      tl.to(left, { xPercent: 0, duration: 0.62, ease: "power3.inOut" }, "cover");
      tl.to(right, { xPercent: 0, duration: 0.62, ease: "power3.inOut" }, "cover");
      tl.call(fireCovered);
      // 2. the line appears, then retracts upward
      tl.set(line, { opacity: 1 }, "+=0.05");
      tl.to(line, { scaleY: 0, duration: 0.32, ease: "power2.in" });
      // 3. fade the overlay to reveal the specimen
      tl.to(root, { opacity: 0, duration: 0.25, ease: "power1.out" });
      tl.call(fireFinished);
    }

    return () => {
      tl.kill();
    };
  }, [mode]);

  if (mode === "idle") return null;

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50"
    >
      <div
        ref={leftRef}
        className="absolute inset-y-0 left-0 h-full"
        style={{
          width: "calc(50% + 1px)",
          background: "#070808",
          transform: "translateX(-100%)",
        }}
      />
      <div
        ref={rightRef}
        className="absolute inset-y-0 right-0 h-full"
        style={{
          width: "calc(50% + 1px)",
          background: "#070808",
          transform: "translateX(100%)",
        }}
      />
      <div
        ref={lineRef}
        className="absolute top-0 h-full"
        style={{
          left: "calc(50% - 0.5px)",
          width: "1px",
          background: "var(--bone)",
          transform: "scaleY(0)",
          transformOrigin: "50% 0%",
        }}
      />
    </div>
  );
}
