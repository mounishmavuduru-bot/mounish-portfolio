/**
 * /api/pulse — the global pulse counter.
 *
 *   GET    → current PulseState as JSON (count only; recent is always [])
 *   POST   → increment the counter, returns the refreshed PulseState
 *
 * The logbook is closed: POST no longer accepts or stores messages — any
 * request body is ignored entirely. Backed by pulseStore (Upstash KV with an
 * in-memory fallback). The store never throws, so these handlers stay simple
 * and always return 200 with a usable body.
 */

import { getPulses, addPulse } from "@/lib/pulseStore";

export const runtime = "nodejs";
// Counter state is request-specific; never prerender/cache.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const state = await getPulses();
  return Response.json(state);
}

export async function POST(): Promise<Response> {
  // Bare increment — the request body, if any, is never read or stored.
  const state = await addPulse();
  return Response.json(state);
}
