"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { applyFormat, stripFormatting, type FormatKind } from "@/lib/chat/markdown";
import { localStorageAdapter } from "@/lib/chat/storage";
import { userById } from "@/lib/chat/store";
import type { Attachment, Message, User } from "@/lib/chat/types";
import styles from "./chat.module.css";

const MAX_HEIGHT = 150;
const TYPING_IDLE_MS = 3000;
const INLINE_IMAGE_LIMIT = 1.5 * 1024 * 1024;

interface Props {
  chatId: string;
  members: User[];
  placeholder: string;
  replyTo: Message | null;
  editing: Message | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSend: (body: string, attachments: Attachment[]) => void;
  onSaveEdit: (body: string) => void;
  onTyping: (isTyping: boolean) => void;
}

async function toAttachment(file: File): Promise<Attachment> {
  const base: Attachment = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: file.type.startsWith("image/") ? "image" : "file",
    name: file.name || "pasted-image.png",
    size: file.size,
  };
  if (base.kind !== "image" || file.size > INLINE_IMAGE_LIMIT) return base;
  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
  return dataUrl ? { ...base, dataUrl } : base;
}

export default function Composer({
  chatId, members, placeholder, replyTo, editing,
  onCancelReply, onCancelEdit, onSend, onSaveEdit, onTyping,
}: Props) {
  // The parent keys this component on chat + edit target, so mounting with the
  // right content replaces syncing props into state after the fact.
  const [value, setValue] = useState(() => (editing ? editing.body : localStorageAdapter.loadDraft(chatId)));
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dropping, setDropping] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [caret, setCaret] = useState(() => (editing ? editing.body.length : 0));
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (editing) return;
    const t = setTimeout(() => localStorageAdapter.saveDraft(chatId, value), 250);
    return () => clearTimeout(t);
  }, [chatId, value, editing]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const stopTyping = useCallback(() => {
    if (!typingRef.current) return;
    typingRef.current = false;
    onTyping(false);
  }, [onTyping]);

  useEffect(() => () => stopTyping(), [stopTyping]);

  const signalTyping = useCallback(() => {
    if (!typingRef.current) {
      typingRef.current = true;
      onTyping(true);
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  }, [onTyping, stopTyping]);

  const mentionMatch = /@([A-Za-z]*)$/.exec(value.slice(0, caret));
  const mentionCandidates = mentionMatch
    ? members.filter((m) => m.name.toLowerCase().startsWith(mentionMatch[1].toLowerCase()))
    : [];
  const showMentions = mentionCandidates.length > 0;

  const insertMention = (user: User) => {
    const before = value.slice(0, caret).replace(/@([A-Za-z]*)$/, `@${user.name} `);
    const next = before + value.slice(caret);
    const pos = before.length;
    setValue(next);
    setCaret(pos);
    setMentionIndex(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  };

  const format = (kind: FormatKind) => {
    const el = inputRef.current;
    if (!el) return;
    const { value: next, caret: pos } = applyFormat(value, el.selectionStart, el.selectionEnd, kind);
    setValue(next);
    setCaret(pos);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, 4);
    const next = await Promise.all(list.map(toAttachment));
    setAttachments((prev) => [...prev, ...next]);
  };

  const submit = () => {
    if (editing) {
      const trimmed = value.trim();
      if (trimmed) onSaveEdit(trimmed);
      setValue("");
      onCancelEdit();
      return;
    }
    if (!value.trim() && attachments.length === 0) return;
    onSend(value, attachments);
    setValue("");
    setAttachments([]);
    localStorageAdapter.saveDraft(chatId, "");
    stopTyping();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionCandidates.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionCandidates[mentionIndex]); return; }
      if (e.key === "Escape") { setMentionIndex(0); setValue((v) => `${v} `); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape" && editing) onCancelEdit();
  };

  const hasContent = value.trim().length > 0 || attachments.length > 0;

  return (
    <div
      className={`${styles.composerWrap} ${dropping ? styles.dropping : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDropping(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
      }}
    >
      {editing && (
        <div className={styles.editingBanner}>
          Editing message
          <button onClick={() => { onCancelEdit(); setValue(""); }}>Cancel</button>
        </div>
      )}

      {replyTo && !editing && (
        <div className={styles.replyPreview}>
          <div className={styles.rpText}>
            <b>Replying to {userById(replyTo.authorId).name}</b>
            <span>{stripFormatting(replyTo.body) || "Attachment"}</span>
          </div>
          <button onClick={onCancelReply} aria-label="Cancel reply">
            <svg viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      <div className={styles.toolbar}>
        <button className={styles.fmtBtn} onClick={() => format("bold")} title="Bold (**text**)"><b>B</b></button>
        <button className={styles.fmtBtn} onClick={() => format("italic")} title="Italic (_text_)"><i>I</i></button>
        <button className={styles.fmtBtn} onClick={() => format("strike")} title="Strikethrough (~~text~~)"><s>S</s></button>
        <button className={styles.fmtBtn} onClick={() => format("heading")} title="Heading (# text)">H</button>
      </div>

      {attachments.length > 0 && (
        <div className={styles.attachRow}>
          {attachments.map((a) => (
            <span key={a.id} className={styles.attachChip}>
              {a.dataUrl && <img src={a.dataUrl} alt="" />}
              {a.name.length > 18 ? `${a.name.slice(0, 18)}…` : a.name}
              <button onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))} aria-label="Remove">×</button>
            </span>
          ))}
        </div>
      )}

      <div className={styles.composerRow}>
        <div className={styles.composerPill}>
          <textarea
            ref={inputRef}
            className={styles.composerInput}
            rows={1}
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
              signalTyping();
            }}
            onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
            onKeyDown={onKeyDown}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                void addFiles(e.clipboardData.files);
              }
            }}
          />
          {showMentions && (
            <div className={styles.mentionPop}>
              {mentionCandidates.map((m, i) => (
                <button
                  key={m.id}
                  className={`${styles.mentionItem} ${i === mentionIndex ? styles.activeMention : ""}`}
                  onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                >
                  <img src={m.avatar} alt="" />
                  <span>{m.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className={`${styles.sendBtn} ${hasContent || editing ? styles.arrow : styles.mic}`}
          onClick={submit}
          aria-label={editing ? "Save edit" : hasContent ? "Send" : "Record voice note"}
        >
          {hasContent || editing ? (
            <svg viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 19v3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
