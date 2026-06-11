/**
 * /api/console — the fluoroscopy terminal backend.
 *
 *   POST { cmd }   → { lines: string[] }
 *   GET  ?cmd=...  → { lines: string[] }  (convenience)
 *
 * Stateless except for the `pulse` / `leave` commands, which read/write the
 * persistent pulse store. Everything else is built from content.ts. Unknown
 * commands return a helpful error line. No env/secrets are ever exposed.
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 2_048;
const MAX_CMD = 200;

const HELP_LINES: string[] = [
  "available commands:",
  "  help          this list",
  "  whoami        who is mounish",
  "  projects      selected projects + research",
  "  achievements  awards and honors",
  "  positions     roles held",
  "  contact       github, linkedin, email",
  "  pulse         live global pulse count",
  "  leave <msg>   sign the guestbook (adds a pulse)",
  "  clear         clear the scrollback",
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

async function pulseLines(): Promise<string[]> {
  const state = await getPulses();
  const lines = [
    `pulse count: ${state.count}`,
    state.persisted ? "store: persistent" : "store: in-memory (not persisted)",
  ];
  if (state.recent.length) {
    lines.push("recent:");
    for (const r of state.recent) lines.push(`  ${r.msg}`);
  }
  return lines;
}

async function leaveLines(message: string): Promise<string[]> {
  const msg = message.trim();
  if (!msg) {
    return ["usage: leave <message>"];
  }
  const state = await addPulse(msg);
  return [
    "signed.",
    `pulse count: ${state.count}`,
    state.persisted ? "store: persistent" : "store: in-memory (not persisted)",
  ];
}

/**
 * Resolve a raw command string to its output lines. `clear` is a client-side
 * sentinel: the UI clears the scrollback on seeing the marker.
 */
async function run(rawCmd: string): Promise<string[]> {
  const cmd = rawCmd.trim().slice(0, MAX_CMD);
  if (!cmd) return HELP_LINES;

  const spaceIdx = cmd.indexOf(" ");
  const verb = (spaceIdx === -1 ? cmd : cmd.slice(0, spaceIdx)).toLowerCase();
  const rest = spaceIdx === -1 ? "" : cmd.slice(spaceIdx + 1);

  switch (verb) {
    case "help":
      return HELP_LINES;
    case "whoami":
      return whoamiLines();
    case "projects":
      return projectsLines();
    case "achievements":
      return achievementsLines();
    case "positions":
      return positionsLines();
    case "contact":
      return contactLines();
    case "pulse":
      return pulseLines();
    case "leave":
      return leaveLines(rest);
    case "clear":
      return ["::clear::"]; // sentinel the client recognizes
    default:
      return [
        `unknown command: ${verb}`,
        "type 'help' for the list of commands.",
      ];
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
  const lines = await run(cmd);
  return Response.json({ lines });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const cmd = url.searchParams.get("cmd") ?? "";
  const lines = await run(cmd);
  return Response.json({ lines });
}
