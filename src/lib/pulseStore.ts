/**
 * Server-only pulse store.
 *
 * A persistent global "pulse" counter plus a short guestbook of recent
 * messages. Backed by Upstash Redis over its REST API (the same env vars
 * Vercel KV provisions: KV_REST_API_URL + KV_REST_API_TOKEN). When those env
 * vars are absent — local dev without KV, or a preview without the binding —
 * it falls back to a process-local in-memory store and reports persisted:false.
 *
 * Contract:
 *   getPulses(): Promise<PulseState>
 *   addPulse(msg): Promise<PulseState>
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
const LIST_KEY = "pulse:list";
const LIST_CAP = 49; // keep newest 50 entries (indices 0..49)
const RECENT_SHOWN = 8; // surface the newest 8 to clients
const MSG_MAX = 80;

interface RecentEntry {
  msg: string;
  ts: number;
}

// ---------------------------------------------------------------------------
// In-memory fallback (module-level; survives across requests in one process)
// ---------------------------------------------------------------------------

const memory: { count: number; list: RecentEntry[] } = {
  count: 0,
  list: [],
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

/**
 * Sanitize a guestbook message: trim, strip control characters, cap length.
 * Returns null when the result is empty (caller should reject).
 */
function sanitize(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Drop control characters (NUL..US, DEL, C1) then collapse whitespace so a
  // pasted newline/tab can't break the single-line readout.
  const cleaned = raw
    .replace(/[\x00-\x1f\x7f-\x9f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, MSG_MAX) : null;
}

function buildState(
  count: number,
  recent: RecentEntry[],
  persisted: boolean,
): PulseState {
  return {
    count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
    recent: recent.slice(0, RECENT_SHOWN),
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

/** Parse an LRANGE result of JSON-encoded entries into RecentEntry[]. */
function parseList(raw: unknown): RecentEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentEntry[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    try {
      const parsed = JSON.parse(item) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as RecentEntry).msg === "string"
      ) {
        const ts = (parsed as RecentEntry).ts;
        out.push({
          msg: (parsed as RecentEntry).msg,
          ts: typeof ts === "number" && Number.isFinite(ts) ? ts : Date.now(),
        });
      }
    } catch {
      // skip malformed entry
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read the current pulse count and newest guestbook entries. */
export async function getPulses(): Promise<PulseState> {
  const creds = env();
  if (!creds) {
    return buildState(memory.count, memory.list, false);
  }

  const results = await pipeline(creds, [
    ["GET", COUNT_KEY],
    ["LRANGE", LIST_KEY, 0, RECENT_SHOWN - 1],
  ]);

  if (!results) {
    // REST hiccup — degrade to whatever this process has seen.
    return buildState(memory.count, memory.list, false);
  }

  const count = Number(results[0] ?? 0);
  const recent = parseList(results[1]);
  return buildState(count, recent, true);
}

/**
 * Record a pulse: increment the global counter and prepend the message to the
 * guestbook (trimmed to LIST_CAP). Returns the refreshed state. Rejected
 * (empty/invalid) messages just return the current state unchanged.
 */
export async function addPulse(msg: string): Promise<PulseState> {
  const clean = sanitize(msg);
  if (!clean) {
    return getPulses();
  }

  const entry: RecentEntry = { msg: clean, ts: Date.now() };
  const creds = env();

  if (!creds) {
    memory.count += 1;
    memory.list.unshift(entry);
    if (memory.list.length > LIST_CAP + 1) {
      memory.list.length = LIST_CAP + 1;
    }
    return buildState(memory.count, memory.list, false);
  }

  const results = await pipeline(creds, [
    ["INCR", COUNT_KEY],
    ["LPUSH", LIST_KEY, JSON.stringify(entry)],
    ["LTRIM", LIST_KEY, 0, LIST_CAP],
    ["LRANGE", LIST_KEY, 0, RECENT_SHOWN - 1],
  ]);

  if (!results) {
    // Persisting failed; reflect the write locally so the UI still advances.
    memory.count += 1;
    memory.list.unshift(entry);
    if (memory.list.length > LIST_CAP + 1) {
      memory.list.length = LIST_CAP + 1;
    }
    return buildState(memory.count, memory.list, false);
  }

  const count = Number(results[0] ?? 0);
  const recent = parseList(results[3]);
  return buildState(count, recent, true);
}
