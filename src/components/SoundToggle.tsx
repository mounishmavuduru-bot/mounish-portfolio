"use client";

/**
 * SoundToggle — toggles the looping heartbeat audio whose playbackRate tracks
 * the live EKG rate so the thud stays in time with the on-screen rhythm.
 *
 * A small fixed control below the EKG strip (top:60px, right:12px) in atlas
 * styling (paper-2 fill, hairline border, --radius-ctl) with a code-drawn
 * speaker/wave glyph — never an emoji. The wave bars show/hide to read ON/OFF.
 *
 * Sync model (feature 7): EkgMonitor writes the eased live HR into the
 * non-reactive `vitals.hr` channel every frame. A rAF here reads it and sets
 *     audio.playbackRate = clamp(vitals.hr / NATIVE_BPM, 0.8, 2.2)
 * where NATIVE_BPM is the loop's natural tempo. The clip is an ~8.1s thudding
 * heartbeat ≈ 62 bpm, so NATIVE_BPM defaults to 62. ── TUNING NOTE: if the
 * heartbeat feels out of step with the trace, NATIVE_BPM is the ONE number to
 * change (raise it if the audio thuds too fast for the rhythm, lower it if too
 * slow). Everything else is derived from it.
 *
 * Autoplay: the <audio> is created/started inside the click handler so the
 * browser's user-gesture requirement is satisfied — we NEVER autoplay. Volume
 * eases in to ~0.5 on ON and eases to 0 then pauses on OFF. The on/off choice
 * is persisted to localStorage (SSR-guarded), but is only *applied* (sound
 * actually starting) after a user toggle — a remembered "on" pre-selects the
 * visual state without playing until the user clicks.
 *
 * Cleanup: the rAF and the audio element are torn down on unmount.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { vitals } from "@/lib/sceneStore";

const MONO =
  'var(--font-mono), "Spline Sans Mono", ui-monospace, SFMono-Regular, monospace';

const AUDIO_SRC = "/audio/heartbeat.mp3";

/**
 * Natural tempo of the heartbeat loop in bpm. The clip is an ~8.1s thudding
 * heartbeat; assume ≈62 bpm. THE single tuning knob for sync — change only this
 * if the audio drifts against the on-screen rhythm.
 */
const NATIVE_BPM = 62;

/** playbackRate clamp so the loop never gets comically slow/fast. */
const RATE_MIN = 0.8;
const RATE_MAX = 2.2;

const TARGET_VOLUME = 0.5;
/** Per-frame volume easing step (~250ms to full at 60fps). */
const VOLUME_STEP = 0.03;

const LS_KEY = "atlas.sound.on";

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * SSR-safe seed of the persisted on/off glyph state via useSyncExternalStore:
 * the server snapshot is always false (no localStorage), the client snapshot
 * reads localStorage once. There is no external store to subscribe to (the value
 * only changes via this component's own writes), so subscribe is a no-op.
 */
function subscribePersisted(): () => void {
  return () => {};
}

function persistedSnapshot(): boolean {
  try {
    return window.localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

function persistedServerSnapshot(): boolean {
  return false;
}

function writePersistedOn(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, on ? "1" : "0");
  } catch {
    // storage unavailable (private mode / quota) — silently skip persistence.
  }
}

export default function SoundToggle() {
  // The persisted preference seeds the GLYPH only (server → false, client →
  // localStorage), with NO setState in an effect. Playback never starts from
  // this — it always waits for a real click (autoplay policy).
  const persistedOn = useSyncExternalStore(
    subscribePersisted,
    persistedSnapshot,
    persistedServerSnapshot,
  );

  // The user's live choice overrides the persisted seed once they click. null =
  // "no click yet", so the seed shows through.
  const [userChoice, setUserChoice] = useState<boolean | null>(null);
  const on = userChoice ?? persistedOn;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  // Live mirror of `on` for the rAF (which is created once, not per render).
  const onRef = useRef(false);

  // The one long-lived rAF: ease volume toward its target and keep playbackRate
  // locked to the live EKG rate. Created once; reads onRef each frame.
  useEffect(() => {
    function frame() {
      const audio = audioRef.current;
      if (audio) {
        const wantOn = onRef.current;
        // Rate-sync: track the live HR every frame while audible.
        if (wantOn) {
          const hr = Number.isFinite(vitals.hr) ? vitals.hr : NATIVE_BPM;
          audio.playbackRate = clamp(hr / NATIVE_BPM, RATE_MIN, RATE_MAX);
        }
        // Volume easing both directions.
        const target = wantOn ? TARGET_VOLUME : 0;
        const cur = audio.volume;
        if (cur < target) {
          audio.volume = Math.min(target, cur + VOLUME_STEP);
        } else if (cur > target) {
          audio.volume = Math.max(target, cur - VOLUME_STEP);
          // Fully faded out → pause to stop decoding.
          if (audio.volume === 0 && !audio.paused) audio.pause();
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  // Tear the audio element down entirely on unmount.
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
        audio.load();
      }
      audioRef.current = null;
    };
  }, []);

  // Optional accent: a brief volume bump on each "pulse:beat" while audible.
  useEffect(() => {
    function onBeat() {
      const audio = audioRef.current;
      if (!audio || !onRef.current || audio.paused) return;
      // Nudge slightly above target; the rAF eases it back down next frames.
      audio.volume = Math.min(1, audio.volume + 0.18);
    }
    window.addEventListener("pulse:beat", onBeat);
    return () => window.removeEventListener("pulse:beat", onBeat);
  }, []);

  const toggle = useCallback(() => {
    const next = !onRef.current;
    onRef.current = next;
    setUserChoice(next);
    writePersistedOn(next);

    if (next) {
      // Create the element lazily, inside this gesture, so autoplay is allowed.
      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio(AUDIO_SRC);
        audio.loop = true;
        audio.preload = "auto";
        audio.volume = 0; // rAF eases it up to TARGET_VOLUME
        audioRef.current = audio;
      }
      // play() may reject if the gesture is somehow not honored — revert state.
      const p = audio.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          onRef.current = false;
          setUserChoice(false);
        });
      }
    }
    // OFF: the rAF eases volume to 0 then pauses — nothing to do here.
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        aria-label={on ? "mute heartbeat" : "play heartbeat"}
        style={rootStyle}
        className="sound-toggle"
      >
        <SpeakerMark on={on} />
        <span style={labelStyle}>{on ? "sound on" : "sound off"}</span>
      </button>

      <style>{`
        .sound-toggle:hover,
        .sound-toggle:focus-visible { border-color: var(--oxblood); }
        .sound-toggle:hover .sound-glyph,
        .sound-toggle:focus-visible .sound-glyph { stroke: var(--oxblood); }
      `}</style>
    </>
  );
}

/**
 * A code-drawn speaker with two sound waves — never an emoji. The wave arcs fade
 * out (opacity) when OFF; the speaker cone always shows. Transform/opacity only.
 */
function SpeakerMark({ on }: { on: boolean }) {
  return (
    <svg
      className="sound-glyph"
      width="14"
      height="13"
      viewBox="0 0 14 13"
      fill="none"
      stroke="var(--ink)"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: "block", transition: "stroke 150ms linear" }}
    >
      {/* speaker cone */}
      <path d="M1 4.5h2.2L6.5 2v9L3.2 8.5H1Z" />
      {/* sound waves — fade with on/off */}
      <path
        d="M9 4.2a3.2 3.2 0 0 1 0 4.6"
        style={{ opacity: on ? 1 : 0.18, transition: "opacity 150ms linear" }}
      />
      <path
        d="M10.7 2.6a5.5 5.5 0 0 1 0 7.8"
        style={{ opacity: on ? 1 : 0.18, transition: "opacity 150ms linear" }}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Styles (atlas: paper-2 fill, hairline, ink glyph, mono, rounded control)
// ---------------------------------------------------------------------------

const rootStyle: CSSProperties = {
  position: "fixed",
  top: 60,
  right: 12,
  zIndex: 55,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 10px",
  background: "var(--paper-2)",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-ctl)",
  cursor: "pointer",
  userSelect: "none",
  transition: "border-color 150ms linear",
};

const labelStyle: CSSProperties = {
  font: `500 10px/1 ${MONO}`,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink-soft)",
  whiteSpace: "nowrap",
};
