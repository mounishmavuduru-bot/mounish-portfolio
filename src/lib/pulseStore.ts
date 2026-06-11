/**
 * Server-only pulse store.
 *
 * A persistent global "pulse" counter — a bare number, incremented per
 * visit/beat. The logbook is closed: no visitor messages are stored or
 * returned. `recent` stays in the PulseState shape for client compatibility
 * but is always an empty list.
 *
 * Backed by Upstash Redis over its REST API (the same env vars Vercel KV
 * provisions: KV_REST_API_URL + KV_REST_API_TOKEN). When those env vars are
 * absent — local dev without KV, or a preview without the binding — it falls
 * back to a process-local in-memory counter and reports persisted:false.
 *
 * Contract:
 *   getPulses(): Promise<PulseState>
 *   addPulse(): Promise<PulseState>
 * Neither ever throws to the caller; REST failures degrade to the in-memory
 * snapshot so the UI always gets a usable answer.
 *
 * This module must only ever be imported from server code (route handlers).
 */

// NOTE: server-only module. It reads KV_REST_API_TOKEN from process.env, which
// is only present in the Node runtime, and is imported exclusively by the
// /api/pulse and /api/console route handlers. Do not import it from any
// "use client" component (the `server-only` package isn't available here, so
// this is enforced by convention rather than the build).
import type { PulseState } from "@/lib/sceneStore";

const COUNT_KEY = "pulse:count";

// ---------------------------------------------------------------------------
// In-memory fallback (module-level; survives across requests in one process)
// ---------------------------------------------------------------------------

const memory: { count: number } = {
  count: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function env(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function buildState(count: number, persisted: boolean): PulseState {
  return {
    count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
    // The logbook is closed — no visitor-authored text is ever returned.
    recent: [],
    persisted,
  };
}

// ---------------------------------------------------------------------------
// Upstash REST pipeline
// ---------------------------------------------------------------------------

type Cmd = (string | number)[];

/**
 * Run a pipeline of Redis commands against Upstash REST. Returns the array of
 * per-command results, or null on any failure (network, auth, non-2xx, shape).
 */
async function pipeline(
  creds: { url: string; token: string },
  cmds: Cmd[],
): Promise<unknown[] | null> {
  try {
    const res = await fetch(`${creds.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmds),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return null;
    // Upstash returns [{ result }, { error }, ...]; surface results, null on error.
    return data.map((entry) => {
      if (entry && typeof entry === "object" && "result" in entry) {
        return (entry as { result: unknown }).result;
      }
      return null;
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read the current pulse count. `recent` is always empty. */
export async function getPulses(): Promise<PulseState> {
  const creds = env();
  if (!creds) {
    return buildState(memory.count, false);
  }

  const results = await pipeline(creds, [["GET", COUNT_KEY]]);

  if (!results) {
    // REST hiccup — degrade to whatever this process has seen.
    return buildState(memory.count, false);
  }

  const count = Number(results[0] ?? 0);
  return buildState(count, true);
}

/**
 * Record a pulse: increment the global counter. No message is accepted or
 * stored (the logbook is closed). Returns the refreshed state.
 */
export async function addPulse(): Promise<PulseState> {
  const creds = env();

  if (!creds) {
    memory.count += 1;
    return buildState(memory.count, false);
  }

  const results = await pipeline(creds, [["INCR", COUNT_KEY]]);

  if (!results) {
    // Persisting failed; reflect the write locally so the UI still advances.
    memory.count += 1;
    return buildState(memory.count, false);
  }

  const count = Number(results[0] ?? 0);
  return buildState(count, true);
}
