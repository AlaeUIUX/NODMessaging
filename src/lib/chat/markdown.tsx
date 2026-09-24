import type { ReactNode } from "react";
import { emojify } from "./emoji";

/**
 * A small, Slack-flavoured markdown dialect. Inline: **bold**, _italic_,
 * ++underline++, ~~strike~~, `code`, [text](url), @mention. Block (per line):
 * "# " heading, "- " bullet, "1. " numbered, "> " quote.
 */
const INLINE = /(\*\*|~~|\+\+|_)(?=\S)([\s\S]*?\S)\1|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|@([A-Za-z][A-Za-z0-9_]*)/g;

function isBoundary(char: string | undefined) {
  return char === undefined || /[\s(["'`*~+]/.test(char);
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  // A fresh regex per call: nested formats recurse, and a shared /g regex
  // would have its lastIndex reset under the outer loop (an infinite loop).
  const re = new RegExp(INLINE.source, "g");

  while ((match = re.exec(text))) {
    const [full, marker, content, code, linkText, href, mention] = match;
    // Don't treat mid-word underscores (snake_case) as emphasis.
    if (marker === "_" && !isBoundary(text[match.index - 1])) continue;

    if (match.index > cursor) out.push(...emojify(text.slice(cursor, match.index), `${keyPrefix}-t${cursor}`));
    const key = `${keyPrefix}-${match.index}`;

    if (mention) out.push(<span className="mention" key={key}>@{mention}</span>);
    else if (code) out.push(<code key={key}>{code}</code>);
    else if (href) out.push(<a key={key} href={href} target="_blank" rel="noopener noreferrer">{linkText}</a>);
    else if (marker === "**") out.push(<strong key={key}>{renderInline(content, key)}</strong>);
    else if (marker === "~~") out.push(<s key={key}>{renderInline(content, key)}</s>);
    else if (marker === "++") out.push(<u key={key}>{renderInline(content, key)}</u>);
    else out.push(<em key={key}>{renderInline(content, key)}</em>);
    cursor = match.index + full.length;
  }

  if (cursor < text.length) out.push(...emojify(text.slice(cursor), `${keyPrefix}-t${cursor}`));
  return out;
}

type Block =
  | { kind: "p" | "h" | "quote"; lines: string[] }
  | { kind: "ul" | "ol"; lines: string[] };

const BULLET = /^[-•] /;
const NUMBER = /^\d+\. /;

/** `article` keeps every line its own paragraph, for long-form posts. */
function blocks(body: string, article = false): Block[] {
  const out: Block[] = [];
  for (const line of body.split("\n")) {
    const kind: Block["kind"] =
      line.startsWith("# ") ? "h"
      : line.startsWith("> ") ? "quote"
      : BULLET.test(line) ? "ul"
      : NUMBER.test(line) ? "ol"
      : "p";
    const text = kind === "h" || kind === "quote" ? line.slice(2) : kind === "ul" ? line.replace(BULLET, "") : kind === "ol" ? line.replace(NUMBER, "") : line;
    const last = out[out.length - 1];
    if (article && kind === "p" && !text.trim()) continue;
    if (last && last.kind === kind && kind !== "h" && !(article && kind === "p")) last.lines.push(text);
    else out.push({ kind, lines: [text] });
  }
  return out;
}

/** Renders the stored markdown source to React nodes — never raw HTML. */
export function renderBody(body: string, { article = false }: { article?: boolean } = {}): ReactNode {
  return blocks(body, article).map((b, i) => {
    const k = String(i);
    if (b.kind === "ul" || b.kind === "ol") {
      const List = b.kind;
      return <List key={k}>{b.lines.map((l, j) => <li key={j}>{renderInline(l, `${k}-${j}`)}</li>)}</List>;
    }
    const inner = b.lines.flatMap((l, j) => [
      ...(j > 0 ? [<br key={`br-${j}`} />] : []),
      ...renderInline(l, `${k}-${j}`),
    ]);
    if (b.kind === "h") return <h3 key={k} className="md-h">{inner}</h3>;
    if (b.kind === "quote") return <blockquote key={k}>{inner}</blockquote>;
    return <p key={k}>{inner}</p>;
  });
}

/** Plain text for previews, inbox rows and reply quotes. */
export function stripFormatting(body: string): string {
  return body
    .replace(/^(# |> |[-•] |\d+\. )/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\+\+(.+?)\+\+/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(^|\s)_(.+?)_/g, "$1$2")
    .replace(/\n/g, " ");
}
