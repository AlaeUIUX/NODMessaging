"use client";

import { useState } from "react";
import { initials } from "@/lib/chat/avatar";
import { emojify } from "@/lib/chat/emoji";
import { stripFormatting } from "@/lib/chat/markdown";
import { daysUntil, isPast, lastSevenDays, todayKey, type Block } from "@/lib/chat/mind";
import { useChat, userById } from "@/lib/chat/store";
import type { Message } from "@/lib/chat/types";
import { INKS, outcome, pathOf } from "./Artifacts";
import Avatar from "./Avatar";
import { fileSize, Photo } from "./Media";
import { IconCheck, IconDownload, IconFile, IconPlay } from "./Icons";
import { useMediaUrl } from "@/lib/chat/media";
import styles from "./chat.module.css";

/**
 * How each kind of block looks. One component, three shapes:
 * a tile (grid, shelf, board), a row (list) and a large detail view.
 */

export type BlockShape = "tile" | "row" | "detail";

const euro = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** A stable tone from any string, for generated covers. */
const COVER_TONES = ["#3E67A6", "#C4573F", "#5B8A6B", "#C99432", "#86507A", "#4E7C8A", "#B0664F", "#2E2D2B"];
export function toneFor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COVER_TONES[h % COVER_TONES.length];
}

export const KIND_LABEL: Record<Block["kind"], string> = {
  note: "Note", link: "Link", video: "Video", book: "Book", quote: "Quote", flashcard: "Flashcard", todo: "To-do",
  progress: "Progress", image: "Image", palette: "Palette", file: "File", amount: "Amount", date: "Date", habit: "Habit", chat: "From a chat",
};

export function relDay(ts: number) {
  const days = daysUntil(ts);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export function BlockView({ block, shape, onToggle }: { block: Block; shape: BlockShape; onToggle?: () => void }) {
  const cls = `${styles.mb} ${styles[`mb_${shape}`]} ${styles[`mbk_${block.kind}`] ?? ""}`;
  switch (block.kind) {
    case "book": return <BookBlock block={block} shape={shape} cls={cls} />;
    case "link": return (
      <div className={cls}>
        <span className={styles.mbFav} style={{ background: toneFor(block.source ?? block.title) }}>{(block.source ?? "?")[0].toUpperCase()}</span>
        <span className={styles.mbText}>
          <b>{block.title}</b>
          <small>{block.source}</small>
        </span>
      </div>
    );
    case "video": return (
      <div className={cls}>
        <span className={styles.mbThumb} style={{ ["--c" as string]: toneFor(block.title) }}>
          <span className={styles.mbPlay}><IconPlay size={shape === "row" ? 12 : 16} /></span>
          {block.duration && <em>{block.duration}</em>}
        </span>
        <span className={styles.mbText}><b>{block.title}</b><small>{block.source}</small></span>
      </div>
    );
    case "quote": return (
      <figure className={cls}>
        <blockquote>{block.title}</blockquote>
        {block.body && <figcaption>{block.body}</figcaption>}
      </figure>
    );
    case "flashcard": return <FlashcardBlock block={block} shape={shape} cls={cls} />;
    case "todo": return (
      <div className={`${cls} ${block.done ? styles.mbDone : ""}`}>
        <button
          className={`${styles.mbCheck} ${block.done ? styles.mbCheckOn : ""}`}
          onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
          aria-label={block.done ? "Mark as not done" : "Mark as done"}
          aria-pressed={!!block.done}
        >
          {block.done && <IconCheck size={12} />}
        </button>
        <span className={styles.mbText}><b>{block.title}</b>{block.tags.length > 0 && shape !== "row" && <small>{block.tags.map((t) => `#${t}`).join(" ")}</small>}</span>
      </div>
    );
    case "progress": {
      const pct = Math.round(((block.value ?? 0) / Math.max(1, block.total ?? 1)) * 100);
      return (
        <div className={cls}>
          <span className={styles.mbText}><b>{block.title}</b><small>{block.source}</small></span>
          <span className={styles.mbBar}><i style={{ width: `${pct}%` }} /></span>
          <span className={styles.mbProgressFoot}><b>{block.value}</b> of {block.total} · {pct}%</span>
        </div>
      );
    }
    case "image": return (
      <figure className={cls}>
        {block.attachment ? <Photo a={block.attachment} /> : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={block.image} alt={block.title} draggable={false} loading="lazy" />
        )}
        {shape !== "tile" ? <figcaption><b>{block.title}</b><small>{block.source}</small></figcaption> : <figcaption>{block.title}</figcaption>}
      </figure>
    );
    case "palette": return (
      <div className={cls}>
        <span className={styles.mbSwatches}>{block.colors?.map((c) => <i key={c} style={{ background: c }} title={c} />)}</span>
        <span className={styles.mbText}><b>{block.title}</b>{shape === "detail" && <small>{block.colors?.join(" · ")}</small>}</span>
      </div>
    );
    case "file": return (
      <div className={cls}>
        <span className={styles.mbFileIcon}><IconFile size={20} /></span>
        <span className={styles.mbText}><b>{block.title}</b><small>{block.size ? fileSize(block.size) : "File"}</small></span>
        {block.attachment && <FileLink block={block} />}
      </div>
    );
    case "amount": {
      const overdue = !block.paid && isPast(block.at ?? 0);
      return (
        <div className={cls}>
          <span className={styles.mbText}><small>{block.title} · {block.source}</small><b className={styles.mbAmount}>{euro(block.amount ?? 0)}</b></span>
          <span className={`${styles.mbPill} ${block.paid ? styles.mbPaid : overdue ? styles.mbOverdue : styles.mbDue}`}>
            {block.paid ? "Paid" : !block.at ? "Unpaid" : overdue ? `Overdue · ${relDay(block.at)}` : `Due ${relDay(block.at)}`}
          </span>
        </div>
      );
    }
    case "date": {
      const d = new Date(block.at ?? 0);
      const n = daysUntil(block.at ?? 0);
      return (
        <div className={cls}>
          <span className={styles.mbCal}><em>{d.toLocaleDateString(undefined, { month: "short" })}</em><b>{d.getDate()}</b></span>
          <span className={styles.mbText}><b>{block.title}</b><small>{n === 0 ? "Today" : n > 0 ? `In ${n} day${n === 1 ? "" : "s"}` : `${-n} day${n === -1 ? "" : "s"} ago`}</small></span>
        </div>
      );
    }
    case "habit": {
      const doneToday = block.days?.includes(todayKey());
      return (
        <div className={cls}>
          <span className={styles.mbText}><b>{block.title}</b><small>{block.days?.length ?? 0} days in total</small></span>
          <span className={styles.mbWeek}>{lastSevenDays().map((d) => <i key={d} className={block.days?.includes(d) ? styles.mbWeekOn : undefined} />)}</span>
          <button
            className={`${styles.mbHabitBtn} ${doneToday ? styles.mbHabitDone : ""}`}
            onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
            aria-pressed={!!doneToday}
          >
            {doneToday ? <><IconCheck size={12} /> Done today</> : "Mark today"}
          </button>
        </div>
      );
    }
    case "chat": return <LiveChatBlock block={block} shape={shape} cls={cls} />;
    case "note":
    default: return (
      <div className={cls}>
        <span className={styles.mbText}><b>{block.title}</b>{block.body && <span className={styles.mbBody}>{block.body}</span>}</span>
      </div>
    );
  }
}

function FileLink({ block }: { block: Block }) {
  const url = useMediaUrl(block.attachment!);
  if (!url) return null;
  return (
    <a className={styles.mbOpen} href={url} download={block.title} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <IconDownload size={14} />
    </a>
  );
}

function BookBlock({ block, shape, cls }: { block: Block; shape: BlockShape; cls: string }) {
  const label = block.shelf === "reading" ? "Reading" : block.shelf === "read" ? "Finished" : "Want to read";
  return (
    <div className={cls}>
      <span className={styles.mbCover} style={{ ["--c" as string]: toneFor(block.title) }}>
        <b>{block.title}</b>
        {shape !== "row" && <small>{block.source}</small>}
      </span>
      <span className={styles.mbText}>
        {shape === "row" && <b>{block.title}</b>}
        {shape === "row" && <small>{block.source}</small>}
        <span className={`${styles.mbShelf} ${block.shelf === "reading" ? styles.mbShelfOn : ""}`}>{label}</span>
      </span>
    </div>
  );
}

function FlashcardBlock({ block, shape, cls }: { block: Block; shape: BlockShape; cls: string }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div
      className={`${cls} ${flipped ? styles.mbFlipped : ""}`}
      onClick={(e) => { if (shape !== "detail") { e.stopPropagation(); setFlipped((f) => !f); } }}
      role="button"
      tabIndex={0}
      aria-label={flipped ? `${block.title}: ${block.back}` : `Flashcard: ${block.title}. Tap to flip.`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFlipped((f) => !f); } }}
    >
      <span className={styles.mbCardInner}>
        <span className={styles.mbFace}>{block.due && <i className={styles.mbDueDot} aria-label="Due" />}<b>{block.title}</b></span>
        <span className={`${styles.mbFace} ${styles.mbBack}`}><b>{block.back}</b></span>
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Live chat items — read straight from the conversation, so they update
--------------------------------------------------------------------------- */

function LiveChatBlock({ block, shape, cls }: { block: Block; shape: BlockShape; cls: string }) {
  const { state, me } = useChat();
  const ref = block.ref!;
  const chat = state.data.chats.find((c) => c.id === ref.chatId);
  const message = state.data.messages[ref.chatId]?.find((m) => m.id === ref.messageId)
    ?? state.data.archive[ref.chatId]?.find((m) => m.id === ref.messageId);
  const where = chat ? (chat.kind === "group" ? chat.name : userById(chat.memberIds.find((id) => id !== me) ?? chat.memberIds[0]).name) : "a chat";

  if (!message || message.deletedAt) {
    return (
      <div className={`${cls} ${styles.mbGone}`}>
        <span className={styles.mbText}><b>{block.title}</b><small>The original was deleted · kept from {where}</small></span>
      </div>
    );
  }
  const author = userById(message.authorId);
  return (
    <div className={cls}>
      <span className={styles.mbLiveHead}>
        <Avatar glyph={initials(author.fullName)} tone={author.tone} size={18} shape="circle" />
        <span>{message.authorId === me ? "You" : author.name} · {where}</span>
        {message.kind === "card" && <em className={styles.mbLive}><i />Live</em>}
      </span>
      <LivePreview message={message} shape={shape} me={me} />
    </div>
  );
}

function LivePreview({ message, shape, me }: { message: Message; shape: BlockShape; me: string }) {
  const card = message.card;
  const lines = shape === "detail" ? 99 : shape === "row" ? 2 : 4;

  if (card?.type === "checklist") {
    const done = card.items.filter((i) => i.doneBy).length;
    return (
      <span className={styles.mbLiveBody}>
        <b>{card.title}</b>
        <span className={styles.mbBar}><i style={{ width: `${(done / Math.max(1, card.items.length)) * 100}%` }} /></span>
        <small>{done} of {card.items.length} done</small>
        {shape !== "row" && (
          <ul className={styles.mbMiniList}>
            {card.items.slice(0, shape === "detail" ? 20 : 3).map((it) => (
              <li key={it.id} className={it.doneBy ? styles.mbMiniDone : undefined}>
                <span>{it.doneBy && <IconCheck size={9} />}</span>{it.label}
              </li>
            ))}
          </ul>
        )}
      </span>
    );
  }
  if (card?.type === "poll") {
    const total = card.options.reduce((n, o) => n + o.votes.length, 0);
    return (
      <span className={styles.mbLiveBody}>
        <b>{card.question}</b>
        {shape !== "row" ? card.options.slice(0, 4).map((o) => {
          const pct = total ? Math.round((o.votes.length / total) * 100) : 0;
          return (
            <span key={o.id} className={styles.mbPollRow}>
              <span className={styles.mbPollFill} style={{ width: `${pct}%` }} />
              <span>{o.label}</span><em>{pct}%</em>
            </span>
          );
        }) : <small>{total} votes</small>}
      </span>
    );
  }
  if (card?.type === "sketch") {
    return (
      <span className={styles.mbLiveBody}>
        <b>{card.prompt}</b>
        <svg viewBox="0 0 300 220" className={styles.mbSketch} aria-hidden="true">
          {card.strokes.map((s) => <path key={s.id} d={pathOf(s.pts)} stroke={INKS[s.color] ?? INKS.ink} strokeWidth={s.size} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
        </svg>
      </span>
    );
  }
  if (card?.type === "wheel") {
    const last = card.spins[card.spins.length - 1];
    return <span className={styles.mbLiveBody}><b>{card.question}</b><small>{last ? `Landed on ${card.options[last.index]}` : `${card.options.length} options · not spun yet`}</small></span>;
  }
  if (card?.type === "tictactoe") {
    const res = outcome(card.board);
    return <span className={styles.mbLiveBody}><b>Tic-tac-toe</b><small>{res ? (res.winner === "draw" ? "A draw" : `${res.winner === me ? "You" : userById(res.winner).name} won`) : "Game in progress"}</small></span>;
  }
  if (card?.type === "payment") {
    return <span className={styles.mbLiveBody}><b>{euro(card.amount)} · {card.note}</b><small>{card.paidBy.length} of {card.from.length} paid</small></span>;
  }
  if (card?.type === "event") {
    const going = Object.values(card.rsvps).filter((r) => r === "going").length;
    return <span className={styles.mbLiveBody}><b>{card.title}</b><small>{going} going · {card.place}</small></span>;
  }
  if (card?.type === "reminder") return <span className={styles.mbLiveBody}><b>{card.text}</b><small>Reminder</small></span>;
  if (card?.type === "location") return <span className={styles.mbLiveBody}><b>{card.place}</b><small>{card.address}</small></span>;

  const photos = message.attachments.filter((a) => a.kind === "image");
  if (photos.length) {
    return (
      <span className={styles.mbLiveBody}>
        <span className={`${styles.mbPhotos} ${photos.length === 1 ? styles.mbPhotosOne : ""}`}>
          {photos.slice(0, 4).map((a) => <Photo key={a.id} a={a} className={styles.photoImg} />)}
        </span>
        {message.body && <small>{stripFormatting(message.body)}</small>}
      </span>
    );
  }
  const file = message.attachments.find((a) => a.kind === "file");
  if (file) {
    return (
      <span className={`${styles.mbLiveBody} ${styles.mbLiveFile}`}>
        <span className={styles.mbFileIcon}><IconFile size={18} /></span>
        <span className={styles.mbText}><b>{file.name}</b><small>{fileSize(file.size)}</small></span>
      </span>
    );
  }
  return (
    <span className={styles.mbLiveBody}>
      <span className={styles.mbQuoteText} style={{ WebkitLineClamp: lines }}>{emojify(stripFormatting(message.body))}</span>
    </span>
  );
}
