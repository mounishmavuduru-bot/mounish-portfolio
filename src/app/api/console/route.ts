/**
 * /api/console — the CHART station's ORDERS backend.
 *
 *   POST { cmd }   → { lines: string[], ekg?: EkgEvent }
 *   GET  ?cmd=...  → { lines: string[], ekg?: EkgEvent }  (convenience)
 *
 * Stateless except for the `pulse` / `sign` (alias `leave`) commands, which
 * read/write the persistent pulse store. Everything else is built from
 * content.ts. The optional `ekg` field is a fire-and-forget EKG effect the
 * client forwards to emitEkg() so an order can jolt the rhythm strip — the
 * easter eggs ("code blue", "defib", "tachy", …) live here. Unknown commands
 * return a helpful line. No env/secrets are ever exposed.
 */

import {
  GITHUB,
  LINKEDIN,
  EMAIL,
  TAGLINE,
  projects,
  awards,
  positions,
} from "@/data/content";
import { getPulses, addPulse } from "@/lib/pulseStore";
import type { EkgEvent } from "@/lib/sceneStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 2_048;
const MAX_CMD = 200;

/** A command result: lines to print, plus an optional EKG effect to emit. */
interface CmdResult {
  lines: string[];
  ekg?: EkgEvent;
}

const HELP_LINES: string[] = [
  "orders — available commands:",
  "  help          this list",
  "  whoami        who is mounish",
  "  projects      selected projects + research",
  "  achievements  awards and honors",
  "  positions     roles held",
  "  contact       github, linkedin, email",
  "  pulse         live global pulse count",
  "  sign <msg>    sign the logbook (adds a pulse)",
  "  auscultate    listen to the current specimen",
  "  order <x>     place a standing order",
  "  clear         clear the chart notes",
];

function projectsLines(): string[] {
  const lines = ["projects:"];
  for (const p of projects) lines.push(`  ${p.name} — ${p.tag}`);
  return lines;
}

function achievementsLines(): string[] {
  const lines = ["achievements:"];
  for (const a of awards) lines.push(`  ${a.name} — ${a.org}`);
  return lines;
}

function positionsLines(): string[] {
  const lines = ["positions:"];
  for (const p of positions) {
    lines.push(`  ${p.role}${p.org ? ` — ${p.org}` : ""}`);
  }
  return lines;
}

function contactLines(): string[] {
  return [
    "contact:",
    `  github    ${GITHUB}`,
    `  linkedin  ${LINKEDIN}`,
    `  email     ${EMAIL}`,
  ];
}

function whoamiLines(): string[] {
  return [
    "mounish mavuduru",
    TAGLINE.toLowerCase(),
    "type 'projects', 'achievements', 'positions' or 'contact' for more.",
  ];
}

/**
 * Auscultation notes — points of interest, a couple tied to real work. Mirrors
 * the chart's auscultation tab so the order line and the tab agree. Content is
 * derived from content.ts where it references real projects/research.
 */
function auscultateLines(): string[] {
  const heart = projects[0]?.name ?? "the work";
  const research = projects[1]?.name ?? "the research";
  return [
    "auscultation — notable points:",
    `  apex     a steady drive — ${heart}.`,
    `  base     ongoing inquiry — ${research}.`,
    "  margin   a surgeon's hands, still in training.",
    "  (open the auscultation tab to listen point by point.)",
  ];
}

async function pulseLines(): Promise<string[]> {
  const state = await getPulses();
  const lines = [
    `pulse count: ${state.count}`,
    state.persisted ? "store: persistent" : "store: in-memory (not persisted)",
  ];
  if (state.recent.length) {
    lines.push("recent signatures:");
    for (const r of state.recent) lines.push(`  ${r.msg}`);
  }
  return lines;
}

async function signLines(message: string): Promise<string[]> {
  const msg = message.trim();
  if (!msg) {
    return ["usage: sign <message>"];
  }
  const state = await addPulse(msg);
  return [
    "signed the logbook.",
    `pulse count: ${state.count}`,
    state.persisted ? "store: persistent" : "store: in-memory (not persisted)",
  ];
}

function orderLines(what: string): string[] {
  const item = what.trim();
  if (!item) {
    return [
      "usage: order <x>",
      "try: order coffee, order labs, order consult, order rest",
    ];
  }
  const key = item.toLowerCase();
  const canned: Record<string, string> = {
    coffee: "order placed: one coffee, stat. the on-call thanks you.",
    labs: "order placed: routine labs drawn; results pending.",
    consult: "order placed: cardiothoracic consult requested.",
    rest: "order placed: rest and reassess. wise.",
    "stat dose": "order placed: stat dose charted.",
  };
  return [canned[key] ?? `order placed: ${item}. noted in the chart.`];
}

const SUDO_REFUSAL =
  "nice try. this chart has no root — try 'help' instead.";

/**
 * Resolve a raw command string to its lines + optional EKG effect. `clear` is a
 * client-side sentinel: the UI clears the chart notes on seeing the marker.
 */
async function run(rawCmd: string): Promise<CmdResult> {
  const cmd = rawCmd.trim().slice(0, MAX_CMD);
  if (!cmd) return { lines: HELP_LINES };

  const lower = cmd.toLowerCase();

  // --- Easter eggs (matched before the verb switch) -----------------------
  // Tasteful, medical, sentence case, no emoji. Each emits an EKG effect the
  // client forwards to emitEkg(). "code blue"/"flatline" flatline then revive
  // with a strong ectopic; the EkgMonitor owns the revive timing, so we hand it
  // "flatline" and a calm line.
  if (lower === "code blue" || lower === "flatline" || lower === "asystole") {
    return {
      lines:
        lower === "asystole"
          ? ["asystole. a flat line — then, a beat. the patient is fine."]
          : [
              "code blue. the monitor goes flat…",
              "compressions, a breath — and a beat returns.",
            ],
      ekg: "flatline",
    };
  }
  if (lower === "defib" || lower === "clear!" || lower === "shock") {
    return {
      lines: ["charging… clear. one clean jolt across the strip."],
      ekg: "defib",
    };
  }
  if (lower === "caffeine" || lower === "tachy" || lower === "epi") {
    return {
      lines: ["rate climbing — a brief tachycardia. it will settle."],
      ekg: "tachy",
    };
  }
  if (lower === "normal" || lower === "sinus") {
    return { lines: ["back to a normal sinus rhythm."], ekg: "normal" };
  }

  const spaceIdx = cmd.indexOf(" ");
  const verb = (spaceIdx === -1 ? cmd : cmd.slice(0, spaceIdx)).toLowerCase();
  const rest = spaceIdx === -1 ? "" : cmd.slice(spaceIdx + 1);

  if (verb === "sudo") {
    return { lines: [SUDO_REFUSAL] };
  }

  switch (verb) {
    case "help":
      return { lines: HELP_LINES };
    case "whoami":
      return { lines: whoamiLines() };
    case "projects":
      return { lines: projectsLines() };
    case "achievements":
      return { lines: achievementsLines() };
    case "positions":
      return { lines: positionsLines() };
    case "contact":
      return { lines: contactLines() };
    case "pulse":
      return { lines: await pulseLines() };
    // `sign` is the chart-era verb; keep `leave` as a back-compat alias.
    case "sign":
    case "leave":
      return { lines: await signLines(rest) };
    case "auscultate":
    case "auscultation":
      return { lines: auscultateLines() };
    case "order":
    case "orders":
      return { lines: orderLines(rest) };
    case "clear":
      return { lines: ["::clear::"] }; // sentinel the client recognizes
    default:
      return {
        lines: [
          `unknown order: ${verb}`,
          "type 'help' for the list of commands.",
        ],
      };
  }
}

async function readCmdFromBody(request: Request): Promise<string | null> {
  const len = request.headers.get("content-length");
  if (len && Number(len) > MAX_BODY) return null;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return null;
    if (!raw) return "";
    const body = JSON.parse(raw) as unknown;
    if (body && typeof body === "object" && "cmd" in body) {
      const c = (body as { cmd: unknown }).cmd;
      if (typeof c === "string") return c;
    }
    return "";
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const cmd = await readCmdFromBody(request);
  if (cmd === null) {
    return Response.json(
      { lines: ["request too large or malformed."] },
      { status: 400 },
    );
  }
  const result = await run(cmd);
  return Response.json(result);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const cmd = url.searchParams.get("cmd") ?? "";
  const result = await run(cmd);
  return Response.json(result);
}
