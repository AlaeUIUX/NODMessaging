"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { initials } from "@/lib/chat/avatar";
import { stripFormatting } from "@/lib/chat/markdown";
import { htmlToMarkdown, markdownToHtml } from "@/lib/chat/richText";
import { localStorageAdapter } from "@/lib/chat/storage";
import { userById } from "@/lib/chat/store";
import type { Attachment, Message, User } from "@/lib/chat/types";
import Avatar from "./Avatar";
import type { AddKind } from "./CardBuilders";
import {
  IconArrowUp, IconAt, IconBell, IconBold, IconBullets, IconCheck, IconChecklist, IconClose, IconCode, IconHeading,
  IconItalic, IconLink, IconMic, IconNumbers, IconPlus, IconPoll, IconQuote, IconStrike, IconUnderline,
} from "./Icons";
import styles from "./chat.module.css";

const TYPING_IDLE_MS = 3000;
const INLINE_IMAGE_LIMIT = 1.5 * 1024 * 1024;

type FormatKind = "bold" | "italic" | "underline" | "strike" | "heading" | "link" | "bullet" | "number" | "quote" | "code";
type Tool = { kind: FormatKind; label: string; glyph: React.ReactNode; sep?: boolean };

/** Slack's order: inline styles, then link, then block styles. */
const TOOLS: Tool[] = [
  { kind: "bold", label: "Bold", glyph: <IconBold size={18} /> },
  { kind: "italic", label: "Italic", glyph: <IconItalic size={18} /> },
  { kind: "underline", label: "Underline", glyph: <IconUnderline size={18} /> },
  { kind: "strike", label: "Strikethrough", glyph: <IconStrike size={18} /> },
  { kind: "heading", label: "Heading", glyph: <IconHeading size={18} /> },
  { kind: "link", label: "Link", glyph: <IconLink size={18} />, sep: true },
  { kind: "bullet", label: "Bulleted list", glyph: <IconBullets size={18} />, sep: true },
  { kind: "number", label: "Numbered list", glyph: <IconNumbers size={18} /> },
  { kind: "quote", label: "Quote", glyph: <IconQuote size={18} /> },
  { kind: "code", label: "Code", glyph: <IconCode size={18} /> },
];

/** Native editing commands keep undo/redo working for free. */
const COMMANDS: Partial<Record<FormatKind, string>> = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strike: "strikeThrough",
  bullet: "insertUnorderedList",
  number: "insertOrderedList",
};

interface Props {
  chatId: string;
  meId: string;
  members: User[];
  placeholder: string;
  replyTo: Message | null;
  editing: Message | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSend: (body: string, attachments: Attachment[]) => void;
  onSaveEdit: (body: string) => void;
  onTyping: (isTyping: boolean) => void;
  onHint: (text: string) => void;
  /** Opens the "Add to message" sheet. */
  onOpenAdd: () => void;
  /** Toolbar shortcuts straight into a flow (poll, checklist, reminder). */
  onQuick: (kind: AddKind) => void;
  /** Files chosen from the screen-level pickers (photos, camera, file). */
  incoming: { files: File[]; id: number } | null;
}

async function toAttachment(file: File): Promise<Attachment> {
  const base: Attachment = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: file.type.startsWith("image/") ? "image" : "file",
    name: file.name || "pasted-image.png",
    size: file.size,
  };
  // Small files keep their bytes so the recipient can actually download them.
  if (file.size > INLINE_IMAGE_LIMIT) return base;
  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
  return dataUrl ? { ...base, dataUrl } : base;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function exec(command: string, value?: string) {
  // execCommand is deprecated but remains the only API that edits
  // contenteditable with native undo; every evergreen browser supports it.
  document.execCommand(command, false, value);
}

/**
 * A horizontally overflowing toolbar that can be dragged with a mouse (touch
 * already scrolls natively) and scrolled with a vertical wheel. A drag never
 * triggers the button it started on.
 */
function DragScroll({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, left: 0, down: false, moved: false });
  const [dragging, setDragging] = useState(false);
  return (
    <div
      {...rest}
      ref={ref}
      className={`${className ?? ""} ${dragging ? styles.toolDragging : ""}`}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse" || !ref.current) return;
        drag.current = { x: e.clientX, left: ref.current.scrollLeft, down: true, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        const el = ref.current;
        if (!d.down || !el) return;
        const dx = e.clientX - d.x;
        if (!d.moved && Math.abs(dx) > 4) {
          d.moved = true;
          setDragging(true);
          el.setPointerCapture(e.pointerId);
        }
        if (d.moved) el.scrollLeft = d.left - dx;
      }}
      onPointerUp={() => { drag.current.down = false; setDragging(false); }}
      onPointerCancel={() => { drag.current = { ...drag.current, down: false, moved: false }; setDragging(false); }}
      onClickCapture={(e) => {
        if (drag.current.moved) {
          e.preventDefault();
          e.stopPropagation();
          drag.current.moved = false;
        }
      }}
      onWheel={(e) => {
        const el = ref.current;
        if (el && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
      }}
    >
      {children}
    </div>
  );
}

function closestIn(root: HTMLElement, node: Node | null, selector: string): HTMLElement | null {
  const el = node instanceof HTMLElement ? node : node?.parentElement ?? null;
  const hit = el?.closest<HTMLElement>(selector) ?? null;
  return hit && root.contains(hit) ? hit : null;
}

export default function Composer({
  chatId, meId, members, placeholder, replyTo, editing,
  onCancelReply, onCancelEdit, onSend, onSaveEdit, onTyping, onHint, onOpenAdd, onQuick, incoming,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const linkRange = useRef<Range | null>(null);
  const typingRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hasText, setHasText] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dropping, setDropping] = useState(false);
  const [focused, setFocused] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [active, setActive] = useState<Set<FormatKind>>(() => new Set());
  const [mention, setMention] = useState<{ query: string; node: Text; offset: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  const placeCaretAtEnd = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  // Keyed on chat + edit target by the parent: seed the editor once on mount.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = markdownToHtml(editing ? editing.body : localStorageAdapter.loadDraft(chatId));
    setHasText(!!el.textContent?.trim());
    if (editing) placeCaretAtEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (replyTo) placeCaretAtEnd();
  }, [replyTo]);

  const stopTyping = useCallback(() => {
    if (!typingRef.current) return;
    typingRef.current = false;
    onTyping(false);
  }, [onTyping]);

  useEffect(() => () => stopTyping(), [stopTyping]);

  const signalTyping = () => {
    if (!typingRef.current) {
      typingRef.current = true;
      onTyping(true);
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  /** Reads formatting at the caret for toolbar states, and any @mention in progress. */
  const syncCaret = useCallback(() => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return;
    const on = new Set<FormatKind>();
    (Object.keys(COMMANDS) as FormatKind[]).forEach((k) => {
      try { if (document.queryCommandState(COMMANDS[k]!)) on.add(k); } catch { /* unsupported */ }
    });
    if (closestIn(el, sel.anchorNode, "blockquote")) on.add("quote");
    if (closestIn(el, sel.anchorNode, "h1, h2, h3")) on.add("heading");
    if (closestIn(el, sel.anchorNode, "code")) on.add("code");
    if (closestIn(el, sel.anchorNode, "a")) on.add("link");
    setActive(on);

    const node = sel.anchorNode;
    if (sel.isCollapsed && node instanceof Text) {
      const m = /(?:^|\s)@([A-Za-z]*)$/.exec(node.data.slice(0, sel.anchorOffset));
      setMention(m ? { query: m[1], node, offset: sel.anchorOffset } : null);
    } else {
      setMention(null);
    }
  }, [setActive, setMention]);

  useEffect(() => {
    document.addEventListener("selectionchange", syncCaret);
    return () => document.removeEventListener("selectionchange", syncCaret);
  }, [syncCaret]);

  const afterEdit = () => {
    const el = editorRef.current;
    if (!el) return;
    // A cleared editor keeps a stray <br>; drop it so the placeholder returns.
    if (!el.textContent?.trim() && !el.querySelector("li, blockquote, code, img")) el.innerHTML = "";
    setHasText(!!el.textContent?.replace(/​/g, "").trim());
    syncCaret();
    if (!editing) {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => localStorageAdapter.saveDraft(chatId, htmlToMarkdown(el)), 250);
    }
  };

  const toggleCode = () => {
    const el = editorRef.current!;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const code = closestIn(el, sel.anchorNode, "code");
    if (code) {
      code.replaceWith(document.createTextNode((code.textContent ?? "").replace(/​/g, "")));
      return;
    }
    if (!sel.isCollapsed) {
      exec("insertHTML", `<code>${escapeHtml(sel.toString())}</code>​`);
      return;
    }
    exec("insertHTML", "<code>​</code>​");
    const fresh = Array.from(el.querySelectorAll("code")).find((c) => c.textContent === "​");
    if (fresh?.firstChild) {
      const r = document.createRange();
      r.setStart(fresh.firstChild, 1);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };

  const format = (kind: FormatKind) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    if (kind === "link") {
      const sel = window.getSelection();
      linkRange.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      const a = closestIn(el, sel?.anchorNode ?? null, "a");
      setLinkUrl(a?.getAttribute("href") ?? "https://");
      return;
    }
    if (kind === "quote") {
      const sel = window.getSelection();
      exec("formatBlock", closestIn(el, sel?.anchorNode ?? null, "blockquote") ? "div" : "blockquote");
    } else if (kind === "heading") {
      const sel = window.getSelection();
      exec("formatBlock", closestIn(el, sel?.anchorNode ?? null, "h1, h2, h3") ? "div" : "h3");
    } else if (kind === "code") {
      toggleCode();
    } else {
      exec(COMMANDS[kind]!);
    }
    afterEdit();
  };

  const applyLink = (url: string) => {
    const el = editorRef.current;
    const range = linkRange.current;
    setLinkUrl(null);
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (range && sel) { sel.removeAllRanges(); sel.addRange(range); }
    const clean = url.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(clean)) { afterEdit(); return; }
    if (sel && !sel.isCollapsed) exec("createLink", clean);
    else exec("insertHTML", `<a href="${escapeHtml(clean)}">${escapeHtml(clean.replace(/^https?:\/\//, ""))}</a>&nbsp;`);
    afterEdit();
  };

  const mentionCandidates = mention
    ? members.filter((m) => m.name.toLowerCase().startsWith(mention.query.toLowerCase()))
    : [];
  const showMentions = focused && mentionCandidates.length > 0;

  const insertMention = (user: User) => {
    if (!mention) return;
    const range = document.createRange();
    range.setStart(mention.node, mention.offset - mention.query.length - 1);
    range.setEnd(mention.node, mention.offset);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    exec("insertText", `@${user.name} `);
    setMention(null);
    setMentionIndex(0);
    afterEdit();
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, 4);
    const next = await Promise.all(list.map(toAttachment));
    setAttachments((prev) => [...prev, ...next]);
  };

  useEffect(() => {
    if (!incoming) return;
    let live = true;
    void Promise.all(incoming.files.slice(0, 4).map(toAttachment)).then((next) => {
      if (live) setAttachments((prev) => [...prev, ...next]);
    });
    return () => { live = false; };
  }, [incoming]);

  const clear = () => {
    const el = editorRef.current;
    if (el) el.innerHTML = "";
    setHasText(false);
    setActive(new Set());
  };

  const submit = () => {
    const el = editorRef.current;
    if (!el) return;
    const body = htmlToMarkdown(el);
    if (editing) {
      if (body.trim()) onSaveEdit(body.trim());
      clear();
      onCancelEdit();
      return;
    }
    if (!body.trim() && attachments.length === 0) return;
    onSend(body, attachments);
    clear();
    setAttachments([]);
    localStorageAdapter.saveDraft(chatId, "");
    stopTyping();
    el.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (showMentions) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionCandidates.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionCandidates[mentionIndex % mentionCandidates.length]); return; }
      if (e.key === "Escape") { e.preventDefault(); setMention(null); return; }
    }
    if (e.metaKey || e.ctrlKey) {
      const shortcut: Record<string, FormatKind> = { b: "bold", i: "italic", u: "underline", k: "link" };
      const kind = e.shiftKey && e.key.toLowerCase() === "x" ? "strike" : shortcut[e.key.toLowerCase()];
      if (kind) { e.preventDefault(); format(kind); return; }
    }
    if (e.key === "Enter" && e.shiftKey) {
      // A new paragraph continues lists and quotes; an empty item ends them.
      e.preventDefault();
      exec("insertParagraph");
      afterEdit();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "Escape") {
      if (formatting) setFormatting(false);
      else if (editing) onCancelEdit();
      else if (replyTo) onCancelReply();
    }
  };

  const hasContent = hasText || attachments.length > 0;
  const canSend = hasContent || !!editing;
  const expanded = focused || hasContent || formatting || !!replyTo || !!editing || linkUrl !== null;

  return (
    <div
      className={styles.composer}
      onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDropping(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = ""; }}
      />

      <div className={styles.composerRow}>
        <div className={`${styles.outsidePlus} ${expanded ? styles.tucked : ""}`}>
          <button
            className={`${styles.circleBtn} ${styles.glass}`}
            onClick={onOpenAdd}
            aria-label="Add to message"
            tabIndex={expanded ? -1 : 0}
          >
            <IconPlus />
          </button>
        </div>

        <div
          className={`${styles.field} ${styles.glassStrong} ${expanded ? styles.fieldOpen : ""} ${dropping ? styles.dropping : ""}`}
          onMouseDown={(e) => {
            // Taps on the card's chrome keep the caret (and selection) in the editor.
            const t = e.target as HTMLElement;
            if (!editorRef.current?.contains(t) && t.tagName !== "INPUT") e.preventDefault();
          }}
        >
          {showMentions && (
            <div className={`${styles.mentionPop} ${styles.glassStrong}`}>
              {mentionCandidates.map((m, i) => (
                <button
                  key={m.id}
                  className={`${styles.mentionItem} ${i === mentionIndex ? styles.mentionOn : ""}`}
                  onClick={() => insertMention(m)}
                >
                  <Avatar glyph={initials(m.fullName)} tone={m.tone} size={28} shape="circle" />
                  {m.fullName}
                  <span>@{m.name}</span>
                </button>
              ))}
            </div>
          )}

          {linkUrl !== null && (
            <form
              className={`${styles.linkPop} ${styles.glassStrong}`}
              onSubmit={(e) => { e.preventDefault(); applyLink(linkUrl); }}
            >
              <IconLink size={16} />
              <input
                autoFocus
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setLinkUrl(null); editorRef.current?.focus(); } }}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Link address"
                placeholder="https://"
              />
              <button type="submit" aria-label="Add link"><IconCheck size={16} /></button>
            </form>
          )}

          {editing ? (
            <div className={styles.fieldContext}>
              <div className={styles.fcText}>
                <b>Editing message</b>
                <span>{stripFormatting(editing.body)}</span>
              </div>
              <button onClick={() => { clear(); onCancelEdit(); }} aria-label="Cancel edit"><IconClose /></button>
            </div>
          ) : replyTo && (
            <div className={styles.fieldContext} key={replyTo.id}>
              <div className={styles.fcText}>
                <b>Replying to {replyTo.authorId === meId ? "yourself" : userById(replyTo.authorId).name}</b>
                <span>{replyTo.kind === "voice" ? "Voice message" : stripFormatting(replyTo.body) || "Attachment"}</span>
              </div>
              <button onClick={onCancelReply} aria-label="Cancel reply"><IconClose /></button>
            </div>
          )}

          {attachments.length > 0 && (
            <div className={styles.attachTray}>
              {attachments.map((a) => (
                <span key={a.id} className={styles.attachChip}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {a.dataUrl && <img src={a.dataUrl} alt="" />}
                  {a.name.length > 16 ? `${a.name.slice(0, 16)}…` : a.name}
                  <button onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))} aria-label="Remove">×</button>
                </span>
              ))}
            </div>
          )}

          <div className={styles.inputRow}>
            <div
              ref={editorRef}
              className={`${styles.input} ${styles.editor}`}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label={placeholder}
              data-placeholder={placeholder}
              onFocus={() => { setFocused(true); syncCaret(); }}
              onBlur={() => { setFocused(false); setMention(null); }}
              onInput={() => { afterEdit(); signalTyping(); }}
              onKeyDown={onKeyDown}
              onPaste={(e) => {
                e.preventDefault();
                if (e.clipboardData.files.length) { void addFiles(e.clipboardData.files); return; }
                // Paste as plain text so foreign styles never leak into a message.
                exec("insertText", e.clipboardData.getData("text/plain"));
                afterEdit();
              }}
            />
            {!expanded && (
              <button className={styles.micInline} onClick={() => onHint("Hold to record — voice notes are coming soon")} aria-label="Record voice note">
                <IconMic size={19} />
              </button>
            )}
          </div>

          <div className={styles.toolbarWrap} aria-hidden={!expanded}>
            <div className={styles.toolbarInner}>
              <div className={styles.toolbar}>
                {formatting ? (
                  <DragScroll className={styles.toolSet} key="format" role="toolbar" aria-label="Text formatting">
                    <button className={`${styles.toolBtn} ${styles.toolClose}`} onClick={() => setFormatting(false)} aria-label="Close formatting">
                      <IconClose size={16} />
                    </button>
                    {TOOLS.map((t, i) => (
                      <span key={t.kind} className={styles.toolItem} style={{ ["--i" as string]: i }}>
                        {t.sep && <i className={styles.toolSep} />}
                        <button
                          className={`${styles.toolBtn} ${active.has(t.kind) ? styles.toolOn : ""}`}
                          onClick={() => format(t.kind)}
                          aria-label={t.label}
                          aria-pressed={active.has(t.kind)}
                          title={t.label}
                        >
                          {t.glyph}
                        </button>
                      </span>
                    ))}
                  </DragScroll>
                ) : (
                  <div className={styles.toolSet} key="main">
                    <button className={styles.toolBtn} onClick={onOpenAdd} aria-label="Add to message" tabIndex={expanded ? 0 : -1}>
                      <IconPlus size={19} />
                    </button>
                    <button className={`${styles.toolBtn} ${styles.toolAa}`} onClick={() => setFormatting(true)} aria-label="Show formatting" tabIndex={expanded ? 0 : -1}>
                      Aa
                    </button>
                    <button
                      className={styles.toolBtn}
                      onClick={() => { editorRef.current?.focus(); exec("insertText", "@"); afterEdit(); }}
                      aria-label="Mention someone"
                      tabIndex={expanded ? 0 : -1}
                    >
                      <IconAt size={18} />
                    </button>
                    <i className={styles.toolSep} />
                    <button className={styles.toolBtn} onClick={() => onQuick("poll")} aria-label="New poll" title="Poll" tabIndex={expanded ? 0 : -1}>
                      <IconPoll size={18} />
                    </button>
                    <button className={styles.toolBtn} onClick={() => onQuick("checklist")} aria-label="New checklist" title="Checklist" tabIndex={expanded ? 0 : -1}>
                      <IconChecklist size={18} />
                    </button>
                    <button className={styles.toolBtn} onClick={() => onQuick("reminder")} aria-label="New reminder" title="Reminder" tabIndex={expanded ? 0 : -1}>
                      <IconBell size={18} />
                    </button>
                  </div>
                )}

                <button
                  className={`${styles.sendBtn} ${canSend ? "" : styles.sendIdle}`}
                  onClick={submit}
                  disabled={!canSend}
                  aria-label={editing ? "Save edit" : "Send"}
                  tabIndex={expanded ? 0 : -1}
                >
                  <IconArrowUp size={17} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
