"use client";

import type { ReactNode } from "react";

/**
 * Apple emoji everywhere, on every platform. Images come from the MIT-licensed
 * `emoji-datasource-apple` package via jsDelivr (the artwork itself is Apple's).
 * If an image can't load, the native character shows instead.
 */
const CDN = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@16.0.0/img/apple/64/";

/**
 * A grapheme that should render as an emoji: default-emoji characters, or
 * text-default ones explicitly asked to be emoji (U+FE0F), with skin tones and
 * ZWJ sequences. Plain symbols like → or © stay text.
 */
const PART = String.raw`(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️)\p{Emoji_Modifier}?`;
// Flags come first: each half of a flag is an emoji character on its own.
const EMOJI = new RegExp(`\\p{Regional_Indicator}{2}|${PART}(?:\\u200D(?:${PART}|\\p{Extended_Pictographic}))*`, "gu");

function codepoints(char: string) {
  return Array.from(char).map((c) => c.codePointAt(0)!.toString(16)).join("-");
}

/** The datasource keeps FE0F on some filenames and drops it on others; try both. */
function candidates(char: string) {
  const raw = codepoints(char);
  const without = raw.replace(/-fe0f/g, "");
  const withSel = /-fe0f/.test(raw) ? raw : `${raw}-fe0f`;
  return Array.from(new Set([raw, without, withSel]));
}

export function Emoji({ char, className }: { char: string; className?: string }) {
  const [first, ...rest] = candidates(char);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`emoji ${className ?? ""}`}
      src={`${CDN}${first}.png`}
      alt={char}
      draggable={false}
      data-fallbacks={rest.join(",")}
      onError={(e) => {
        const img = e.currentTarget;
        const [next, ...others] = (img.dataset.fallbacks ?? "").split(",").filter(Boolean);
        if (next) {
          img.dataset.fallbacks = others.join(",");
          img.src = `${CDN}${next}.png`;
        } else {
          // Last resort: the platform's own emoji.
          img.replaceWith(document.createTextNode(char));
        }
      }}
    />
  );
}

/** Splits text into strings and <Emoji/> images. */
export function emojify(text: string, keyPrefix = "e"): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  for (const m of text.matchAll(EMOJI)) {
    const i = m.index ?? 0;
    if (i > cursor) out.push(text.slice(cursor, i));
    out.push(<Emoji key={`${keyPrefix}-${i}`} char={m[0]} />);
    cursor = i + m[0].length;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

/** True when the text is nothing but emoji (for the large, bubble-less style). */
export function emojiCount(text: string) {
  const t = text.replace(/\s/g, "");
  if (!t) return 0;
  const found = t.match(EMOJI) ?? [];
  return found.join("") === t ? found.length : 0;
}
