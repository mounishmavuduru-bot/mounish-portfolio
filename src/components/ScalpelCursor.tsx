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
        width="74"
        height="74"
        viewBox="0 0 100 100"
        style={{
          transform: "translate(-6px, -4px) rotate(-18deg)",
          filter: moving
            ? "drop-shadow(0 0 10px rgba(158,230,238,0.55)) drop-shadow(0 2px 4px rgba(0,0,0,0.75))"
            : "drop-shadow(0 2px 4px rgba(0,0,0,0.85))",
          transition: "filter 220ms ease",
        }}
      >
        <defs>
          <linearGradient id="bladeFace" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fbfdfd" />
            <stop offset="35%" stopColor="#d6dde0" />
            <stop offset="70%" stopColor="#9aa3a6" />
            <stop offset="100%" stopColor="#6c7477" />
          </linearGradient>
          <linearGradient id="bladeEdge" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#e7eef0" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#cfd6d8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="collarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#d4dbde" />
            <stop offset="50%" stopColor="#7d8588" />
            <stop offset="100%" stopColor="#4b5255" />
          </linearGradient>
          <linearGradient id="handleGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#a3acb0" />
            <stop offset="30%" stopColor="#5e676b" />
            <stop offset="70%" stopColor="#363c3e" />
            <stop offset="100%" stopColor="#1d2123" />
          </linearGradient>
          <pattern
            id="knurl"
            patternUnits="userSpaceOnUse"
            width="2.6"
            height="2.6"
            patternTransform="rotate(45)"
          >
            <rect width="2.6" height="2.6" fill="#393f42" />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="2.6"
              stroke="#1c2022"
              strokeWidth="0.7"
            />
            <line
              x1="1.3"
              y1="0"
              x2="1.3"
              y2="2.6"
              stroke="#5a6266"
              strokeWidth="0.4"
            />
          </pattern>
        </defs>

        {/* ============ BLADE (#10 belly curve, sharp tip at top-left) ============ */}
        {/* blade body */}
        <path
          d="
            M 8 22
            Q 18 16, 32 21
            Q 40 23, 44 26
            L 41 30
            Q 30 27, 18 27
            Q 12 27, 8 22
            Z
          "
          fill="url(#bladeFace)"
          stroke="#5a6266"
          strokeWidth="0.4"
        />
        {/* spine highlight */}
        <path
          d="M 9 22 Q 22 17, 42 26"
          fill="none"
          stroke="url(#bladeEdge)"
          strokeWidth="0.9"
          strokeLinecap="round"
        />
        {/* cutting edge — thin bright line */}
        <path
          d="M 9 22 Q 22 28, 42 27.5"
          fill="none"
          stroke="#ffffff"
          strokeWidth="0.55"
          strokeOpacity="0.85"
          strokeLinecap="round"
        />
        {/* numeric stamp on blade */}
        <text
          x="22"
          y="25.5"
          fontFamily="ui-monospace, monospace"
          fontSize="2.6"
          fill="#42494c"
          fontWeight="600"
        >
          10
        </text>

        {/* ============ COLLAR / JUNCTION ============ */}
        <path
          d="M 41 26 L 51 32 L 50 36 L 40 30 Z"
          fill="url(#collarGrad)"
          stroke="#2c3134"
          strokeWidth="0.35"
        />
        {/* collar ring detail */}
        <line
          x1="44"
          y1="28"
          x2="48"
          y2="34.5"
          stroke="#cdd3d6"
          strokeWidth="0.35"
          opacity="0.8"
        />

        {/* ============ HANDLE (tapered + knurled grip) ============ */}
        {/* main handle bar (slightly tapered toward butt) */}
        <path
          d="
            M 50 32
            L 88 56
            L 86 60
            L 48 36
            Z
          "
          fill="url(#handleGrad)"
          stroke="#1a1d1f"
          strokeWidth="0.35"
        />

        {/* knurled grip — diagonal cross-hatch section */}
        <g
          transform="rotate(32 65 46)"
          style={{ mixBlendMode: "multiply" as React.CSSProperties["mixBlendMode"] }}
        >
          <rect
            x="55"
            y="42"
            width="22"
            height="6"
            fill="url(#knurl)"
            opacity="0.95"
          />
        </g>
        {/* edge highlights on handle */}
        <line
          x1="50"
          y1="32.3"
          x2="88"
          y2="56.3"
          stroke="#cdd3d6"
          strokeWidth="0.45"
          opacity="0.5"
        />
        <line
          x1="49"
          y1="35.5"
          x2="86.5"
          y2="59.5"
          stroke="#000"
          strokeWidth="0.35"
          opacity="0.6"
        />

        {/* butt end cap */}
        <path
          d="M 86 56 L 90 58 L 89 62 L 85 60 Z"
          fill="#2a2e30"
          stroke="#0e1011"
          strokeWidth="0.35"
        />

        {/* gleam line that animates */}
        {moving && (
          <line
            x1="10"
            y1="20"
            x2="44"
            y2="24"
            stroke="#ffffff"
            strokeWidth="0.4"
            opacity="0.9"
          >
            <animate
              attributeName="opacity"
              values="0;0.9;0"
              dur="600ms"
              repeatCount="indefinite"
            />
          </line>
        )}
      </svg>
    </div>
  );
}
