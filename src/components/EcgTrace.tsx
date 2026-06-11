"use client";

import { useEffect, useRef, useState } from "react";

const SPEED = 110; // css px per second, right-to-left
const BEAT_MS = 937; // ~64 bpm
const GREEN = "#36c97c";
const BLACK = "#070808";
const DECAY = "rgba(7, 8, 8, 0.085)";
const CALIPER_GAP = 80; // css px between the two caliper lines
const DELTA_MS = Math.round((CALIPER_GAP / SPEED) * 1000);

/** Synthetic PQRST as a function of beat phase [0,1). Returns relative amplitude. */
function pqrst(phase: number): number {
  const bump = (center: number, width: number) => {
    const d = (phase - center) / width;
    return Math.exp(-d * d);
  };
  return (
    0.12 * bump(0.16, 0.035) - // P wave
    0.09 * bump(0.247, 0.011) + // Q dip
    1.0 * bump(0.27, 0.013) - // R spike
    0.24 * bump(0.293, 0.012) + // S dip
    0.26 * bump(0.46, 0.05) // T wave
  );
}

export default function EcgTrace({ height = 90 }: { height?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [caliperX, setCaliperX] = useState<number | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = false;
    let lastTs = 0;
    let dpr = 1;
    let scrollCarry = 0; // fractional device px not yet scrolled
    let waveMs = 0; // accumulated waveform time

    const resize = () => {
      dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
      canvas.width = Math.max(1, Math.round(wrap.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.fillStyle = BLACK;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      if (lastTs === 0) {
        lastTs = ts;
        return;
      }
      let dt = (ts - lastTs) / 1000;
      lastTs = ts;
      if (dt > 0.05) dt = 0.05;

      const w = canvas.width;
      const h = canvas.height;

      waveMs += dt * 1000;
      scrollCarry += SPEED * dpr * dt;
      const shift = Math.floor(scrollCarry);
      if (shift <= 0) return; // sub-pixel frame, scroll next time
      scrollCarry -= shift;

      // Scroll existing phosphor left by whole device pixels (keeps trail crisp)
      ctx.drawImage(canvas, -shift, 0);
      ctx.fillStyle = BLACK;
      ctx.fillRect(w - shift, 0, shift, h);

      // Phosphor decay: fade everything toward background instead of clearing
      ctx.fillStyle = DECAY;
      ctx.fillRect(0, 0, w, h);

      // Draw only the newest segment at the right edge
      const msPerDevPx = 1000 / (SPEED * dpr);
      const baseline = h * 0.62;
      const amp = h * 0.4;
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 1.5 * dpr;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = shift; i >= 0; i--) {
        const x = w - 1 - i;
        const t = waveMs - i * msPerDevPx;
        const phase = (((t % BEAT_MS) + BEAT_MS) % BEAT_MS) / BEAT_MS;
        const y = baseline - pqrst(phase) * amp;
        if (i === shift) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    const start = () => {
      if (running) return;
      running = true;
      lastTs = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();

    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [height]);

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden"
      style={{ height }}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setCaliperX(e.clientX - rect.left);
      }}
      onPointerLeave={() => setCaliperX(null)}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
      />
      {caliperX !== null && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px"
            style={{ left: caliperX, background: "rgba(232, 227, 216, 0.6)" }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px"
            style={{
              left: caliperX - CALIPER_GAP,
              background: "rgba(232, 227, 216, 0.6)",
            }}
          />
          <span
            className="pointer-events-none absolute top-[6px] whitespace-nowrap"
            style={{
              left: caliperX + 8,
              fontFamily: 'var(--font-mono), "IBM Plex Mono", ui-monospace, monospace',
              fontSize: "0.62rem",
              letterSpacing: "0.08em",
              color: "rgba(232, 227, 216, 0.7)",
            }}
          >
            delta {DELTA_MS} ms
          </span>
        </>
      )}
    </div>
  );
}
