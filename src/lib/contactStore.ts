/**
 * Server-only contact store.
 *
 * Persists contact-form submissions from the contact state's overlay. Backed by
 * Upstash Redis over its REST API (the same env vars Vercel KV provisions:
 * KV_REST_API_URL + KV_REST_API_TOKEN). When those env vars are absent — local
 * dev without KV, or a preview without the binding — it falls back to a
 * process-local in-memory store.
 *
 * Storage shape (mirrors the pulse store's conventions):
 *   LPUSH contact:msgs <json {name,email,message,ts}>
 *   LTRIM contact:msgs 0 199        (keep newest 200)
 *   INCR  contact:count             (lifetime submission counter)
 *
 * Contract:
 *   addContact({name,email,message}): Promise<{ ok: boolean }>
 *   getContactCount(): Promise<number>
 * Neither ever throws to the caller; REST failures degrade to the in-memory
 * fallback so the API route always returns a usable answer. Stored messages are
 * NEVER read back out to the public — only the count is exposed.
 *
 * This module must only ever be imported from server code (route handlers).
 */

// NOTE: server-only module. It reads KV_REST_API_TOKEN from process.env, which
// is only present in the Node runtime, and is imported exclusively by the
// /api/contact route handler. Do not import it from any "use client" component.

const COUNT_KEY = "contact:count";
const LIST_KEY = "contact:msgs";
const LIST_CAP = 199; // keep newest 200 entries (indices 0..199)

// Sanitisation caps — mirror the client-side validation so a crafted request
// can never store anything larger than intended.
const NAME_MAX = 80;
const EMAIL_MAX = 254; // RFC 5321 practical maximum
const MSG_MAX = 1000;

export interface ContactInput {
  name: string;
  email: string;
  message: string;
}

interface StoredContact {
  name: string;
  email: string;
  message: string;
  ts: number;
}

// ---------------------------------------------------------------------------
// In-memory fallback (module-level; survives across requests in one process)
// ---------------------------------------------------------------------------

const memory: { count: number; list: StoredContact[] } = {
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
 * Sanitize a single field: coerce to string, strip control characters, collapse
 * internal whitespace, trim, then cap to `max`. Returns "" for non-strings so
 * callers can decide whether an empty result is acceptable.
 */
function clean(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw
    // Drop C0 controls (NUL..US, DEL) and C1 controls so a pasted newline/tab
    // can't smuggle structure into the stored record.
    .replace(/[\x00-\x1f\x7f-\x9f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, max);
}

/**
 * Sanitize the message specifically: strip control chars EXCEPT newlines (a
 * message body may legitimately span lines), collapse runs of blank lines, trim,
 * then cap.
 */
function cleanMessage(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw
    .replace(/\r\n?/g, "\n")
    // Drop control chars except \n; keep tabs collapsed to spaces.
    .replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]+/g, " ")
    // Collapse 3+ newlines down to a double newline (paragraph break).
    .replace(/\n{3,}/g, "\n\n")
    // Collapse runs of spaces/tabs (not newlines).
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return cleaned.slice(0, max);
}

// ---------------------------------------------------------------------------
// Upstash REST pipeline (identical transport pattern to pulseStore)
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

/**
 * Store a contact submission. Sanitizes every field, then persists via Upstash
 * (with an in-memory fallback). Returns { ok } — true when the record was
 * accepted (it always is, given non-empty fields), false only when the input is
 * unusable after sanitisation. Never throws.
 */
export async function addContact(input: ContactInput): Promise<{ ok: boolean }> {
  const name = clean(input?.name, NAME_MAX);
  const email = clean(input?.email, EMAIL_MAX);
  const message = cleanMessage(input?.message, MSG_MAX);

  // A submission needs at least an email (so a reply is possible) and a message.
  if (!email || !message) {
    return { ok: false };
  }

  const entry: StoredContact = {
    name,
    email,
    message,
    ts: Date.now(),
  };

  const creds = env();

  if (!creds) {
    memory.count += 1;
    memory.list.unshift(entry);
    if (memory.list.length > LIST_CAP + 1) {
      memory.list.length = LIST_CAP + 1;
    }
    return { ok: true };
  }

  const results = await pipeline(creds, [
    ["LPUSH", LIST_KEY, JSON.stringify(entry)],
    ["LTRIM", LIST_KEY, 0, LIST_CAP],
    ["INCR", COUNT_KEY],
  ]);

  if (!results) {
    // Persisting failed; reflect the write locally so the submission isn't lost
    // within this process and the caller still sees success.
    memory.count += 1;
    memory.list.unshift(entry);
    if (memory.list.length > LIST_CAP + 1) {
      memory.list.length = LIST_CAP + 1;
    }
    return { ok: true };
  }

  return { ok: true };
}

/**
 * Read the lifetime submission count. Never exposes message bodies. Returns 0 on
 * any failure. Optional convenience for a GET on /api/contact.
 */
export async function getContactCount(): Promise<number> {
  const creds = env();
  if (!creds) {
    return memory.count;
  }

  const results = await pipeline(creds, [["GET", COUNT_KEY]]);
  if (!results) {
    return memory.count;
  }

  const count = Number(results[0] ?? 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}
