import type { ReactNode } from "react";

const INLINE = /(\*\*|~~|_)(?=\S)([\s\S]*?\S)\1|@([A-Za-z][A-Za-z0-9_]*)/g;

function isBoundary(char: string | undefined) {
  return char === undefined || /[\s(["']/.test(char);
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  INLINE.lastIndex = 0;

  while ((match = INLINE.exec(text))) {
    const [full, marker, content, mention] = match;
    // Don't treat mid-word underscores (snake_case) as emphasis.
    if (marker && !isBoundary(text[match.index - 1])) continue;

    if (match.index > cursor) out.push(text.slice(cursor, match.index));
    const key = `${keyPrefix}-${match.index}`;

    if (mention) {
      out.push(<span className="mention" key={key}>@{mention}</span>);
    } else if (marker === "**") {
      out.push(<strong key={key}>{content}</strong>);
    } else if (marker === "~~") {
      out.push(<s key={key}>{content}</s>);
    } else {
      out.push(<em key={key}>{content}</em>);
    }
    cursor = match.index + full.length;
  }

  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

/** Renders the stored markdown source to React nodes — never raw HTML. */
export function renderBody(body: string): ReactNode {
  return body.split("\n").map((line, i) => {
    const heading = line.startsWith("# ");
    const content = heading ? line.slice(2) : line;
    return (
      <span key={i} style={heading ? { fontWeight: 600, fontSize: "1.12em" } : undefined}>
        {renderInline(content, String(i))}
        {i < body.split("\n").length - 1 && <br />}
      </span>
    );
  });
}

/** Plain text for previews, inbox rows and reply quotes. */
export function stripFormatting(body: string): string {
  return body
    .replace(/^# /gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/\n/g, " ");
}

export type FormatKind = "bold" | "italic" | "strike" | "heading";

const WRAPPERS: Record<Exclude<FormatKind, "heading">, string> = {
  bold: "**",
  italic: "_",
  strike: "~~",
};

/** Returns the next composer value + caret position after applying a format. */
export function applyFormat(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  kind: FormatKind,
): { value: string; caret: number } {
  if (kind === "heading") {
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const hasHeading = value.slice(lineStart, lineStart + 2) === "# ";
    const next = hasHeading
      ? value.slice(0, lineStart) + value.slice(lineStart + 2)
      : value.slice(0, lineStart) + "# " + value.slice(lineStart);
    return { value: next, caret: selectionStart + (hasHeading ? -2 : 2) };
  }

  const marker = WRAPPERS[kind];
  const selected = value.slice(selectionStart, selectionEnd);
  const next = value.slice(0, selectionStart) + marker + selected + marker + value.slice(selectionEnd);
  const caret = selected
    ? selectionStart + marker.length + selected.length + marker.length
    : selectionStart + marker.length;
  return { value: next, caret };
}
