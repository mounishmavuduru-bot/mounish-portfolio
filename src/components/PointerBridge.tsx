"use client";

import { useEffect } from "react";
import { pointer } from "@/lib/sceneStore";

/**
 * Single source of truth for the global pointer channel.
 *
 * Attaches window-level pointer listeners and writes directly into the
 * non-reactive `pointer` object from sceneStore. Renders nothing and never
 * touches React state — every consumer (Specimen physics, EkgMonitor,
 * Fluoroscopy) reads the channel inside its own rAF loop, so writing it here
 * must not schedule a render.
 */

/** Top band (px) treated as the EKG strip; pointer.overEkg flips inside it. */
const EKG_BAND = 54;
/** Velocity smoothing factor per update (exponential moving average). */
const VEL_SMOOTH = 0.22;
/** Max plausible px/sec, clamps spikes from coalesced/teleporting events. */
const MAX_SPEED = 6000;

export default function PointerBridge() {
  useEffect(() => {
    let lastX = pointer.x;
    let lastY = pointer.y;
    let lastT = typeof performance !== "undefined" ? performance.now() : 0;
    let primed = false;

    const write = (clientX: number, clientY: number) => {
      const now = performance.now();
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;

      if (primed) {
        const dt = Math.max((now - lastT) / 1000, 1 / 240);
        let ivx = (clientX - lastX) / dt;
        let ivy = (clientY - lastY) / dt;
        // Clamp instantaneous velocity, then EMA-smooth it.
        ivx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, ivx));
        ivy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, ivy));
        pointer.vx += (ivx - pointer.vx) * VEL_SMOOTH;
        pointer.vy += (ivy - pointer.vy) * VEL_SMOOTH;
      } else {
        primed = true;
        pointer.vx = 0;
        pointer.vy = 0;
      }

      pointer.x = clientX;
      pointer.y = clientY;
      pointer.nx = clientX / w;
      pointer.ny = clientY / h;
      pointer.overEkg = clientY < EKG_BAND;
      pointer.t = now;

      lastX = clientX;
      lastY = clientY;
      lastT = now;
    };

    const onMove = (e: PointerEvent) => write(e.clientX, e.clientY);

    const onDown = (e: PointerEvent) => {
      if (e.button === 0 || e.pointerType !== "mouse") pointer.down = true;
      write(e.clientX, e.clientY);
    };

    const onUp = (e: PointerEvent) => {
      if (e.button === 0 || e.pointerType !== "mouse") pointer.down = false;
      pointer.t = performance.now();
    };

    const onLeave = () => {
      // Pointer left the window: stop motion, drop EKG hover, release button.
      pointer.vx = 0;
      pointer.vy = 0;
      pointer.down = false;
      pointer.overEkg = false;
      pointer.t = performance.now();
      primed = false;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    window.addEventListener("pointerleave", onLeave, { passive: true });
    window.addEventListener("blur", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, []);

  return null;
}
