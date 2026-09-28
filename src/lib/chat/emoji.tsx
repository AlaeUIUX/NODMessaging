"use client";

import { useState, type ReactNode } from "react";

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
const PART = String.raw`(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F)\p{Emoji_Modifier}?`;
// Flags come first: each half of a flag is an emoji character on its own.
// Keycaps (1️⃣, #️⃣) are a digit, an optional U+FE0F and U+20E3.
const EMOJI = new RegExp(
  String.raw`\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|${PART}(?:\u200D(?:${PART}|\p{Extended_Pictographic}))*`,
  "gu",
);
/** What an emoji keyboard types, including text-default symbols sent without U+FE0F (❤, ☀). */
const TYPED = new RegExp(String.raw`${EMOJI.source}|\p{Extended_Pictographic}`, "u");

function codepoints(char: string) {
  return Array.from(char).map((c) => c.codePointAt(0)!.toString(16).padStart(4, "0")).join("-");
}

/** The datasource keeps FE0F on some filenames and drops it on others; try both. */
function candidates(char: string) {
  const raw = codepoints(char);
  const without = raw.replace(/-fe0f/g, "");
  const withSel = /-fe0f/.test(raw) ? raw : `${raw}-fe0f`;
  return Array.from(new Set([raw, without, withSel]));
}

export function Emoji({ char, className }: { char: string; className?: string }) {
  const sources = candidates(char);
  // Which filename we're on, per character; a new `char` starts over.
  const [miss, setMiss] = useState({ char, n: 0 });
  const n = miss.char === char ? miss.n : 0;
  // Last resort: the platform's own emoji, rendered by React (swapping the
  // node by hand left React holding a detached <img>, and it crashed later).
  if (n >= sources.length) return <>{char}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`emoji ${className ?? ""}`}
      src={`${CDN}${sources[n]}.png`}
      alt={char}
      draggable={false}
      onError={() => setMiss({ char, n: n + 1 })}
    />
  );
}

/** The first emoji in some text (what a phone's emoji keyboard types), or null. */
export function firstEmoji(text: string): string | null {
  return TYPED.exec(text)?.[0] ?? null;
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
