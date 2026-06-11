/**
 * /api/contact — the contact-form backend (5th "contact" state overlay).
 *
 *   POST { name, email, message, website?, t? }
 *     → { ok: true }                      on success
 *     → 400 { error }                     on validation / honeypot / timing fail
 *   GET → { count }                       lifetime submission count only
 *
 * Spam defences, cheapest-first:
 *   1. honeypot  — a hidden "website" field; bots fill it, humans never see it.
 *   2. timing    — `t` is the form's mount timestamp; a submission faster than
 *                  MIN_FILL_MS almost certainly came from a script.
 *   3. validation— email shape, message length, name length.
 *
 * To avoid handing spammers a probing oracle, every rejection returns the same
 * generic message. Stored messages are NEVER echoed back; GET exposes the count
 * only. No env/secrets are ever exposed. The store never throws.
 */

import { addContact, getContactCount } from "@/lib/contactStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 8_192; // bytes — name+email+1000-char message fits comfortably.
const NAME_MAX = 80;
const EMAIL_MAX = 254;
const MSG_MIN = 1;
const MSG_MAX = 1000;
const MIN_FILL_MS = 1_500; // a human can't read + fill the form faster than this.

// Pragmatic email check: one @, a dotted domain, no whitespace. Deliberately
// lenient — the goal is to reject obvious junk, not to police RFC 5322.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GENERIC_ERROR = "could not send your message. please check the fields and try again.";

interface ContactBody {
  name?: unknown;
  email?: unknown;
  message?: unknown;
  website?: unknown; // honeypot
  t?: unknown; // form mount timestamp (ms epoch)
}

/** Parse + size-guard the request body. Returns null on malformed/oversized. */
async function readBody(request: Request): Promise<ContactBody | null> {
  const len = request.headers.get("content-length");
  if (len && Number(len) > MAX_BODY) return null;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return null;
    if (!raw) return {};
    const body = JSON.parse(raw) as unknown;
    if (!body || typeof body !== "object") return null;
    return body as ContactBody;
  } catch {
    return null;
  }
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request);
  if (body === null) {
    return Response.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  // 1) Honeypot — any value in `website` means a bot. Pretend nothing is wrong
  //    (200 ok) so the bot doesn't learn the field is a trap; do NOT store.
  const honeypot = asString(body.website).trim();
  if (honeypot) {
    return Response.json({ ok: true });
  }

  // 2) Timing guard — submissions faster than MIN_FILL_MS are scripted.
  const mountedAt = Number(body.t);
  if (Number.isFinite(mountedAt) && mountedAt > 0) {
    const elapsed = Date.now() - mountedAt;
    // elapsed < 0 means a clock-skewed / forged timestamp; treat as suspicious.
    if (elapsed < MIN_FILL_MS) {
      return Response.json({ error: GENERIC_ERROR }, { status: 400 });
    }
  }

  // 3) Validation.
  const name = asString(body.name).trim();
  const email = asString(body.email).trim();
  const message = asString(body.message).trim();

  if (name.length > NAME_MAX) {
    return Response.json({ error: GENERIC_ERROR }, { status: 400 });
  }
  if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    return Response.json({ error: GENERIC_ERROR }, { status: 400 });
  }
  if (message.length < MSG_MIN || message.length > MSG_MAX) {
    return Response.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  // Store (store re-sanitises defensively; never throws).
  const { ok } = await addContact({ name, email, message });
  if (!ok) {
    return Response.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  return Response.json({ ok: true });
}

export async function GET(): Promise<Response> {
  const count = await getContactCount();
  return Response.json({ count });
}
