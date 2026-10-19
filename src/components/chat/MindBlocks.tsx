"use client";

import { useState } from "react";
import { initials } from "@/lib/chat/avatar";
import { emojify } from "@/lib/chat/emoji";
import { embedUrl, hostOf, parseVideo, videoProvider, type VideoRef } from "@/lib/chat/links";
import { stripFormatting } from "@/lib/chat/markdown";
import { daysUntil, isPast, lastSevenDays, todayKey, type Block } from "@/lib/chat/mind";
import { colorName, inkOn } from "@/lib/chat/palette";
import { useChat, userById } from "@/lib/chat/store";
import type { Message } from "@/lib/chat/types";
import { INKS, outcome, pathOf } from "./Artifacts";
import Avatar from "./Avatar";
import { fileSize, Photo } from "./Media";
import FileTypeIcon from "./FileTypeIcon";
import { IconBell, IconCheck, IconDownload, IconPlay } from "./Icons";
import { useMediaUrl } from "@/lib/chat/media";
import { useNow } from "./ui";
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
  note: "Note", link: "Link", video: "Video", book: "Book", quote: "Quote", flashcard: "Flashcard", todo: "To-do", reminder: "Reminder",
  progress: "Progress", image: "Image", palette: "Palette", file: "File", amount: "Amount", date: "Date", habit: "Habit", chat: "From a chat",
};

export function relDay(ts: number) {
  const days = daysUntil(ts);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

const HOUR = 3_600_000;

/**
 * When a reminder is, said the way a phone says it: "Tomorrow · 9:00" and
 * "in 15 hours"; `state` is how close it is (past, within two hours, later).
 */
export function whenOf(at: number, now = Date.now()) {
  const diff = at - now;
  const abs = Math.abs(diff);
  const d = new Date(at);
  const days = daysUntil(at);
  const day = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days === -1 ? "Yesterday"
    : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const clock = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const span = abs < 60_000 ? "" : abs < HOUR ? `${Math.round(abs / 60_000)} min` : abs < 36 * HOUR ? `${Math.round(abs / HOUR)} h` : "";
  const rel = abs < 60_000 ? "now" : span ? (diff > 0 ? `in ${span}` : `${span} ago`) : "";
  return { label: `${day} · ${clock}`, rel, state: diff < 0 ? "late" as const : diff < 2 * HOUR ? "soon" as const : "later" as const };
}

export function BlockView({ block, shape, onToggle, autoPlay }: {
  block: Block;
  shape: BlockShape;
  /** Tick a to-do (or one step of its checklist), mark a reminder done, count one more on progress, mark a habit today. */
  onToggle?: (stepId?: string) => void;
  /** Videos, in detail: start playing straight away (it was tapped to be watched). */
  autoPlay?: boolean;
}) {
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
    case "video": return <VideoBlock block={block} shape={shape} cls={cls} autoPlay={autoPlay} />;
    case "quote": return (
      <figure className={cls}>
        <blockquote>{block.title}</blockquote>
        {block.body && <figcaption>{block.body}</figcaption>}
      </figure>
    );
    case "flashcard": return <FlashcardBlock block={block} shape={shape} cls={cls} />;
    case "todo": if (block.checklist?.length) return <ChecklistBlock block={block} shape={shape} cls={cls} onToggle={onToggle} />;
      return (
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
    case "reminder": return <ReminderBlock block={block} cls={cls} onToggle={onToggle} />;
    case "progress": {
      // A goal and how far along it is: "7 / 22 chapters", how many to go, and +1 right on the card.
      const total = Math.max(1, block.total ?? 1);
      const value = Math.min(total, Math.max(0, block.value ?? 0));
      const pct = Math.round((value / total) * 100);
      const unit = block.unit?.trim();
      const reached = value >= total;
      return (
        <div className={`${cls} ${reached ? styles.mbReached : ""}`}>
          <span className={styles.mbProgHead}><b>{block.title}</b><em>{pct}%</em></span>
          <span className={styles.mbBar}><i style={{ width: `${pct}%` }} /></span>
          <span className={styles.mbProgressFoot}>
            <span><b>{value}</b> / {total}{unit ? ` ${unit}` : ""}</span>
            <span className={styles.mbProgLeft}>{reached ? <><IconCheck size={11} /> Goal reached</> : `${total - value} to go`}</span>
            {shape !== "detail" && !reached && onToggle && (
              <button className={styles.mbPlusOne} onClick={(e) => { e.stopPropagation(); onToggle(); }} onPointerDown={(e) => e.stopPropagation()} aria-label={`One more${unit ? ` of ${unit}` : ""}`}>+1</button>
            )}
          </span>
        </div>
      );
    }
    // A picture is the whole card, like a pin: no title or caption on it. Tapping it opens its tags and the rest.
    case "image": return (
      <figure className={cls}>
        {block.attachment ? <Photo a={block.attachment} /> : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={block.image} alt={block.title || "Image"} draggable={false} loading="lazy" />
        )}
      </figure>
    );
    case "palette": return (
      <div className={cls}>
        <span className={styles.mbSwatches}>
          {block.colors?.map((c, i) => (
            <i key={`${i}${c}`} style={{ background: c, color: inkOn(c) }} title={`${colorName(c)} ${c}`}>
              {shape === "detail" && <small>{c.replace("#", "")}</small>}
            </i>
          ))}
        </span>
        <span className={styles.mbText}><b>{block.title}</b>{shape === "detail" && <small>{block.colors?.map(colorName).join(" · ")}</small>}</span>
      </div>
    );
    case "file": return (
      <div className={cls}>
        <FileTypeIcon name={block.attachment?.name ?? block.title} mime={block.attachment?.mime} size={30} />
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

/**
 * A to-do with steps: its name, how many are done, and the steps themselves,
 * each ticked off right on the card. The sheet shows (and edits) all of them.
 */
function ChecklistBlock({ block, shape, cls, onToggle }: { block: Block; shape: BlockShape; cls: string; onToggle?: (stepId?: string) => void }) {
  const steps = block.checklist ?? [];
  const done = steps.filter((s) => s.done).length;
  const max = shape === "detail" ? steps.length : shape === "row" ? 3 : 5;
  const shown = steps.slice(0, max);
  return (
    <div className={`${cls} ${styles.mbList} ${block.done ? styles.mbListDone : ""}`}>
      <span className={styles.mbListHead}>
        <b>{block.title}</b>
        <em>{block.done ? <IconCheck size={11} /> : null}{done}/{steps.length}</em>
      </span>
      <span className={styles.mbBar}><i style={{ width: `${(done / Math.max(1, steps.length)) * 100}%` }} /></span>
      <ul className={styles.mbSteps}>
        {shown.map((s) => (
          <li key={s.id} className={s.done ? styles.mbStepDone : undefined}>
            <button
              className={`${styles.mbCheck} ${styles.mbCheckSm} ${s.done ? styles.mbCheckOn : ""}`}
              onClick={(e) => { e.stopPropagation(); onToggle?.(s.id); }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={s.done ? `${s.text}: mark as not done` : `${s.text}: mark as done`}
              aria-pressed={s.done}
            >
              {s.done && <IconCheck size={10} />}
            </button>
            <span>{s.text}</span>
          </li>
        ))}
      </ul>
      {steps.length > shown.length && <small className={styles.mbMore}>+{steps.length - shown.length} more</small>}
    </div>
  );
}

/** A reminder: what, and when (orange when it's close, red once it's past), ticked off once it's dealt with. */
function ReminderBlock({ block, cls, onToggle }: { block: Block; cls: string; onToggle?: (stepId?: string) => void }) {
  const now = useNow(30_000);
  const w = whenOf(block.at ?? now, now);
  const state = block.done ? "done" : w.state;
  return (
    <div className={`${cls} ${block.done ? styles.mbDone : ""}`}>
      <button
        className={`${styles.mbCheck} ${block.done ? styles.mbCheckOn : ""}`}
        onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={block.done ? "Mark as not done" : "Mark as done"}
        aria-pressed={!!block.done}
      >
        {block.done && <IconCheck size={12} />}
      </button>
      <span className={styles.mbText}>
        <b>{block.title}</b>
        <small className={`${styles.mbWhen} ${styles[`mbWhen_${state}`]}`}>
          <IconBell size={11} /> {w.label}{w.rel && !block.done ? ` · ${w.rel}` : ""}
        </small>
      </span>
    </div>
  );
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

/** A book's cover: the real one when the catalogue had it, else one drawn from its title. */
function BookBlock({ block, shape, cls }: { block: Block; shape: BlockShape; cls: string }) {
  const label = block.shelf === "reading" ? "Reading" : block.shelf === "read" ? "Finished" : "Want to read";
  const shelf = <span className={`${styles.mbShelf} ${block.shelf === "reading" ? styles.mbShelfOn : ""}`}>{label}</span>;
  // The drawn cover stays underneath a real one: it shows while the picture loads, and if it never does.
  const cover = (
    <span className={`${styles.mbCover} ${block.image ? styles.mbCoverArt : ""}`} style={{ ["--c" as string]: toneFor(block.title) }}>
      <b>{block.title}</b>
      {shape !== "row" && <small>{block.source}</small>}
      {block.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.image} alt={`${block.title}, the cover`} loading="lazy" draggable={false} onError={(e) => { e.currentTarget.hidden = true; }} />
      )}
    </span>
  );
  if (shape === "detail") {
    const facts = [block.year, block.pages ? `${block.pages} pages` : "", block.isbn ? `ISBN ${block.isbn}` : ""].filter(Boolean).join(" · ");
    return (
      <div className={cls}>
        {cover}
        <span className={styles.mbText}>
          <b>{block.title}</b>
          {block.source && <small>{block.source}</small>}
          {facts && <small className={styles.mbFacts}>{facts}</small>}
          {shelf}
        </span>
        {block.body && <Blurb text={block.body} />}
      </div>
    );
  }
  return (
    <div className={cls}>
      {cover}
      <span className={styles.mbText}>
        {shape === "row" && <b>{block.title}</b>}
        {shape === "row" && <small>{block.source}</small>}
        {shelf}
      </span>
    </div>
  );
}

/** A long description, a few lines of it until More. */
function Blurb({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 240;
  return (
    <span className={styles.mbBlurb}>
      <span className={long && !open ? styles.mbBlurbShut : undefined}>{text}</span>
      {long && (
        <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>{open ? "Less" : "More"}</button>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Videos — a still with a play button; in detail, the player itself
--------------------------------------------------------------------------- */

function VideoBlock({ block, shape, cls, autoPlay }: { block: Block; shape: BlockShape; cls: string; autoPlay?: boolean }) {
  const video = block.url ? parseVideo(block.url) : null;
  const site = video ? videoProvider(video) : block.url ? hostOf(block.url) : "";
  const by = [block.source, site].filter((x, i, all) => x && all.indexOf(x) === i).join(" · ");
  const still = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {block.image && <img src={block.image} alt="" loading="lazy" draggable={false} />}
      <span className={styles.mbPlay}><IconPlay size={shape === "row" ? 12 : shape === "detail" ? 20 : 16} /></span>
      {block.duration && <em>{block.duration}</em>}
    </>
  );
  return (
    <div className={cls}>
      {shape === "detail" && video ? (
        <VideoPlayer key={video.id} video={video} title={block.title} autoPlay={!!autoPlay}>{still}</VideoPlayer>
      ) : shape === "detail" && block.url ? (
        // Not a video NOD can play here: the still opens it where it lives.
        <a className={styles.mbThumb} style={{ ["--c" as string]: toneFor(block.title) }} href={block.url} target="_blank" rel="noopener noreferrer" aria-label={`Watch ${block.title} on ${site}`}>{still}</a>
      ) : (
        <span className={styles.mbThumb} style={{ ["--c" as string]: toneFor(block.title) }}>{still}</span>
      )}
      <span className={styles.mbText}><b>{block.title}</b>{by && <small>{by}</small>}</span>
    </div>
  );
}

/**
 * YouTube or Vimeo, playing right here. Tapping a video in Mind opens it
 * already playing; elsewhere (Explore, a group) the still waits for a tap.
 */
function VideoPlayer({ video, title, autoPlay, children }: { video: VideoRef; title: string; autoPlay: boolean; children: React.ReactNode }) {
  const [playing, setPlaying] = useState(autoPlay);
  if (playing) {
    return (
      <span className={`${styles.mbThumb} ${styles.mbPlayer}`}>
        {/* YouTube refuses embeds that send no referrer (its "error 153"), so the origin goes along. */}
        <iframe
          src={embedUrl(video, true)}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </span>
    );
  }
  return (
    <button type="button" className={`${styles.mbThumb} ${styles.mbPlayBtn}`} style={{ ["--c" as string]: toneFor(title) }} onClick={(e) => { e.stopPropagation(); setPlaying(true); }} aria-label={`Play ${title}`}>
      {children}
    </button>
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

  // In a collection someone shared with you, a save from a chat you're not in stays theirs to read.
  if (chat && !chat.memberIds.includes(me)) {
    return (
      <div className={`${cls} ${styles.mbGone}`}>
        <span className={styles.mbText}><b>{block.title}</b><small>Saved from a chat you’re not in</small></span>
      </div>
    );
  }
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
        <Avatar glyph={initials(author.fullName)} tone={author.tone} photo={author.photo} size={18} shape="circle" />
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
    if (card.invoice) return <span className={styles.mbLiveBody}><b>Invoice {card.invoice.number} · {euro(card.amount)}</b><small>{card.paidBy.length ? "Paid" : `Billed to ${userById(card.from[0]).name} · unpaid`}</small></span>;
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
        <FileTypeIcon name={file.name} mime={file.mime} size={26} />
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
