/**
 * Build a particle cloud that spells `text` in 3D letters.
 *
 * The text is rendered to an offscreen 2D canvas in the atlas display serif
 * (Spectral), its opaque pixels are sampled, and those pixel coords are mapped
 * to a centered world-space XY plane scaled so the text block is ≈ `worldHeight`
 * tall. Each point gets a small random Z so the letters read as a 3D slab rather
 * than a flat sheet.
 *
 * Client-only (needs document/canvas). Determinism is not required. Never throws
 * — on any failure (no canvas context, zero opaque pixels) it returns a small
 * fallback grid of exactly `count` points so the caller always gets a usable
 * Float32Array of length count*3.
 *
 * Call after `document.fonts.ready` so the display font is loaded, and rebuild
 * on resize if the world scale changes.
 */

const FALLBACK_FONTS = "'Spectral', Georgia, 'Times New Roman', serif";

/** Build a centered count×3 grid roughly worldHeight tall — used as fallback. */
function fallbackGrid(count: number, worldHeight: number): Float32Array {
  const out = new Float32Array(count * 3);
  // A wide-ish rectangle (name aspect ~ 6:1) tiled into a near-square grid.
  const aspect = 6;
  const rows = Math.max(1, Math.round(Math.sqrt(count / aspect)));
  const cols = Math.max(1, Math.ceil(count / rows));
  const h = worldHeight;
  const w = h * aspect;
  const depth = 0.25 * (worldHeight / 3);
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const u = cols > 1 ? c / (cols - 1) : 0.5; // 0..1
    const v = rows > 1 ? r / (rows - 1) : 0.5; // 0..1
    out[i * 3] = (u - 0.5) * w;
    out[i * 3 + 1] = (0.5 - v) * h;
    out[i * 3 + 2] = (Math.random() * 2 - 1) * depth;
  }
  return out;
}

export function buildNameCloud(
  text: string,
  count: number,
  worldHeight: number,
): Float32Array {
  if (count <= 0) return new Float32Array(0);

  // Guard against non-browser contexts.
  if (typeof document === "undefined") {
    return fallbackGrid(count, worldHeight);
  }

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null;
  try {
    canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  } catch {
    return fallbackGrid(count, worldHeight);
  }
  if (!ctx) return fallbackGrid(count, worldHeight);

  // Render at a generous height so glyph edges sample densely. The canvas
  // height is fixed; width is measured from the text and padded.
  const fontPx = 220;
  const padX = Math.round(fontPx * 0.4);
  const padY = Math.round(fontPx * 0.35);

  ctx.font = `700 ${fontPx}px ${FALLBACK_FONTS}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  let metrics: TextMetrics;
  try {
    metrics = ctx.measureText(text);
  } catch {
    return fallbackGrid(count, worldHeight);
  }

  const textW = Math.max(1, Math.ceil(metrics.width));
  // Use font ascent/descent when available; fall back to the em box.
  const ascent =
    (metrics.actualBoundingBoxAscent as number | undefined) ?? fontPx * 0.8;
  const descent =
    (metrics.actualBoundingBoxDescent as number | undefined) ?? fontPx * 0.2;
  const textH = Math.max(1, Math.ceil(ascent + descent));

  const cw = textW + padX * 2;
  const ch = textH + padY * 2;
  canvas.width = cw;
  canvas.height = ch;

  // Re-set context state (resizing the canvas clears it).
  ctx.font = `700 ${fontPx}px ${FALLBACK_FONTS}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, padX, padY + ascent);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, cw, ch).data;
  } catch {
    return fallbackGrid(count, worldHeight);
  }

  // Collect opaque pixel coordinates (alpha > threshold).
  const alphaThreshold = 128;
  const px: number[] = [];
  const py: number[] = [];
  for (let y = 0; y < ch; y++) {
    const row = y * cw * 4;
    for (let x = 0; x < cw; x++) {
      if (data[row + x * 4 + 3] > alphaThreshold) {
        px.push(x);
        py.push(y);
      }
    }
  }

  const opaque = px.length;
  if (opaque === 0) {
    return fallbackGrid(count, worldHeight);
  }

  // World scaling: map pixel height -> worldHeight, preserve aspect.
  const scale = worldHeight / ch;
  const depth = 0.25 * scale * ch; // ≈ 0.25 * worldHeight, in world units
  const halfW = (cw * scale) / 2;
  const halfH = (ch * scale) / 2;

  const out = new Float32Array(count * 3);

  const writePoint = (i: number, sx: number, sy: number, jitter: boolean) => {
    // jitter spreads resampled duplicates by a sub-pixel amount so the cloud
    // doesn't stack points exactly on top of each other.
    const jx = jitter ? (Math.random() - 0.5) * 1.5 : 0;
    const jy = jitter ? (Math.random() - 0.5) * 1.5 : 0;
    // Canvas Y is top-down; world Y is up. Center both axes.
    out[i * 3] = (sx + jx) * scale - halfW;
    out[i * 3 + 1] = halfH - (sy + jy) * scale;
    out[i * 3 + 2] = (Math.random() * 2 - 1) * depth;
  };

  if (opaque >= count) {
    // More opaque pixels than needed: take a representative evenly-spaced
    // subset by striding through the (scanline-ordered) pixel list.
    const stride = opaque / count;
    for (let i = 0; i < count; i++) {
      const idx = Math.min(opaque - 1, Math.floor(i * stride));
      writePoint(i, px[idx], py[idx], false);
    }
  } else {
    // Fewer opaque pixels than needed: use every pixel once, then resample
    // with jitter to reach exactly `count`.
    for (let i = 0; i < opaque; i++) {
      writePoint(i, px[i], py[i], false);
    }
    for (let i = opaque; i < count; i++) {
      const idx = i % opaque;
      writePoint(i, px[idx], py[idx], true);
    }
  }

  return out;
}

/**
 * Build a particle cloud in the shape of a LETTER SHEET — a portrait paper
 * page: a strong rectangular border with five horizontal ruled lines inside,
 * drawn in thick strokes on an offscreen
 * canvas. The opaque pixels are sampled and resampled to EXACTLY `count`
 * points, centered and scaled so the sheet is ≈ `worldHeight` tall, with a
 * small ±Z depth so it reads as engraved stipple rather than a flat plate.
 *
 * Used by the 5th "contact" state (clouds[4]) — the dots conjoin into the
 * sheet that the DOM contact form then sharpens out of. Client-only (needs
 * canvas) but, like buildNameCloud, NEVER throws — any failure falls back to a
 * centered grid of exactly `count` points, so the caller always gets a
 * Float32Array of length count*3.
 */
export function buildLetterCloud(
  count: number,
  worldHeight: number,
): Float32Array {
  if (count <= 0) return new Float32Array(0);

  if (typeof document === "undefined") {
    return fallbackGrid(count, worldHeight);
  }

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null;
  try {
    canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  } catch {
    return fallbackGrid(count, worldHeight);
  }
  if (!ctx) return fallbackGrid(count, worldHeight);

  // A portrait sheet (~A4-ish aspect). Generous resolution so strokes sample
  // densely along their length.
  const cw = 640;
  const ch = 880;
  canvas.width = cw;
  canvas.height = ch;

  // Inset the sheet from the canvas edges so thick strokes don't clip.
  const m = 70;
  const left = m;
  const right = cw - m;
  const top = m;
  const bottom = ch - m;

  try {
    ctx.clearRect(0, 0, cw, ch);
    ctx.strokeStyle = "#ffffff";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Sheet outline — the strongest stroke, so the page edge reads as the
    // densest band of points.
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(right, top);
    ctx.lineTo(right, bottom);
    ctx.lineTo(left, bottom);
    ctx.closePath();
    ctx.stroke();

    // Five horizontal ruled lines — the writing area.
    // Thinner than the border so the page edge stays dominant.
    const ruleInset = 56;
    const ruleTop = top + 220;
    const ruleGap = 100;
    ctx.lineWidth = 9;
    ctx.beginPath();
    for (let r = 0; r < 5; r++) {
      const y = ruleTop + r * ruleGap;
      ctx.moveTo(left + ruleInset, y);
      ctx.lineTo(right - ruleInset, y);
    }
    ctx.stroke();
  } catch {
    return fallbackGrid(count, worldHeight);
  }

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, cw, ch).data;
  } catch {
    return fallbackGrid(count, worldHeight);
  }

  const alphaThreshold = 128;
  const px: number[] = [];
  const py: number[] = [];
  for (let y = 0; y < ch; y++) {
    const row = y * cw * 4;
    for (let x = 0; x < cw; x++) {
      if (data[row + x * 4 + 3] > alphaThreshold) {
        px.push(x);
        py.push(y);
      }
    }
  }

  const opaque = px.length;
  if (opaque === 0) {
    return fallbackGrid(count, worldHeight);
  }

  // Scale by HEIGHT so the sheet is ≈ worldHeight tall; preserve aspect.
  const scale = worldHeight / ch;
  const depth = 0.08 * worldHeight; // small ±Z depth
  const halfW = (cw * scale) / 2;
  const halfH = (ch * scale) / 2;

  const out = new Float32Array(count * 3);

  const writePoint = (i: number, sx: number, sy: number, jitter: boolean) => {
    const jx = jitter ? (Math.random() - 0.5) * 1.5 : 0;
    const jy = jitter ? (Math.random() - 0.5) * 1.5 : 0;
    // Canvas Y is top-down; world Y is up. Center both axes.
    out[i * 3] = (sx + jx) * scale - halfW;
    out[i * 3 + 1] = halfH - (sy + jy) * scale;
    out[i * 3 + 2] = (Math.random() * 2 - 1) * depth;
  };

  if (opaque >= count) {
    const stride = opaque / count;
    for (let i = 0; i < count; i++) {
      const idx = Math.min(opaque - 1, Math.floor(i * stride));
      writePoint(i, px[idx], py[idx], false);
    }
  } else {
    for (let i = 0; i < opaque; i++) {
      writePoint(i, px[i], py[i], false);
    }
    for (let i = opaque; i < count; i++) {
      const idx = i % opaque;
      writePoint(i, px[idx], py[idx], true);
    }
  }

  return out;
}

/**
 * Back-compat alias: the contact state used to be an envelope; it is now the
 * letter sheet. Kept so any older import keeps working.
 */
export const buildEnvelopeCloud = buildLetterCloud;
