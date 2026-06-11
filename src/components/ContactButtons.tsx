"use client";

import type { JSX } from "react";
import { GITHUB, LINKEDIN, EMAIL } from "@/data/content";

const MONO =
  'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';
const HAIRLINE = "color-mix(in srgb, var(--bone) 22%, transparent)";

/**
 * Three deliberately non-generic contact buttons. Each is a real <a> with a
 * sharp body (1px on small controls), a 1px hairline border, a tiny uppercase
 * mono micro-label ("gh" / "in" / "@") set off by a hairline divider, the
 * handle, and a hand-drawn 1px EKG-tick mark. Hover shifts border + text to
 * --green over 150ms (color/opacity only — no lift, scale, or shadow).
 *
 * No emoji, no rounded icon tiles, no glassmorphism.
 */

type Mark = "github" | "linkedin" | "mail";

interface Item {
  href: string;
  external: boolean;
  /** tiny uppercase mono tag in the leading cell */
  tag: string;
  /** the readable handle */
  handle: string;
  /** screen-reader label */
  aria: string;
  mark: Mark;
}

function handleFromUrl(url: string): string {
  // strip protocol + www + trailing slash, keep the meaningful path
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

const ITEMS: Item[] = [
  {
    href: GITHUB,
    external: true,
    tag: "gh",
    handle: handleFromUrl(GITHUB).replace(/^github\.com\//, ""),
    aria: "GitHub profile",
    mark: "github",
  },
  {
    href: LINKEDIN,
    external: true,
    tag: "in",
    handle: handleFromUrl(LINKEDIN).replace(/^.*\/in\//, ""),
    aria: "LinkedIn profile",
    mark: "linkedin",
  },
  {
    href: `mailto:${EMAIL}`,
    external: false,
    tag: "@",
    handle: EMAIL,
    aria: "Email Mounish",
    mark: "mail",
  },
];

/** A 1px EKG-style tick drawn in code — the recurring spec motif, not an icon. */
function TickMark({ mark }: { mark: Mark }): JSX.Element {
  // Each destination gets a faintly different deflection so the three marks
  // read as siblings without being identical.
  const d =
    mark === "github"
      ? "M0 6 H4 L5 6 L7 2 L9 10 L11 6 H16"
      : mark === "linkedin"
        ? "M0 6 H5 L6 3 L8 9 L10 6 H16"
        : "M0 6 H3 L4 6 L6 1 L8 11 L10 6 L11 6 H16";
  return (
    <svg
      width="16"
      height="12"
      viewBox="0 0 16 12"
      aria-hidden="true"
      style={{
        display: "block",
        overflow: "visible",
        color: "inherit",
      }}
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="miter"
        strokeLinecap="butt"
        vectorEffect="non-scaling-stroke"
        opacity={0.85}
      />
    </svg>
  );
}

export default function ContactButtons(): JSX.Element {
  return (
    <nav
      aria-label="Contact"
      className="contact-buttons flex items-stretch gap-2"
      style={{ pointerEvents: "auto" }}
    >
      {ITEMS.map((it) => (
        <a
          key={it.tag}
          href={it.href}
          aria-label={it.aria}
          {...(it.external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
          className="contact-btn group inline-flex items-stretch"
          style={{
            fontFamily: MONO,
            color: "color-mix(in srgb, var(--bone) 78%, transparent)",
            border: `1px solid ${HAIRLINE}`,
            borderRadius: "2px",
            background: "color-mix(in srgb, var(--black) 55%, transparent)",
            textDecoration: "none",
            transition:
              "color 150ms linear, border-color 150ms linear, background-color 150ms linear",
          }}
        >
          {/* leading cell: tiny uppercase tag, hairline-divided */}
          <span
            className="contact-tag"
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 9px",
              fontSize: "0.6rem",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              borderRight: `1px solid ${HAIRLINE}`,
              transition: "border-color 150ms linear",
            }}
          >
            {it.tag}
          </span>

          {/* trailing cell: 1px tick mark + handle */}
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "7px 11px 7px 10px",
              minHeight: "30px",
            }}
          >
            <TickMark mark={it.mark} />
            <span
              style={{
                fontSize: "0.66rem",
                letterSpacing: "0.02em",
                maxWidth: "16ch",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {it.handle}
            </span>
          </span>
        </a>
      ))}

      {/* hover: border + text shift to --green; color/opacity only. */}
      <style>{`
        .contact-btn:hover,
        .contact-btn:focus-visible {
          color: var(--green);
          border-color: color-mix(in srgb, var(--green) 55%, transparent);
        }
        .contact-btn:hover .contact-tag,
        .contact-btn:focus-visible .contact-tag {
          border-color: color-mix(in srgb, var(--green) 40%, transparent);
        }
        @media (max-width: 520px) {
          .contact-buttons { flex-wrap: wrap; justify-content: center; }
        }
      `}</style>
    </nav>
  );
}
