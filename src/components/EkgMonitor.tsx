"use client";

import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { pointer, subscribeEkg, type EkgEvent } from "@/lib/sceneStore";

// ---------------------------------------------------------------------------
// Atlas rhythm-strip HEADER BAR.
//
// A classic ECG graph-paper strip pinned to the very top of the viewport: a
// faint oxblood/salmon grid (small + large squares) printed on the cream paper
// ground, with a crisp INK/oxblood trace scrolling across it. NO phosphor glow,
// NO green — this is a printed rhythm strip, not a monitor screen.
//
// The left of the bar is reserved blank space (MONOGRAM_INSET) where IntroBlock
// renders the MM monogram; the trace and grid begin to the right of it.
//
// It reads the shared `pointer` channel (written by PointerBridge) for the four
// cursor interactions (deflection-follows-cursor, hr-from-speed beat period,
// click → ectopic, calipers while overEkg) and subscribes to the scene-store
// EKG event channel for the chart easter eggs (flatline / defib / tachy /
// normal / ectopic). pointer-events-none so it never intercepts clicks meant
// for the specimen beneath it.
//
// Unlike the old phosphor implementation this redraws the whole strip every
// frame from a rolling ring buffer of sample values. That keeps the trace crisp
// on light paper (a fading phosphor buffer smears and muddies on cream) and lets
// the grid sit cleanly behind the ink.
// ---------------------------------------------------------------------------

const HEIGHT = 54; // css px — header-bar height (also the overEkg band PointerBridge uses)
const MONOGRAM_INSET = 120; // css px reserved at the left for the MM monogram
const SPEED = 150; // css px/sec, trace scrolls right → left

// Atlas palette (no green, no glow).
const INK = "#1a1714";
const OXBLOOD = "#7c1f1c";
const PAPER = "#efe7d6";
const GRID_FINE = "rgba(124, 31, 28, 0.10)"; // small squares — faint salmon
const GRID_BOLD = "rgba(124, 31, 28, 0.20)"; // every 5th line — stronger salmon
const CALIPER_INK = "rgba(26, 23, 20, 0.55)";
const MONO =
  'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';

const HR_BASE = 64; // resting bpm
const HR_MAX = 92; // excited bpm under a fast cursor
const HR_TACHY = 150; // easter-egg tachycardia target
const CALIPER_GAP = 80; // css px between the two caliper lines

const SMALL_SQ = 11; // css px — one small ECG square
const BIG_EVERY = 5; // a bold line every 5 small squares

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
  const gridRef = useRef<HTMLCanvasElement>(null); // static graph-paper grid
  const traceRef = useRef<HTMLCanvasElement>(null); // live trace, redrawn each frame
  // caliper x within the band (css px), null when the cursor is not over the band
  const [caliper, setCaliper] = useState<number | null>(null);
  // live HR readout for the corner text
  const [hrText, setHrText] = useState(HR_BASE);

  useEffect(() => {
    const wrap = wrapRef.current;
    const gridCanvas = gridRef.current;
    const traceCanvas = traceRef.current;
    if (!wrap || !gridCanvas || !traceCanvas) return;
    const gctx = gridCanvas.getContext("2d");
    const tctx = traceCanvas.getContext("2d");
    if (!gctx || !tctx) return;

    let raf = 0;
    let running = false;
    let lastTs = 0;
    let dpr = 1;
    let cssW = 0; // css px width of the canvas
    let wavePhase = 0; // accumulated beat phase, advanced by live HR

    // ---- derived cursor dynamics (all read from the global pointer channel) -
    let hr = HR_BASE; // eased bpm actually driving the waveform
    let excite = 0; // 0..1, decays toward 0 when the cursor is calm
    let speedSmoothed = 0; // px/sec, eased from pointer.vx/vy magnitude

    // (c) ectopic beat injected on every global pointerdown (and on the
    // "ectopic"/"defib" easter eggs). A single scalar; retired once it scrolls
    // off the left edge so it never accumulates.
    let pvcAt = -1; // beat-phase value where the ectopic sits; -1 = none
    let prevDown = false;

    // ---- easter-egg effect state ------------------------------------------
    // flatline: trace goes flat (asystole) until this timestamp, then a strong
    // ectopic revives it. -1 = not flatlining.
    let flatlineUntil = -1;
    // tachy: elevated rate forced until this timestamp. -1 = inactive.
    let tachyUntil = -1;
    // defib: a single sharp jolt deflection painted at the right edge for a beat.
    let defibPhaseAt = -1;

    // The graph-paper grid is static; it's repainted only on resize.
    const paintGrid = () => {
      const wDev = gridCanvas.width;
      const hDev = gridCanvas.height;
      gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gctx.clearRect(0, 0, wDev / dpr, hDev / dpr);
      // paper ground
      gctx.fillStyle = PAPER;
      gctx.fillRect(0, 0, cssW, HEIGHT);

      // fine + bold grid lines. The grid runs the full width (it reads like a
      // printed strip continuing under the monogram), in css-px space.
      gctx.lineWidth = 1;
      // verticals
      let n = 0;
      for (let x = 0; x <= cssW + 0.5; x += SMALL_SQ, n++) {
        gctx.strokeStyle = n % BIG_EVERY === 0 ? GRID_BOLD : GRID_FINE;
        gctx.beginPath();
        gctx.moveTo(x + 0.5, 0);
        gctx.lineTo(x + 0.5, HEIGHT);
        gctx.stroke();
      }
      // horizontals — center the grid vertically so the baseline sits on a bold line
      const baseline = HEIGHT * 0.56;
      // walk up and down from the baseline so a bold line lands on it
      const drawH = (y: number, idx: number) => {
        if (y < -0.5 || y > HEIGHT + 0.5) return;
        gctx.strokeStyle = idx % BIG_EVERY === 0 ? GRID_BOLD : GRID_FINE;
        gctx.beginPath();
        gctx.moveTo(0, y + 0.5);
        gctx.lineTo(cssW, y + 0.5);
        gctx.stroke();
      };
      for (let i = 0; ; i++) {
        const y = baseline - i * SMALL_SQ;
        if (y < -0.5) break;
        drawH(y, i);
      }
      for (let i = 1; ; i++) {
        const y = baseline + i * SMALL_SQ;
        if (y > HEIGHT + 0.5) break;
        drawH(y, i);
      }

      // bottom hairline rule under the whole bar
      gctx.strokeStyle = "rgba(26, 23, 20, 0.16)";
      gctx.lineWidth = 1;
      gctx.beginPath();
      gctx.moveTo(0, HEIGHT - 0.5);
      gctx.lineTo(cssW, HEIGHT - 0.5);
      gctx.stroke();
    };

    const resize = () => {
      dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
      cssW = Math.max(1, wrap.clientWidth);
      const wDev = Math.max(1, Math.round(cssW * dpr));
      const hDev = Math.max(1, Math.round(HEIGHT * dpr));
      for (const c of [gridCanvas, traceCanvas]) {
        c.width = wDev;
        c.height = hDev;
      }
      paintGrid();
    };

    // (a) amplitude swell — gaussian centered on the cursor x (css px), so a
    // travelling deflection follows pointer.x across the trace.
    const swellAt = (xCss: number): number => {
      const cx = pointer.x;
      const sigma = 95;
      const d = (xCss - cx) / sigma;
      const lift = pointer.overEkg ? 0.85 : 0.5;
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

      // rising-edge detection on the shared pointer button → inject ectopic
      if (pointer.down && !prevDown) pvcAt = wavePhase;
      prevDown = pointer.down;

      const flatlining = flatlineUntil > 0 && ts < flatlineUntil;
      if (flatlineUntil > 0 && ts >= flatlineUntil) {
        // asystole resolves with a strong ectopic that revives the rhythm
        pvcAt = wavePhase;
        flatlineUntil = -1;
      }

      // ---- (b) HR dynamics: rise with cursor SPEED, ease back when calm ------
      const instSpeed = Math.hypot(pointer.vx, pointer.vy);
      speedSmoothed += (instSpeed - speedSmoothed) * Math.min(1, dt * 6);
      const movePush = Math.min(1, speedSmoothed / 1100);
      const target = pointer.overEkg ? Math.max(0.5, movePush) : movePush;
      excite += (target - excite) * Math.min(1, dt * 3);
      let hrTarget = HR_BASE + (HR_MAX - HR_BASE) * excite;
      if (tachyUntil > 0) {
        if (ts < tachyUntil) hrTarget = HR_TACHY;
        else tachyUntil = -1;
      }
      hr += (hrTarget - hr) * Math.min(1, dt * 2.2);

      // advance the waveform by the live HR (cycles/sec = hr/60). During a
      // flatline the phase still advances (so revival timing is honest) but the
      // PQRST is suppressed below.
      const beatsPerSec = hr / 60;
      wavePhase += beatsPerSec * dt;

      // ---- repaint the whole trace from the rolling phase model -------------
      tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      tctx.clearRect(0, 0, cssW, HEIGHT);

      const baseline = HEIGHT * 0.56;
      const amp = HEIGHT * 0.42;
      // beats per css px (so we can read phase backward across the strip)
      const beatsPerCssPx = beatsPerSec / SPEED;

      // sample the waveform value at a given column x (css px)
      const sampleAt = (x: number): number => {
        // how many css px from the right (newest) edge this column is
        const fromRight = cssW - 1 - x;
        const phaseAbs = wavePhase - fromRight * beatsPerCssPx;
        if (flatlining) {
          // asystole: flat with a faint mains-noise tremor so it isn't a dead line
          return Math.sin(phaseAbs * 47) * 0.015;
        }
        const phase = phaseAbs - Math.floor(phaseAbs);
        let v = pqrst(phase) * swellAt(x);
        if (pvcAt >= 0) {
          const dp = phaseAbs - pvcAt; // beats since the ectopic fired
          if (dp >= 0 && dp <= 1) v += pvc(dp);
        }
        if (defibPhaseAt >= 0) {
          const dp = phaseAbs - defibPhaseAt;
          // a single tall narrow jolt
          if (dp >= 0 && dp <= 0.25) {
            const d = (dp - 0.05) / 0.03;
            v += 1.9 * Math.exp(-d * d);
          }
        }
        return v;
      };

      // draw the trace across the visible strip (starting after the monogram
      // inset so the trace never runs under the MM mark)
      const x0 = MONOGRAM_INSET;
      tctx.lineJoin = "round";
      tctx.lineCap = "round";
      // ink body
      tctx.strokeStyle = INK;
      tctx.lineWidth = 1.4;
      tctx.beginPath();
      for (let x = x0; x < cssW; x++) {
        const y = baseline - sampleAt(x) * amp;
        if (x === x0) tctx.moveTo(x, y);
        else tctx.lineTo(x, y);
      }
      tctx.stroke();

      // a single oxblood leading dot at the newest sample (the "pen")
      {
        const xPen = cssW - 1;
        const yPen = baseline - sampleAt(xPen) * amp;
        tctx.fillStyle = OXBLOOD;
        tctx.beginPath();
        tctx.arc(xPen, yPen, 1.8, 0, Math.PI * 2);
        tctx.fill();
      }

      // retire the ectopic / defib once they've scrolled off the left edge
      const beatsAcross = (cssW / SPEED) * beatsPerSec;
      if (pvcAt >= 0 && wavePhase - pvcAt > beatsAcross + 1) pvcAt = -1;
      if (defibPhaseAt >= 0 && wavePhase - defibPhaseAt > beatsAcross + 1)
        defibPhaseAt = -1;

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

    // ---- easter-egg event channel -----------------------------------------
    const handleEkg = (e: EkgEvent) => {
      const now = performance.now();
      switch (e) {
        case "flatline":
          flatlineUntil = now + 2000; // ~2s asystole, then revive
          tachyUntil = -1;
          break;
        case "defib":
          defibPhaseAt = wavePhase; // one sharp jolt
          flatlineUntil = -1; // a shock also breaks asystole
          break;
        case "tachy":
          tachyUntil = now + 4000; // ~4s elevated rate
          break;
        case "ectopic":
          pvcAt = wavePhase; // a single strong extra beat
          break;
        case "normal":
          flatlineUntil = -1;
          tachyUntil = -1;
          defibPhaseAt = -1;
          pvcAt = -1;
          break;
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    document.addEventListener("visibilitychange", onVisibility);
    const unsubEkg = subscribeEkg(handleEkg);
    if (!document.hidden) start();

    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      unsubEkg();
    };
  }, []);

  // delta between calipers in ms, from the fixed pixel gap and the scroll speed
  const deltaMs = Math.round((CALIPER_GAP / SPEED) * 1000);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-30 overflow-hidden"
      style={{ height: HEIGHT }}
    >
      {/* static graph-paper grid, then the live trace over it */}
      <canvas ref={gridRef} className="absolute inset-0 h-full w-full" />
      <canvas ref={traceRef} className="absolute inset-0 h-full w-full" />

      {/* heart-rate readout, top-right, in ink */}
      <span
        className="absolute"
        style={{
          right: 12,
          top: 7,
          fontFamily: MONO,
          fontSize: "0.6rem",
          letterSpacing: "0.1em",
          color: "color-mix(in srgb, var(--ink) 62%, transparent)",
        }}
      >
        hr {hrText}
      </span>

      {/* calipers — only while the cursor is over the band */}
      {caliper !== null && (
        <>
          <div
            className="absolute inset-y-0"
            style={{ left: caliper, width: "1px", background: CALIPER_INK }}
          />
          <div
            className="absolute inset-y-0"
            style={{
              left: caliper - CALIPER_GAP,
              width: "1px",
              background: CALIPER_INK,
            }}
          />
          <span
            className="absolute whitespace-nowrap"
            style={{
              left: caliper - CALIPER_GAP + 5,
              bottom: 4,
              fontFamily: MONO,
              fontSize: "0.6rem",
              letterSpacing: "0.08em",
              color: "color-mix(in srgb, var(--ink) 70%, transparent)",
            }}
          >
            Δ {deltaMs} ms
          </span>
        </>
      )}
    </div>
  );
}
