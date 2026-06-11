/**
 * Organ point-cloud data: definitions and the streamed loader.
 *
 * Each organ is a baked Float32Array (x,y,z interleaved) of length
 * BAKED_COUNT * 3, centered at origin with its longest axis normalized to 1.0
 * and points pre-shuffled so any prefix is a representative subset. Loading
 * fetches the .bin, takes a prefix, and scales every coord by ORGAN_WORLD so the
 * specimen fills the viewport.
 */

import type { Site } from "@/data/content";

/** Points baked into every .bin file (per-organ). */
export const BAKED_COUNT = 30000;
/** Reduced count used on mobile (prefix slice of the baked cloud). */
export const MOBILE_COUNT = 15000;
/** Longest axis in world units after load-scale (large / immersive). */
export const ORGAN_WORLD = 9.0;

export interface OrganDef {
  id: "heart" | "brain" | "liver";
  section: Site;
  label: string;
  file: string;
}

/** Scroll order: heart → brain → liver, each bound to a content section. */
export const ORGANS: OrganDef[] = [
  { id: "heart", section: "projects", label: "Heart", file: "/organs/heart.bin" },
  {
    id: "brain",
    section: "achievements",
    label: "Brain",
    file: "/organs/brain.bin",
  },
  { id: "liver", section: "positions", label: "Liver", file: "/organs/liver.bin" },
];

/**
 * Fetch an organ .bin, streaming the body so progress can be reported, then
 * return the first `count` points scaled to world units.
 *
 * - Streams via `response.body.getReader()`, using the Content-Length header for
 *   exact progress. If the header is missing, progress creeps toward ~90% while
 *   reading and snaps to 100% when the stream ends.
 * - Interprets the bytes as a little-endian Float32Array, takes the prefix of
 *   `count * 3` floats (prefix is representative), and multiplies every
 *   coordinate by ORGAN_WORLD.
 * - Throws a descriptive Error on a non-OK response, an empty body, or a file
 *   too small for the requested count so the caller's retry UI can surface it.
 */
export async function loadOrganCloud(
  file: string,
  count: number,
  onProgress?: (pct: number) => void,
): Promise<Float32Array> {
  const needFloats = count * 3;
  const needBytes = needFloats * 4;

  const res = await fetch(file);
  if (!res.ok) {
    throw new Error(`Failed to load ${file}: ${res.status} ${res.statusText}`);
  }
  if (!res.body) {
    throw new Error(`Failed to load ${file}: response had no body`);
  }

  const lengthHeader = res.headers.get("content-length");
  const total = lengthHeader ? parseInt(lengthHeader, 10) : 0;
  const haveTotal = Number.isFinite(total) && total > 0;

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let creep = 0;

  onProgress?.(0);

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (haveTotal) {
        // Cap at 99 until the stream actually ends.
        const pct = Math.min(99, Math.floor((received / total) * 100));
        onProgress?.(pct);
      } else {
        // No total: creep asymptotically toward 90.
        creep += (90 - creep) * 0.15;
        onProgress?.(Math.floor(creep));
      }
    }
  }

  // Concatenate chunks into one contiguous buffer.
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  if (received === 0) {
    throw new Error(`Failed to load ${file}: empty response`);
  }
  if (received < needBytes) {
    throw new Error(
      `Failed to load ${file}: expected at least ${needBytes} bytes ` +
        `for ${count} points, got ${received}`,
    );
  }

  // Interpret as Float32 and copy the representative prefix.
  // Slice the byte buffer to a multiple of 4 so the Float32Array view is valid
  // even if the body carried trailing bytes, and copy out an owned array.
  const usableFloats = Math.floor(received / 4);
  const floatView = new Float32Array(
    bytes.buffer,
    bytes.byteOffset,
    usableFloats,
  );

  const out = new Float32Array(needFloats);
  for (let i = 0; i < needFloats; i++) {
    out[i] = floatView[i] * ORGAN_WORLD;
  }

  onProgress?.(100);
  return out;
}
