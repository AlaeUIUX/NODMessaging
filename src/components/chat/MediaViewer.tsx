"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animateSpring, project, SPRINGS, VelocityTracker } from "@/lib/chat/motion";
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

/**
 * Full-screen photo viewer: swipe, arrow or tap a thumbnail between photos;
 * swipe down to close. Both follow the finger and finish on a spring from its
 * speed, the way the iPhone's Photos does (lib/chat/motion.ts).
 */
export function MediaViewer({ message, start, onClose }: { message: Message; start: number; onClose: () => void }) {
  const photos = photosOf(message);
  const [index, setIndex] = useState(start);
  const [closing, setClosing] = useState(false);
  const drag = useRef<{ x: number; y: number; id: number; mode: "" | "page" | "dismiss"; base: number; track: VelocityTracker } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const author = userById(message.authorId);

  /** The track's position in px (0 = first photo), the pull-down, and the springs moving them. */
  const pos = useRef(-start * 400);
  const pullY = useRef(0);
  const pageSpring = useRef<(() => { x: number; v: number }) | null>(null);
  const pullSpring = useRef<(() => { x: number; v: number }) | null>(null);
  const flingV = useRef(0);
  const width = () => stageRef.current?.offsetWidth ?? 400;
  const paintTrack = (x: number) => {
    pos.current = x;
    if (trackRef.current) trackRef.current.style.transform = `translate3d(${x}px,0,0)`;
  };
  /** Pulled down: the photo follows and shrinks a little, and the black thins out behind it. */
  const paintPull = (y: number) => {
    pullY.current = y;
    const p = Math.min(1, Math.max(0, y) / 320);
    if (stageRef.current) stageRef.current.style.transform = Math.abs(y) < .01 ? "" : `translate3d(0,${y}px,0) scale(${1 - p * .18})`;
    const root = rootRef.current;
    if (root) {
      root.style.backgroundColor = p ? `rgba(0,0,0,${1 - p * .85})` : "";
      root.style.setProperty("--chrome", String(1 - Math.min(1, p * 2.5)));
    }
  };
  useEffect(() => () => { pageSpring.current?.(); pullSpring.current?.(); }, []);
  // Every change of photo (a swipe, an arrow, a thumbnail, a key) springs the track there,
  // carrying a swipe's own speed.
  useLayoutEffect(() => {
    if (drag.current?.mode === "page") return;
    const to = -index * width();
    pageSpring.current?.();
    if (Math.abs(pos.current - to) < .5 || !trackRef.current?.style.transform) { paintTrack(to); return; }
    pageSpring.current = animateSpring({ from: pos.current, to, velocity: flingV.current, spring: SPRINGS.page, onFrame: paintTrack });
    flingV.current = 0;
  }, [index]);

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

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // The arrows are plain buttons: capturing their pointer would steal their click.
    if ((e.target as HTMLElement).closest("button") || e.button > 0) return;
    const track = new VelocityTracker();
    track.reset(e.timeStamp, e.clientX);
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, mode: "", base: 0, track };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.mode) {
      // Decide once it's clearly a swipe, so a tap stays a tap: sideways pages, down closes.
      if (Math.hypot(dx, dy) < 6) return;
      d.mode = Math.abs(dx) >= Math.abs(dy) ? (photos.length > 1 ? "page" : "") : dy > 0 ? "dismiss" : "";
      if (!d.mode) { drag.current = null; return; }
      try { e.currentTarget.setPointerCapture(d.id); } catch { /* pointer already gone */ }
      // Caught mid-spring: it stops under the finger and carries on from there.
      if (d.mode === "page") {
        const caught = pageSpring.current?.();
        pageSpring.current = null;
        d.base = (caught?.x ?? pos.current) - dx;
        d.track.reset(e.timeStamp, e.clientX);
      } else {
        pullSpring.current?.();
        pullSpring.current = null;
        d.base = pullY.current - dy;
        d.track.reset(e.timeStamp, e.clientY);
      }
    }
    if (d.mode === "page") {
      d.track.add(e.timeStamp, e.clientX);
      let x = d.base + dx;
      // Past the first or last photo it gives a third and resists.
      const min = -(photos.length - 1) * width();
      if (x > 0) x *= .3;
      else if (x < min) x = min + (x - min) * .3;
      paintTrack(x);
    } else {
      d.track.add(e.timeStamp, e.clientY);
      const y = d.base + dy;
      paintPull(y > 0 ? y : y * .2);
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.mode) return;
    const v = d.track.velocity();
    if (d.mode === "page") {
      // Like Photos: any real flick turns the page that way; a slow drag goes to whichever photo is past half.
      const w = width();
      const aimed = Math.abs(v) > 300 ? index + (v < 0 ? 1 : -1) : Math.round(-pos.current / w);
      const next = Math.max(0, Math.min(photos.length - 1, Math.max(index - 1, Math.min(index + 1, aimed))));
      flingV.current = v;
      if (next === index) {
        pageSpring.current = animateSpring({ from: pos.current, to: -index * w, velocity: v, spring: SPRINGS.page, onFrame: paintTrack });
        flingV.current = 0;
      } else setIndex(next);
      return;
    }
    // Pulled down far enough, or flicked: it carries on down and the viewer goes.
    if (project(pullY.current, v) > 140 || v > 900) {
      const h = rootRef.current?.offsetHeight ?? 800;
      if (rootRef.current) rootRef.current.style.pointerEvents = "none";
      pullSpring.current = animateSpring({ from: pullY.current, to: h * .7, velocity: Math.max(v, 1200), spring: SPRINGS.exit, onFrame: paintPull, onDone: onClose });
    } else {
      pullSpring.current = animateSpring({ from: pullY.current, to: 0, velocity: v, onFrame: paintPull });
    }
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
        ref={stageRef}
        className={styles.viewerStage}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div ref={trackRef} className={styles.viewerTrack}>
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
