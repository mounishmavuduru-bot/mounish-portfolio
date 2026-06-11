/**
 * /api/pulse — the global pulse counter + guestbook.
 *
 *   GET            → current PulseState as JSON
 *   POST { msg }   → record a pulse, returns the refreshed PulseState
 *
 * Backed by pulseStore (Upstash KV with an in-memory fallback). The store
 * never throws, so these handlers stay simple and always return 200 with a
 * usable body.
 */

import { getPulses, addPulse } from "@/lib/pulseStore";

export const runtime = "nodejs";
// Counter state is request-specific; never prerender/cache.
export const dynamic = "force-dynamic";

const MAX_BODY = 2_048; // bytes — a guestbook line is tiny; reject anything large.

export async function GET(): Promise<Response> {
  const state = await getPulses();
  return Response.json(state);
}

export async function POST(request: Request): Promise<Response> {
  // Guard against oversized bodies before parsing.
  const len = request.headers.get("content-length");
  if (len && Number(len) > MAX_BODY) {
    return Response.json({ error: "payload too large" }, { status: 413 });
  }

  let msg = "";
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) {
      return Response.json({ error: "payload too large" }, { status: 413 });
    }
    if (raw) {
      const body = JSON.parse(raw) as unknown;
      if (body && typeof body === "object" && "msg" in body) {
        const m = (body as { msg: unknown }).msg;
        if (typeof m === "string") msg = m;
      }
    }
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (!msg.trim()) {
    return Response.json({ error: "empty message" }, { status: 400 });
  }

  // addPulse sanitizes + caps the message and never throws.
  const state = await addPulse(msg);
  return Response.json(state);
}
