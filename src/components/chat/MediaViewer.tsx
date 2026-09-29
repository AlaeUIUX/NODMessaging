"use client";

import { useEffect, useRef, useState } from "react";
import { initials } from "@/lib/chat/avatar";
import { useMediaUrl } from "@/lib/chat/media";
import { userById } from "@/lib/chat/store";
import type { Attachment, Chat, Message } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { IconBack, IconChevron, IconClose, IconDownload } from "./Icons";
import { Photo } from "./Media";
import { Sheet, useDialog } from "./ui";
import styles from "./chat.module.css";

const photosOf = (m: Message) => m.attachments.filter((a) => a.kind === "image");
const clock = (ts: number) => {
  const d = new Date(ts);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  return `${d.toLocaleDateString(undefined, days < 7 ? { weekday: "short" } : { month: "short", day: "numeric" })} ${time}`;
};

function DownloadLink({ a }: { a: Attachment }) {
  const url = useMediaUrl(a);
  if (!url) return null;
  return (
    <a className={styles.viewerBtn} href={url} download={a.name} target="_blank" rel="noopener noreferrer" aria-label="Download photo">
      <IconDownload size={20} />
    </a>
  );
}

/** Full-screen photo viewer: swipe or arrow between photos, thumbnails below. */
export function MediaViewer({ message, start, onClose }: { message: Message; start: number; onClose: () => void }) {
  const photos = photosOf(message);
  const [index, setIndex] = useState(start);
  const [closing, setClosing] = useState(false);
  const drag = useRef<{ x: number; dx: number; id: number; captured: boolean } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const author = userById(message.authorId);

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 220);
  };
  const go = (i: number) => setIndex(Math.max(0, Math.min(photos.length - 1, i)));
  useDialog(rootRef, close);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(photos.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settle = () => {
    const dx = drag.current?.dx ?? 0;
    drag.current = null;
    if (trackRef.current) {
      trackRef.current.style.transition = "";
      // React won't re-apply an unchanged style prop, so set the resting position explicitly.
      trackRef.current.style.transform = `translateX(${-index * 100}%)`;
    }
    return dx;
  };

  return (
    <div ref={rootRef} className={`${styles.viewer} ${closing ? styles.viewerClosing : ""}`} role="dialog" aria-modal="true" aria-label="Photo viewer">
      <header className={styles.viewerTop}>
        <button ref={closeRef} className={styles.viewerBtn} onClick={close} aria-label="Close"><IconClose size={20} /></button>
        <div className={styles.viewerMeta}>
          <b>{author.name}</b>
          <span>{photos.length > 1 ? `${index + 1} of ${photos.length} · ` : ""}{clock(message.createdAt)}</span>
        </div>
        <DownloadLink a={photos[index]} />
      </header>

      <div
        className={styles.viewerStage}
        onPointerDown={(e) => {
          // The arrows are plain buttons: capturing their pointer would steal their click.
          if ((e.target as HTMLElement).closest("button")) return;
          drag.current = { x: e.clientX, dx: 0, id: e.pointerId, captured: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !trackRef.current) return;
          d.dx = e.clientX - d.x;
          // Capture only once it's clearly a swipe, so a tap stays a tap.
          if (!d.captured && Math.abs(d.dx) > 6) {
            d.captured = true;
            try { e.currentTarget.setPointerCapture(d.id); } catch { /* pointer already gone */ }
          }
          if (!d.captured) return;
          trackRef.current.style.transition = "none";
          trackRef.current.style.transform = `translateX(calc(${-index * 100}% + ${d.dx}px))`;
        }}
        onPointerUp={() => {
          const dx = settle();
          if (dx < -60) go(index + 1);
          else if (dx > 60) go(index - 1);
        }}
        onPointerCancel={() => { settle(); }}
      >
        <div ref={trackRef} className={styles.viewerTrack} style={{ transform: `translateX(${-index * 100}%)` }}>
          {photos.map((a) => (
            <div key={a.id} className={styles.viewerSlide}><Photo a={a} className={styles.viewerImg} /></div>
          ))}
        </div>
        {photos.length > 1 && index > 0 && (
          <button className={`${styles.viewerArrow} ${styles.viewerPrev}`} onClick={() => go(index - 1)} aria-label="Previous photo"><IconBack size={20} /></button>
        )}
        {photos.length > 1 && index < photos.length - 1 && (
          <button className={`${styles.viewerArrow} ${styles.viewerNext}`} onClick={() => go(index + 1)} aria-label="Next photo"><IconChevron size={20} /></button>
        )}
      </div>

      {photos.length > 1 && (
        <div className={styles.viewerThumbs}>
          {photos.map((a, i) => (
            <button key={a.id} className={i === index ? styles.thumbOn : undefined} onClick={() => go(i)} aria-label={`Photo ${i + 1}`}>
              <Photo a={a} className={styles.photoImg} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Every photo in a collection, as a grid; tap one to open it full screen. */
export function MediaGrid({ message, onPick, onClose }: { message: Message; onPick: (i: number) => void; onClose: () => void }) {
  const photos = photosOf(message);
  return (
    <Sheet title={`${photos.length} photos`} onClose={onClose}>
      {(close) => (
        <>
          <p className={styles.gridFrom}>From {userById(message.authorId).name} · {clock(message.createdAt)}</p>
          <div className={styles.mediaGrid}>
            {photos.map((a, i) => (
              <button key={a.id} onClick={() => close(() => onPick(i))} aria-label={`Open photo ${i + 1}`}>
                <Photo a={a} className={styles.photoImg} />
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

/** Who has read a group message (and when), and who it's only delivered to. */
export function ReceiptSheet({ message, chat, onClose }: { message: Message; chat: Chat; onClose: () => void }) {
  const others = chat.memberIds.filter((id) => id !== message.authorId);
  const readBy = message.readBy ?? (message.status === "read" ? Object.fromEntries(others.map((id) => [id, 0])) : {});
  const read = others.filter((id) => id in readBy).sort((a, b) => readBy[a] - readBy[b]);
  const delivered = others.filter((id) => !(id in readBy));
  const row = (id: string, detail: string) => {
    const u = userById(id);
    return (
      <div key={id} className={styles.sheetRow}>
        <Avatar glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={36} shape="circle" />
        <span className={styles.srName}>{u.name}<small>{detail}</small></span>
      </div>
    );
  };
  return (
    <Sheet title="Message info" onClose={onClose}>
      <p className={styles.sheetLabel}>Read by {read.length}</p>
      {read.map((id) => row(id, readBy[id] ? clock(readBy[id]) : "Read"))}
      {delivered.length > 0 && <p className={styles.sheetLabel}>Delivered to {delivered.length}</p>}
      {delivered.map((id) => row(id, "Not read yet"))}
    </Sheet>
  );
}
