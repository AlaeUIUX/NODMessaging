"use client";

import { useMediaUrl } from "@/lib/chat/media";
import type { Attachment, Message } from "@/lib/chat/types";
import { IconDownload, IconFile } from "./Icons";
import styles from "./chat.module.css";

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Photo({ a, className }: { a: Attachment; className?: string }) {
  const url = useMediaUrl(a);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={url} alt={a.name} draggable={false} />
  ) : (
    <span className={`${className ?? ""} ${styles.photoLoading}`} aria-label="Loading photo" />
  );
}

/**
 * Photos sit on their own, never inside a text bubble. One photo keeps its
 * shape; several become a stacked collection with a count (Instagram-style).
 */
export function MediaBlock({ message, onOpen }: { message: Message; onOpen?: (index: number | "all") => void }) {
  const photos = message.attachments.filter((a) => a.kind === "image");
  if (!photos.length) return null;

  if (photos.length === 1) {
    const a = photos[0];
    const ratio = a.width && a.height ? a.width / a.height : 4 / 3;
    return (
      <div
        className={styles.photoSingle}
        style={{ aspectRatio: String(Math.min(Math.max(ratio, 0.66), 1.6)) }}
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
        aria-label="Open photo"
        onClick={() => onOpen?.(0)}
        onKeyDown={(e) => { if (e.key === "Enter" && onOpen) onOpen(0); }}
      >
        <Photo a={a} className={styles.photoImg} />
      </div>
    );
  }

  const layers = photos.slice(0, 3);
  return (
    <div
      className={styles.photoStack}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={`Open ${photos.length} photos`}
      onClick={() => onOpen?.("all")}
      onKeyDown={(e) => { if (e.key === "Enter" && onOpen) onOpen("all"); }}
    >
      {layers.slice(1).reverse().map((a, i) => (
        <span key={a.id} className={`${styles.stackCard} ${i === 0 && layers.length === 3 ? styles.stackBack2 : styles.stackBack1}`}>
          <Photo a={a} className={styles.photoImg} />
        </span>
      ))}
      <span className={`${styles.stackCard} ${styles.stackTop}`}>
        <Photo a={layers[0]} className={styles.photoImg} />
      </span>
      <span className={styles.stackCount}>{photos.length} photos</span>
    </div>
  );
}

/** One row per file: icon, name and size, and a download button, all on one axis. */
export function FileRow({ a }: { a: Attachment }) {
  const url = useMediaUrl(a);
  return (
    <div className={styles.fileRow}>
      <span className={styles.fileIcon}><IconFile size={24} /></span>
      <span className={styles.fileMeta}><b>{a.name}</b><small>{fileSize(a.size)}</small></span>
      {url ? (
        <a className={styles.fileDownload} href={url} download={a.name} onClick={(e) => e.stopPropagation()}>
          <IconDownload size={14} />Download
        </a>
      ) : (
        <span className={styles.fileDownload} aria-disabled="true">Loading…</span>
      )}
    </div>
  );
}
