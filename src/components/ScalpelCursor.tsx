"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const MQ = "(hover: hover) and (pointer: fine)";

function subscribeFineHover(cb: () => void) {
  const mq = window.matchMedia(MQ);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getFineHover() {
  return window.matchMedia(MQ).matches;
}

function getFineHoverServer() {
  return false;
}

export default function ScalpelCursor() {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = useSyncExternalStore(
    subscribeFineHover,
    getFineHover,
    getFineHoverServer,
  );
  const lastMove = useRef(0);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      el.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      lastMove.current = performance.now();
      if (!moving) setMoving(true);
    };

    const idle = setInterval(() => {
      if (performance.now() - lastMove.current > 220 && moving) {
        setMoving(false);
      }
    }, 100);

    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      clearInterval(idle);
    };
  }, [enabled, moving]);

  if (!enabled) return null;

  return (
    <div
      ref={ref}
      className="fixed left-0 top-0 z-[100] pointer-events-none"
      style={{ willChange: "transform" }}
    >
      <svg
        width="34"
        height="34"
        viewBox="0 0 34 34"
        style={{
          transform: "translate(-2px, -2px) rotate(-22deg)",
          filter: moving
            ? "drop-shadow(0 0 6px rgba(158, 230, 238, 0.7))"
            : "drop-shadow(0 1px 2px rgba(0,0,0,0.8))",
          transition: "filter 180ms ease",
        }}
      >
        {/* blade */}
        <path
          d="M 4 4 L 22 14 L 18 18 L 4 4 Z"
          fill="url(#bladeGrad)"
          stroke="#dfeef0"
          strokeWidth="0.6"
        />
        {/* blade gleam */}
        <path
          d="M 4 4 L 22 14"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth="0.5"
          fill="none"
        />
        {/* handle */}
        <rect
          x="18"
          y="18"
          width="14"
          height="3.4"
          rx="1"
          transform="rotate(45 18 18)"
          fill="#262b2d"
          stroke="#404849"
          strokeWidth="0.4"
        />
        {/* handle grooves */}
        <g transform="rotate(45 18 18)">
          <line x1="22" y1="18" x2="22" y2="21.4" stroke="#555f60" strokeWidth="0.3" />
          <line x1="24" y1="18" x2="24" y2="21.4" stroke="#555f60" strokeWidth="0.3" />
          <line x1="26" y1="18" x2="26" y2="21.4" stroke="#555f60" strokeWidth="0.3" />
          <line x1="28" y1="18" x2="28" y2="21.4" stroke="#555f60" strokeWidth="0.3" />
        </g>
        <defs>
          <linearGradient id="bladeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f4f8f8" />
            <stop offset="55%" stopColor="#bcc8c9" />
            <stop offset="100%" stopColor="#7c8788" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
