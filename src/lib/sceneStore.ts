/**
 * Shared scene-store backbone for the v3 specimen portfolio.
 *
 * Two channels, deliberately separated by update frequency:
 *
 *  1. A reactive snapshot (index / progress / panel / pulses) exposed through
 *     `useScene(selector)`, backed by `useSyncExternalStore`. The snapshot
 *     object is immutable and only rebuilt when something actually changes, so
 *     selectors that compare by value never spin. SSR-safe: the server snapshot
 *     is a stable initial object.
 *
 *  2. A NON-reactive high-frequency pointer channel (`pointer`) — a plain
 *     mutable object mutated by PointerBridge and read inside rAF loops. It is
 *     intentionally outside React: writing it must never schedule a render.
 */

import { useSyncExternalStore } from "react";
import type { Site } from "@/data/content";

// ---------------------------------------------------------------------------
// States: intro(name) → heart → brain → liver
// ---------------------------------------------------------------------------

export type StateId = "intro" | "heart" | "brain" | "liver";

export interface StateDef {
  id: StateId;
  /** Content section this state opens in the panel; intro has none. */
  section: Site | null;
  label: string;
  /** Path to the baked .bin cloud; intro builds its cloud at runtime. */
  organFile: string | null;
}

/** Canonical ordered list of the four particle states. */
export const STATES: StateDef[] = [
  { id: "intro", section: null, label: "Mounish Mavuduru", organFile: null },
  { id: "heart", section: "projects", label: "Heart", organFile: "/organs/heart.bin" },
  { id: "brain", section: "achievements", label: "Brain", organFile: "/organs/brain.bin" },
  { id: "liver", section: "positions", label: "Liver", organFile: "/organs/liver.bin" },
];

// ---------------------------------------------------------------------------
// Reactive snapshot types
// ---------------------------------------------------------------------------

export interface PanelState {
  open: boolean;
  section: Site | null;
  anchor: { x: number; y: number } | null;
}

export interface PulseState {
  count: number;
  recent: { msg: string; ts: number }[];
  /** true when backed by KV; false when using the in-memory fallback. */
  persisted: boolean;
}

export interface SceneSnapshot {
  /** Integer active state index into STATES. */
  index: number;
  /** Continuous scroll progress, 0..STATES.length-1 (floats during morph). */
  progress: number;
  panel: PanelState;
  pulses: PulseState;
}

// ---------------------------------------------------------------------------
// Internal mutable state + listener set
// ---------------------------------------------------------------------------

const MAX_PROGRESS = STATES.length - 1;

function clampProgress(p: number): number {
  if (!Number.isFinite(p)) return 0;
  if (p < 0) return 0;
  if (p > MAX_PROGRESS) return MAX_PROGRESS;
  return p;
}

function clampIndex(i: number): number {
  if (!Number.isFinite(i)) return 0;
  const r = Math.round(i);
  if (r < 0) return 0;
  if (r > MAX_PROGRESS) return MAX_PROGRESS;
  return r;
}

// The single immutable snapshot served to React. Rebuilt only on change.
let snapshot: SceneSnapshot = Object.freeze({
  index: 0,
  progress: 0,
  panel: Object.freeze({ open: false, section: null, anchor: null }) as PanelState,
  pulses: Object.freeze({ count: 0, recent: [], persisted: false }) as PulseState,
});

// A frozen initial snapshot the server (and first client render) always sees.
const serverSnapshot: SceneSnapshot = snapshot;

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SceneSnapshot {
  return snapshot;
}

function getServerSnapshot(): SceneSnapshot {
  return serverSnapshot;
}

// ---------------------------------------------------------------------------
// Public reactive hook
// ---------------------------------------------------------------------------

/**
 * Subscribe to a slice of the scene snapshot. The snapshot identity is stable
 * between changes, so a selector returning primitives (or a sub-object that is
 * itself only rebuilt on change) will not cause render loops.
 */
export function useScene<T>(selector: (s: SceneSnapshot) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getSnapshot()),
    () => selector(getServerSnapshot()),
  );
}

// ---------------------------------------------------------------------------
// Actions — each mutates the snapshot (only if something changed) then notifies
// ---------------------------------------------------------------------------

export const sceneActions = {
  /** Set continuous progress (0..STATES.length-1); derives index = round(p). */
  setProgress(p: number): void {
    const progress = clampProgress(p);
    const index = clampIndex(progress);
    if (progress === snapshot.progress && index === snapshot.index) return;
    snapshot = Object.freeze({ ...snapshot, progress, index });
    emit();
  },

  /** Set the integer active state index (also snaps progress to it). */
  setIndex(i: number): void {
    const index = clampIndex(i);
    if (index === snapshot.index && index === snapshot.progress) return;
    snapshot = Object.freeze({ ...snapshot, index, progress: index });
    emit();
  },

  /** Open the section panel anchored at a click point. */
  openPanel(section: Site, anchor: { x: number; y: number }): void {
    const panel: PanelState = Object.freeze({
      open: true,
      section,
      anchor: Object.freeze({ x: anchor.x, y: anchor.y }),
    });
    snapshot = Object.freeze({ ...snapshot, panel });
    emit();
  },

  /** Close the section panel (keeps last section/anchor irrelevant: cleared). */
  closePanel(): void {
    if (!snapshot.panel.open) return;
    const panel: PanelState = Object.freeze({
      open: false,
      section: null,
      anchor: null,
    });
    snapshot = Object.freeze({ ...snapshot, panel });
    emit();
  },

  /** Replace the pulse state (count + recent + persisted flag). */
  setPulses(p: PulseState): void {
    const pulses: PulseState = Object.freeze({
      count: p.count,
      recent: Object.freeze([...p.recent]) as unknown as PulseState["recent"],
      persisted: p.persisted,
    });
    snapshot = Object.freeze({ ...snapshot, pulses });
    emit();
  },
};

// ---------------------------------------------------------------------------
// Non-reactive high-frequency pointer channel
// ---------------------------------------------------------------------------

/**
 * Mutable pointer channel — the single source of truth for cursor state,
 * written by PointerBridge and read inside rAF loops. Mutating these fields
 * MUST NOT trigger React renders; do not wrap this in state.
 *
 *  x, y   — clientX/clientY in CSS px
 *  nx, ny — normalized 0..1 across the viewport
 *  vx, vy — smoothed velocity in px/sec
 *  down   — primary pointer button held
 *  overEkg— pointer is within the top EKG band
 *  t      — last update timestamp (performance.now())
 */
export const pointer: {
  x: number;
  y: number;
  vx: number;
  vy: number;
  nx: number;
  ny: number;
  down: boolean;
  overEkg: boolean;
  t: number;
} = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  nx: 0.5,
  ny: 0.5,
  down: false,
  overEkg: false,
  t: 0,
};
