"use client";

import { useEffect, useState } from "react";
import type { Attachment } from "./types";

/**
 * Attachment bytes live in IndexedDB, not in the message. Messages stay small
 * (so localStorage and the cross-tab channel never choke on a 20 MB video), and
 * another tab of the same browser can still open the file by id.
 */
const DB = "nod-media";
const STORE = "blobs";
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(id: string, blob: Blob) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function get(id: string): Promise<Blob | null> {
  const db = await open();
  return new Promise((resolve) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => resolve(null);
  });
}

/** Object URLs by attachment id, so each file is read from disk once per tab. */
const urls = new Map<string, string>();

function naturalSize(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/** Turns a picked/pasted/dropped file into an attachment, storing its bytes. */
export async function toAttachment(file: File): Promise<Attachment | null> {
  if (file.size > MAX_ATTACHMENT_BYTES) return null;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  urls.set(id, URL.createObjectURL(file));
  const dims = await naturalSize(file);
  try {
    await put(id, file);
  } catch {
    // Private mode or quota: this tab can still show it from memory.
  }
  return {
    id,
    kind: file.type.startsWith("image/") ? "image" : "file",
    name: file.name || (file.type.startsWith("image/") ? "photo.png" : "file"),
    size: file.size,
    mime: file.type || undefined,
    stored: "idb",
    ...(dims ?? {}),
  };
}

function initialUrl(a: Attachment) {
  return a.url ?? a.dataUrl ?? urls.get(a.id) ?? null;
}

/** A displayable URL for an attachment: remote, inline, or loaded from IndexedDB. */
export function useMediaUrl(a: Attachment): string | null {
  const [url, setUrl] = useState<string | null>(() => initialUrl(a));
  useEffect(() => {
    if (initialUrl(a) || a.stored !== "idb") return;
    let live = true;
    void get(a.id).then((blob) => {
      if (!blob || !live) return;
      const u = URL.createObjectURL(blob);
      urls.set(a.id, u);
      setUrl(u);
    });
    return () => { live = false; };
  }, [a]);
  return url ?? initialUrl(a);
}
