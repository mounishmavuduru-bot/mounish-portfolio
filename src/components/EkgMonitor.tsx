"use client";

import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { pointer, subscribeEkg, ui, vitals, type EkgEvent } from "@/lib/sceneStore";

// ---------------------------------------------------------------------------
// Atlas rhythm-strip HEADER BAR.
//
// A plain cream band pinned to the very top of the viewport carrying ONLY a
// crisp INK/oxblood trace, the HR readout, and the calipers, closed by a single
// hairline bottom border. No graph-paper grid, NO phosphor glow, NO green —
// this is a quiet printed strip, not a monitor screen.
//
// The left of the bar is reserved blank space (MONOGRAM_INSET) where IntroBlock
// renders the MM monogram; the trace begins to the right of it. While the
// monogram is expanded to the full name (read per frame from the non-reactive
// `ui` channel) the effective inset eases out to INSET_EXPANDED so neither the
// trace nor the calipers ever cross the name.
//
// Ink profile across the strip (destination-out fade): full dark ink only in a
// short band at the RIGHT (newest signal), a sharp knee down to a light ghost
// for the long middle, easing to nothing as it approaches the monogram inset
// on the left. While the cursor is over the band, the region between the two
// caliper lines is clipped and redrawn at full ink — a caliper reveal.
//
// It reads the shared `pointer` channel (written by PointerBridge) for the four
// cursor interactions (deflection-follows-cursor, hr-from-speed beat period,
// click → ectopic, calipers while overEkg) and subscribes to the scene-store
// EKG event channel for the chart easter eggs (flatline / defib / tachy /
// normal / ectopic). pointer-events-none so it never intercepts clicks meant
// for the specimen beneath it.
//
// Unlike the old phosphor implementation this redraws the whole strip every
// frame from a rolling phase model. That keeps the trace crisp on light paper
// (a fading phosphor buffer smears and muddies on cream).
// ---------------------------------------------------------------------------

const HEIGHT = 54; // css px — header-bar height (also the overEkg band PointerBridge uses)
const MONOGRAM_INSET = 120; // css px reserved at the left for the MM monogram
const INSET_EXPANDED = 300; // css px inset while the monogram is expanded to the full name
const SPEED = 150; // css px/sec, trace scrolls right → left

// Atlas palette (no green, no glow).
const INK = "#1a1714";
const CALIPER_INK = "rgba(26, 23, 20, 0.55)";
const MONO =
  'var(--font-mono), "Spline Sans Mono", ui-monospace, SFMono-Regular, monospace';

const HR_BASE = 64; // resting bpm
const HR_MAX = 92; // excited bpm under a fast cursor
const HR_TACHY = 150; // easter-egg tachycardia target
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
    1.55 * bump(0.3, 0.05) - // wide tall R'
    0.55 * bump(0.42, 0.06) // deep discordant T
  );
}

export default function EkgMonitor(): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const traceRef = useRef<HTMLCanvasElement>(null); // live trace, redrawn each frame
  // caliper x within the band (css px), null when the cursor is not over the band
  const [caliper, setCaliper] = useState<number | null>(null);
  // live HR readout for the corner text
  const [hrText, setHrText] = useState(HR_BASE);

  useEffect(() => {
    const wrap = wrapRef.current;
    const traceCanvas = traceRef.current;
    if (!wrap || !traceCanvas) return;
    const tctx = traceCanvas.getContext("2d");
    if (!tctx) return;

    let raf = 0;
    let running = false;
    let lastTs = 0;
    let dpr = 1;
    let cssW = 0; // css px width of the canvas
    let wavePhase = 0; // accumulated beat phase, advanced by live HR
    let ys = new Float32Array(0); // per-column trace y, rebuilt each frame
    let insetEff = MONOGRAM_INSET; // eased left inset (widens while the name is expanded)

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

    // No grid to paint — the bar is plain cream (CSS background on the wrap)
    // with a single hairline bottom border; only the trace canvas needs sizing.
    const resize = () => {
      dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
      cssW = Math.max(1, wrap.clientWidth);
      traceCanvas.width = Math.max(1, Math.round(cssW * dpr));
      traceCanvas.height = Math.max(1, Math.round(HEIGHT * dpr));
      ys = new Float32Array(Math.max(1, Math.ceil(cssW)));
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

      // publish the eased live HR to the non-reactive vitals channel so other
      // rAF consumers (SoundToggle's playbackRate) stay in lock-step with the
      // trace. One plain assignment — never schedules a React render.
      vitals.hr = hr;

      // advance the waveform by the live HR (cycles/sec = hr/60). During a
      // flatline the phase still advances (so revival timing is honest) but the
      // PQRST is suppressed below.
      const beatsPerSec = hr / 60;
      wavePhase += beatsPerSec * dt;

      // ---- ease the effective left inset toward the monogram state ----------
      // While IntroBlock reports the monogram expanded (non-reactive ui channel)
      // the trace + fade endpoint slide right so the name zone stays clean.
      const insetTarget = ui.monogramExpanded ? INSET_EXPANDED : MONOGRAM_INSET;
      insetEff += (insetTarget - insetEff) * Math.min(1, dt * 7);

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

      // draw the trace across the visible strip (starting after the eased
      // monogram inset so the trace never runs under the MM mark / full name)
      const x0 = Math.min(cssW - 1, Math.max(0, Math.floor(insetEff)));
      // precompute per-column y once; the stroke passes below just read it
      for (let x = x0; x < cssW; x++) ys[x] = baseline - sampleAt(x) * amp;

      // raw-ink nib alpha: a slow drifting sin field along x so the wide pass
      // breathes like a hand-inked line (no glow, pure ink).
      const nibAlpha = (x: number): number => {
        const s =
          Math.sin(x * 0.018 + wavePhase * 1.3) * 0.5 +
          Math.sin(x * 0.005 - wavePhase * 0.45) * 0.5;
        return 0.2 + 0.26 * (0.5 + 0.5 * s);
      };

      // stroke the precomputed polyline over [a, b] (css px columns)
      const strokeSpan = (a: number, b: number, width: number, alpha: number) => {
        tctx.globalAlpha = alpha;
        tctx.lineWidth = width;
        tctx.beginPath();
        for (let x = a; x <= b; x++) {
          if (x === a) tctx.moveTo(x, ys[x]);
          else tctx.lineTo(x, ys[x]);
        }
        tctx.stroke();
      };

      tctx.lineJoin = "round";
      tctx.lineCap = "round";
      tctx.strokeStyle = INK;
      // two passes: a thin constant core + a wider pass whose alpha drifts
      // along x (chunked strokes) so the line reads like a raw ink nib.
      strokeSpan(x0, cssW - 1, 1.1, 1);
      const CHUNK = 26;
      for (let cx = x0; cx < cssW - 1; cx += CHUNK) {
        const end = Math.min(cx + CHUNK, cssW - 1);
        strokeSpan(cx, end, 1.9, nibAlpha((cx + end) / 2));
      }
      tctx.globalAlpha = 1;

      // ---- fade profile (destination-out; fill alpha = ink REMOVED) ---------
      // Right ~12% of the strip: full dark ink (newest signal). Then a sharp
      // knee down to a light ghost (~0.28 visible) across the long middle,
      // easing to nothing as it approaches the eased monogram inset on the left.
      {
        const span = cssW - insetEff;
        if (span > 8) {
          const kneeX = cssW - Math.max(90, cssW * 0.12);
          const knee = Math.min(0.97, Math.max(0.6, (kneeX - insetEff) / span));
          const grad = tctx.createLinearGradient(insetEff, 0, cssW, 0);
          grad.addColorStop(0, "rgba(0,0,0,1)"); // gone at the inset
          grad.addColorStop(0.12, "rgba(0,0,0,0.94)");
          grad.addColorStop(0.38, "rgba(0,0,0,0.8)");
          grad.addColorStop(Math.max(0.5, knee - 0.25), "rgba(0,0,0,0.72)"); // ghost plateau
          grad.addColorStop(knee - 0.02, "rgba(0,0,0,0.72)");
          grad.addColorStop(knee, "rgba(0,0,0,0)"); // sharp knee → full ink
          grad.addColorStop(1, "rgba(0,0,0,0)");
          tctx.globalCompositeOperation = "destination-out";
          tctx.fillStyle = grad;
          // start a few px left of the inset: the gradient pads beyond stop 0
          // with full erase, catching the polyline's stroke-radius fringe.
          const fadeL = Math.max(0, insetEff - 4);
          tctx.fillRect(fadeL, 0, cssW - fadeL, HEIGHT);
          tctx.globalCompositeOperation = "source-over";
        }
      }

      // ---- caliper reveal: full-dark trace between the two caliper lines ----
      // Calipers are suppressed entirely left of the eased inset so they can
      // never cross the expanded name: the whole instrument (including the
      // left line at calX - CALIPER_GAP) must sit right of the inset.
      let calipersOn = false;
      let calX = 0;
      if (pointer.overEkg) {
        const rect = wrap.getBoundingClientRect();
        calX = pointer.x - rect.left;
        calipersOn = calX - CALIPER_GAP >= insetEff;
      }
      if (calipersOn) {
        const bandL = Math.max(x0, Math.floor(calX - CALIPER_GAP));
        const bandR = Math.min(cssW - 1, Math.ceil(calX));
        if (bandR > bandL) {
          tctx.save();
          tctx.beginPath();
          tctx.rect(bandL, 0, bandR - bandL, HEIGHT);
          tctx.clip();
          // override the fade inside the band: redraw at full ink alpha
          strokeSpan(bandL, bandR, 1.5, 1);
          tctx.restore();
          tctx.globalAlpha = 1;
        }
      }

      // retire the ectopic / defib once they've scrolled off the left edge
      const beatsAcross = (cssW / SPEED) * beatsPerSec;
      if (pvcAt >= 0 && wavePhase - pvcAt > beatsAcross + 1) pvcAt = -1;
      if (defibPhaseAt >= 0 && wavePhase - defibPhaseAt > beatsAcross + 1)
        defibPhaseAt = -1;

      // push the HR readout to React (rounded; only when it changes)
      const rounded = Math.round(hr);
      setHrText((prev) => (prev === rounded ? prev : rounded));

      // (d) caliper DOM lines — only while the cursor is over the band AND
      // right of the eased inset (computed above for the canvas reveal).
      if (calipersOn) {
        setCaliper((prev) => (prev === calX ? prev : calX));
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
      {/* the live trace, redrawn each frame over the plain cream ground */}
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
