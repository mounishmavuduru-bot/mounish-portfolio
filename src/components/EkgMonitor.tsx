"use client";

import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { pointer } from "@/lib/sceneStore";

// Slim standalone EKG band fixed to the very top of the viewport. It reads the
// shared `pointer` channel (written by PointerBridge) for all four cursor
// interactions; it owns no pointer listeners of its own. pointer-events-none so
// it never intercepts clicks meant for the specimen beneath it.

const HEIGHT = 46; // css px — slim, per contract
const SPEED = 130; // css px/sec, scroll right → left
const GREEN = "#36c97c";
const DECAY = "rgba(7, 8, 8, 0.10)"; // per-frame phosphor fade toward --black
const BONE = "rgba(232, 227, 216, 0.55)";
const MONO =
  'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';

const HR_BASE = 64; // resting bpm
const HR_MAX = 92; // excited bpm under a fast cursor
const CALIPER_GAP = 76; // css px between the two caliper lines

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
    1.55 * bump(0.3, 0.05) - // wide tall R'
    0.55 * bump(0.42, 0.06) // deep discordant T
  );
}

export default function EkgMonitor(): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // caliper x within the band (css px), null when the cursor is not over the band
  const [caliper, setCaliper] = useState<number | null>(null);
  // live HR readout for the corner text
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

    // ---- derived cursor dynamics (all read from the global pointer channel) -
    let hr = HR_BASE; // eased bpm actually driving the waveform
    let excite = 0; // 0..1, decays toward 0 when the cursor is calm
    let speedSmoothed = 0; // px/sec, eased from pointer.vx/vy magnitude

    // (c) ectopic beat injected on every global pointerdown. We watch the shared
    // `pointer.down` for a rising edge. The complex is painted into the phosphor
    // at the right edge as its phase window scrolls past, then lives in pixels —
    // it is not re-evaluated as it travels. pvcAt is a single scalar; the guard
    // below retires it so it never accumulates.
    let pvcAt = -1; // beat-phase value where the PVC sits; -1 = none
    let prevDown = false;

    const resize = () => {
      dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
      canvas.width = Math.max(1, Math.round(wrap.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(HEIGHT * dpr));
      ctx.fillStyle = "#070808";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    // (a) amplitude swell — gaussian centered on the cursor x, in device px, so
    // a travelling deflection follows pointer.x across the trace.
    const swellAt = (xDev: number): number => {
      const cx = pointer.x * dpr;
      const sigma = 95 * dpr;
      const d = (xDev - cx) / sigma;
      // a touch stronger while the cursor is right over the band
      const lift = pointer.overEkg ? 0.85 : 0.55;
      return 1 + lift * Math.exp(-d * d);
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

      // rising-edge detection on the shared pointer button → inject ectopic
      if (pointer.down && !prevDown) pvcAt = wavePhase;
      prevDown = pointer.down;

      // ---- (b) HR dynamics: rise with cursor SPEED, ease back when calm ------
      const instSpeed = Math.hypot(pointer.vx, pointer.vy);
      speedSmoothed += (instSpeed - speedSmoothed) * Math.min(1, dt * 6);
      const movePush = Math.min(1, speedSmoothed / 1100);
      const target = pointer.overEkg ? Math.max(0.5, movePush) : movePush;
      excite += (target - excite) * Math.min(1, dt * 3);
      const hrTarget = HR_BASE + (HR_MAX - HR_BASE) * excite;
      hr += (hrTarget - hr) * Math.min(1, dt * 2.2);

      // advance the waveform by the live HR (cycles/sec = hr/60) — so the beat
      // period genuinely follows the readout
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
      // phosphor decay over the whole band
      ctx.fillStyle = DECAY;
      ctx.fillRect(0, 0, w, h);

      const baseline = h * 0.56;
      const amp = h * 0.4;
      // beats per device px (so we can read phase backward across the new segment)
      const beatsPerDevPx = beatsPerSec / (SPEED * dpr);

      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 1.4 * dpr;
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

      // retire the PVC once its phase window can no longer be painted (already
      // baked into the phosphor; this just frees the scalar so it never grows)
      if (pvcAt >= 0) {
        const beatsAcross = (w / dpr / SPEED) * beatsPerSec;
        if (wavePhase - pvcAt > beatsAcross + 1) pvcAt = -1;
      }

      // push the HR readout to React (rounded; only when it changes)
      const rounded = Math.round(hr);
      setHrText((prev) => (prev === rounded ? prev : rounded));

      // (d) calipers — only while the shared channel reports the cursor over the
      // band. wrap is full-width fixed at the top, so band-local x ≈ pointer.x.
      if (pointer.overEkg) {
        const rect = wrap.getBoundingClientRect();
        const next = pointer.x - rect.left;
        setCaliper((prev) => (prev === next ? prev : next));
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
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();

    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // delta between calipers in ms, from the fixed pixel gap and the scroll speed
  const deltaMs = Math.round((CALIPER_GAP / SPEED) * 1000);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-30 overflow-hidden"
      style={{
        height: HEIGHT,
        borderBottom: "1px solid rgba(232, 227, 216, 0.08)",
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* heart-rate readout, top-right */}
      <span
        className="absolute"
        style={{
          right: 12,
          top: 8,
          fontFamily: MONO,
          fontSize: "0.6rem",
          letterSpacing: "0.1em",
          color: "color-mix(in srgb, var(--green) 60%, transparent)",
        }}
      >
        hr {hrText}
      </span>

      {/* calipers — only while the cursor is over the band */}
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
              left: caliper - CALIPER_GAP + 5,
              bottom: 5,
              fontFamily: MONO,
              fontSize: "0.6rem",
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
