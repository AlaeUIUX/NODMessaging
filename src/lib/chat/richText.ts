import { renderToStaticMarkup } from "react-dom/server";
import { renderBody } from "./markdown";

/**
 * Bridges the composer's live-rendered editor and the stored markdown.
 * Messages are still persisted as markdown, so everything downstream
 * (bubbles, previews, search) is unchanged.
 */

const ZWSP = /​/g;

export function markdownToHtml(md: string): string {
  if (!md) return "";
  return renderToStaticMarkup(renderBody(md) as React.ReactElement);
}

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(ZWSP, "");
  if (!(node instanceof HTMLElement)) return "";
  const inner = Array.from(node.childNodes).map(inline).join("");
  if (!inner && node.tagName !== "BR" && node.tagName !== "IMG") return "";
  const wrap = (m: string) => {
    // Markers must hug the text: "** bold **" would not parse.
    const lead = inner.match(/^\s*/)![0];
    const trail = inner.match(/\s*$/)![0];
    const core = inner.trim();
    return core ? `${lead}${m}${core}${m}${trail}` : inner;
  };
  switch (node.tagName) {
    case "B": case "STRONG": return wrap("**");
    case "I": case "EM": return wrap("_");
    case "U": return wrap("++");
    case "S": case "STRIKE": case "DEL": return wrap("~~");
    case "CODE": return inner.trim() ? `\`${inner}\`` : "";
    case "A": {
      const href = node.getAttribute("href") ?? "";
      return /^https?:\/\//.test(href) ? `[${inner}](${href})` : inner;
    }
    case "BR": return "\n";
    case "IMG": return node.getAttribute("alt") ?? "";
    case "SPAN": {
      // Chrome sometimes emits styled spans instead of tags.
      const st = node.style;
      let out = inner;
      if (st.fontWeight === "bold" || Number(st.fontWeight) >= 600) out = `**${out}**`;
      if (st.fontStyle === "italic") out = `_${out}_`;
      if (st.textDecorationLine?.includes("underline")) out = `++${out}++`;
      if (st.textDecorationLine?.includes("line-through")) out = `~~${out}~~`;
      return out;
    }
    default: return inner;
  }
}

const BLOCKS = new Set(["DIV", "P", "UL", "OL", "LI", "BLOCKQUOTE", "H1", "H2", "H3"]);

/** Serialises the editor DOM into lines of markdown. */
export function htmlToMarkdown(root: HTMLElement): string {
  const lines: string[] = [];
  let buffer = "";
  const flush = () => { lines.push(buffer); buffer = ""; };

  const walk = (node: Node, prefix: () => string) => {
    if (node instanceof HTMLElement && BLOCKS.has(node.tagName)) {
      if (buffer) flush();
      if (node.tagName === "UL" || node.tagName === "OL") {
        let n = 0;
        node.childNodes.forEach((li) => {
          n += 1;
          const marker = node.tagName === "UL" ? "- " : `${n}. `;
          walk(li, () => marker);
        });
        return;
      }
      const own = node.tagName === "BLOCKQUOTE" ? () => "> " : prefix;
      const isHeading = /^H\d$/.test(node.tagName) || node.classList.contains("md-h");
      let first = true;
      let nested = false;
      node.childNodes.forEach((child) => {
        if (child instanceof HTMLElement && BLOCKS.has(child.tagName)) {
          nested = true;
          walk(child, own);
        } else {
          const text = inline(child);
          text.split("\n").forEach((part, i) => {
            if (i > 0) flush();
            if (!buffer && (first || i > 0)) buffer = (isHeading ? "# " : "") + own();
            buffer += part;
            first = false;
          });
        }
      });
      if (buffer) flush();
      // A truly empty block (no text, no nested blocks) is a blank line.
      else if (first && !nested) { buffer = own(); flush(); }
      return;
    }
    // Loose inline content at the root level.
    const text = inline(node);
    text.split("\n").forEach((part, i) => {
      if (i > 0) flush();
      buffer += part;
    });
  };

  root.childNodes.forEach((child) => walk(child, () => ""));
  if (buffer) flush();

  // Trim prefix-only lines left by empty blocks at the edges.
  while (lines.length && !lines[lines.length - 1].replace(/^(> |- |\d+\. )$/, "").trim()) lines.pop();
  while (lines.length && !lines[0].trim()) lines.shift();
  return lines.join("\n").replace(/ /g, " ");
}
