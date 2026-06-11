"use client";

import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";

const HEIGHT = 74; // css px
const SPEED = 120; // css px/sec, right-to-left
const GREEN = "#36c97c";
const DECAY = "rgba(7, 8, 8, 0.09)";
const BONE = "rgba(232, 227, 216, 0.6)";
const MONO =
  'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';

const HR_BASE = 64; // resting bpm
const HR_MAX = 88; // excited bpm under an active cursor
const CALIPER_GAP = 80; // css px between the two caliper lines

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

/** Premature ventricular complex — a tall, wide, lone ectopic beat. */
function pvc(phase: number): number {
  const bump = (center: number, width: number) => {
    const d = (phase - center) / width;
    return Math.exp(-d * d);
  };
  return (
    1.5 * bump(0.3, 0.05) - // wide tall R'
    0.55 * bump(0.42, 0.06) // deep discordant T
  );
}

export default function EcgStrip(): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // caliper x within the strip (css px), null when cursor is outside the band
  const [caliper, setCaliper] = useState<number | null>(null);
  // live HR readout for the bottom-left text
  const [hrText, setHrText] = useState(HR_BASE);

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
    let wavePhase = 0; // accumulated beat phase, advanced by live HR

    // ---- live global pointer state (read, never captured) -----------------
    let ptrX = -1; // css px, viewport space; -1 = unknown
    let ptrInBand = false; // pointer within the strip's vertical band
    let ptrSpeed = 0; // px/sec smoothed
    let lastPtrX = -1;
    let lastPtrY = -1;
    let lastPtrTs = 0;
    let hr = HR_BASE; // eased bpm driving the waveform
    let excite = 0; // 0..1, decays toward 0 when the cursor is calm

    // Ectopic beat injected on click. The complex is painted into the phosphor
    // at the right edge during the frames its phase window is drawn, then lives
    // in pixels and scrolls left like the rest of the trace — it is not
    // re-evaluated as it travels. pvcAt is a single scalar; the guard below
    // retires it once it can no longer be painted, so it never accumulates.
    let pvcAt = -1; // beat-phase value where the PVC sits; -1 = none

    const bandTop = () => window.innerHeight - HEIGHT;

    const onPointerMove = (e: PointerEvent) => {
      const now = e.timeStamp || performance.now();
      ptrX = e.clientX;
      ptrInBand = e.clientY >= bandTop();
      if (lastPtrTs > 0) {
        const dt = (now - lastPtrTs) / 1000;
        if (dt > 0) {
          const dx = e.clientX - lastPtrX;
          const dy = e.clientY - lastPtrY;
          const inst = Math.hypot(dx, dy) / dt;
          ptrSpeed = ptrSpeed * 0.8 + inst * 0.2;
        }
      }
      lastPtrX = e.clientX;
      lastPtrY = e.clientY;
      lastPtrTs = now;
    };

    const onPointerDown = (e: PointerEvent) => {
      // only fire an ectopic when the press lands over the strip's band, so
      // clicks elsewhere on the page don't inject beats
      if (e.clientY < bandTop()) return;
      pvcAt = wavePhase;
    };

    const resize = () => {
      dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
      canvas.width = Math.max(1, Math.round(wrap.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(HEIGHT * dpr));
      ctx.fillStyle = "#070808";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    // amplitude swell — gaussian centered on the cursor x, in device px
    const swellAt = (xDev: number): number => {
      if (ptrX < 0) return 1;
      const cx = ptrX * dpr;
      const sigma = 90 * dpr;
      const d = (xDev - cx) / sigma;
      return 1 + 0.7 * Math.exp(-d * d);
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

      // ---- HR dynamics: rise with cursor activity, ease back when calm -----
      const movePush = Math.min(1, ptrSpeed / 900);
      const target = ptrInBand ? 1 : 0.55 * movePush;
      excite += (target - excite) * Math.min(1, dt * 3);
      ptrSpeed *= Math.max(0, 1 - dt * 2.4); // bleed speed when no new moves
      const hrTarget = HR_BASE + (HR_MAX - HR_BASE) * excite;
      hr += (hrTarget - hr) * Math.min(1, dt * 2.2);

      // advance waveform by live HR (cycles/sec = hr/60)
      const beatsPerSec = hr / 60;
      wavePhase += beatsPerSec * dt;

      scrollCarry += SPEED * dpr * dt;
      const shift = Math.floor(scrollCarry);
      if (shift <= 0) return; // sub-pixel frame
      scrollCarry -= shift;

      // scroll existing phosphor left by whole device px
      ctx.drawImage(canvas, -shift, 0);
      ctx.fillStyle = "#070808";
      ctx.fillRect(w - shift, 0, shift, h);
      // phosphor decay
      ctx.fillStyle = DECAY;
      ctx.fillRect(0, 0, w, h);

      const baseline = h * 0.6;
      const amp = h * 0.42;
      // beats per device px (so we can read phase backward across the segment)
      const beatsPerDevPx = beatsPerSec / (SPEED * dpr);

      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 1.5 * dpr;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = shift; i >= 0; i--) {
        const x = w - 1 - i;
        const phaseAbs = wavePhase - i * beatsPerDevPx;
        const phase = phaseAbs - Math.floor(phaseAbs);
        let v = pqrst(phase) * swellAt(x);
        // overlay the ectopic complex if this column is near its phase window
        if (pvcAt >= 0) {
          const dp = phaseAbs - pvcAt; // beats since the PVC fired
          if (dp >= 0 && dp <= 1) v += pvc(dp);
        }
        const y = baseline - v * amp;
        if (i === shift) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // retire the PVC once its phase window can no longer be painted (it has
      // already been drawn into the phosphor; this just frees the scalar)
      if (pvcAt >= 0) {
        const beatsAcross = (w / dpr / SPEED) * beatsPerSec;
        if (wavePhase - pvcAt > beatsAcross + 1) pvcAt = -1;
      }

      // push HR readout to React (rounded; only when it changes)
      const rounded = Math.round(hr);
      setHrText((prev) => (prev === rounded ? prev : rounded));

      // caliper visibility follows the in-band pointer
      if (ptrInBand && ptrX >= 0) {
        const rect = wrap.getBoundingClientRect();
        setCaliper((prev) => {
          const next = ptrX - rect.left;
          return prev === next ? prev : next;
        });
      } else {
        setCaliper((prev) => (prev === null ? prev : null));
      }
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
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();

    return () => {
      stop();
      ro.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // delta between calipers in ms, from the fixed pixel gap and scroll speed
  const deltaMs = Math.round((CALIPER_GAP / SPEED) * 1000);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 overflow-hidden"
      style={{
        height: HEIGHT,
        borderTop: "1px solid rgba(232, 227, 216, 0.08)",
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* heart-rate readout, bottom-left */}
      <span
        className="absolute"
        style={{
          left: 12,
          bottom: 8,
          fontFamily: MONO,
          fontSize: "0.62rem",
          letterSpacing: "0.08em",
          color: "color-mix(in srgb, var(--green) 60%, transparent)",
        }}
      >
        HR {hrText} bpm
      </span>

      {/* calipers — only while the cursor is over the strip's band */}
      {caliper !== null && (
        <>
          <div
            className="absolute inset-y-0"
            style={{ left: caliper, width: "1px", background: BONE }}
          />
          <div
            className="absolute inset-y-0"
            style={{
              left: caliper - CALIPER_GAP,
              width: "1px",
              background: BONE,
            }}
          />
          <span
            className="absolute whitespace-nowrap"
            style={{
              left: caliper - CALIPER_GAP + 6,
              top: 6,
              fontFamily: MONO,
              fontSize: "0.62rem",
              letterSpacing: "0.08em",
              color: "color-mix(in srgb, var(--bone) 70%, transparent)",
            }}
          >
            Δ {deltaMs} ms
          </span>
        </>
      )}
    </div>
  );
}
