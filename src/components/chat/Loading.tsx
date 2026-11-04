"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { isOffline, NET_CHANGED, netDown, roundTrip } from "@/lib/chat/api";
import { IconClock, IconCloudOff, IconRetry } from "./Icons";
import l from "./loading.module.css";

/*
 * Loading and failing, for things that come from the network in the real app.
 * Everything here is local, so a short simulated round trip (see roundTrip)
 * stands in for the wait, and the developer panel's "Force Mind & network
 * failure" (or being offline) makes it fail.
 */

/** What has loaded once this session: it isn't loaded again on every visit, only the first. */
const loaded = new Set<string>();

/**
 * Something that came with what's already loaded (a collection's items, with
 * Mind home): ready at once, unless NOD can't be reached the first time it's
 * opened this session. Offline, it's what's on this phone. `retry` asks again.
 */
export function useOpened(key: string) {
  const [state, setState] = useState<"loading" | "ready" | "failed">(() => (loaded.has(key) || !netDown() || isOffline() ? "ready" : "failed"));
  useEffect(() => { if (state === "ready") loaded.add(key); }, [key, state]);
  const retry = useCallback(() => {
    setState("loading");
    void roundTrip().then((ok) => setState(ok || isOffline() ? "ready" : "failed"));
  }, []);
  return { state, retry };
}

/** Whether the phone is offline (really, or from the developer panel), kept up to date. */
export function useOffline() {
  return useSyncExternalStore(subscribeNet, isOffline, () => false);
}
function subscribeNet(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  window.addEventListener(NET_CHANGED, onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
    window.removeEventListener(NET_CHANGED, onChange);
  };
}

/**
 * The first time `key` is shown this session: "loading" for a moment, then
 * "ready", or "failed" when `canFail` and the network is down. Later visits
 * are "ready" straight away. `retry` tries again from a failure. Something
 * `cached` on the phone (Mind) is readable offline: only failing to reach
 * NOD while online fails it.
 */
export function useFirstLoad(key: string, { canFail = false, cached = false }: { canFail?: boolean; cached?: boolean } = {}) {
  const [state, setState] = useState<"loading" | "ready" | "failed">(() => (loaded.has(key) || (cached && isOffline()) ? "ready" : "loading"));
  const [attempt, setAttempt] = useState(0);
  // Another key (switching person) starts its own first load.
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setState(loaded.has(key) ? "ready" : "loading");
  }
  useEffect(() => {
    if (loaded.has(key)) return;
    let live = true;
    void roundTrip().then((ok) => {
      if (!live) return;
      if (ok || !canFail || (cached && isOffline())) { loaded.add(key); setState("ready"); } else setState("failed");
    });
    return () => { live = false; };
  }, [key, canFail, cached, attempt]);
  const retry = useCallback(() => { setState("loading"); setAttempt((n) => n + 1); }, []);
  return { state, retry };
}

/**
 * A search on its way to the server: "loading" for a moment each time
 * `query` changes, then "ready", or "failed" when the network is down.
 */
export function useSettled(query: string) {
  const [settled, setSettled] = useState<{ query: string; ok: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void roundTrip({ latencyMs: 250, jitterMs: 300 }).then((ok) => { if (live) setSettled({ query, ok }); });
    return () => { live = false; };
  }, [query, attempt]);
  const state: "loading" | "ready" | "failed" = !settled || settled.query !== query ? "loading" : settled.ok ? "ready" : "failed";
  const retry = useCallback(() => { setSettled(null); setAttempt((n) => n + 1); }, []);
  return { state, retry };
}

/**
 * Skeletons wait this long before showing, so a quick load doesn't flash.
 * Until then they hold their place, invisibly, so nothing jumps.
 */
const SKELETON_AFTER_MS = 300;
function useShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), SKELETON_AFTER_MS);
    return () => clearTimeout(t);
  }, []);
  return shown ? "" : l.waiting;
}

/** How far an upload has got, as a ring that fills, with the percentage inside. */
export function ProgressRing({ value, size = 44 }: { value: number; size?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <span className={l.ring} style={{ width: size, height: size }} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Uploading">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className={l.ringTrack} />
        <circle cx={size / 2} cy={size / 2} r={r} className={l.ringFill} strokeDasharray={c} strokeDashoffset={c * (1 - value)} />
      </svg>
      <b>{Math.round(value * 100)}</b>
    </span>
  );
}

/** One grey shape that shimmers while something loads. */
export function Bone({ w, h, r, className }: { w?: number | string; h?: number | string; r?: number | string; className?: string }) {
  return <i className={`${l.bone} ${className ?? ""}`} style={{ width: w, height: h, borderRadius: r }} aria-hidden="true" />;
}

/** In place of something that couldn't load ("your Mind", "Books"), not a toast: there's nothing behind it to look at. */
export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className={l.failed} role="alert">
      <span className={l.failedIcon}><IconCloudOff size={22} /></span>
      <b>Couldn’t load {what}</b>
      <small>Check your connection and try again.</small>
      <button className={l.retry} onClick={onRetry}><IconRetry size={16} /> Try again</button>
    </div>
  );
}

/** One quiet line while offline: what's shown is what's on this phone. It goes away by itself. */
export function OfflineLine() {
  return <span className={l.offline} role="status"><IconCloudOff size={13} /> Offline · showing what’s on this phone</span>;
}

/** An item that's only on this phone: waiting to send (a clock), or tried and not sent (Retry). */
export function Unsent({ state, onRetry }: { state: "waiting" | "failed"; onRetry: () => void }) {
  if (state === "waiting") return <span className={l.unsent} role="status"><IconClock size={12} /> Waiting to send</span>;
  return (
    <button
      type="button"
      className={`${l.unsent} ${l.unsentFailed}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onRetry(); }}
    >
      <IconRetry size={12} /> Didn’t send · Retry
    </button>
  );
}

/** A lookup that didn't answer, on one line, with Retry. */
export function RetryLine({ children, onRetry }: { children: React.ReactNode; onRetry: () => void }) {
  return (
    <p className={l.retryLine} role="alert">
      <span>{children}</span>
      <button type="button" onClick={onRetry}><IconRetry size={14} /> Retry</button>
    </p>
  );
}

/**
 * A photo or file on its way up, over its tile: a ring for a photo, a thin bar
 * along the bottom for a file. If it didn't make it, a retry arrow in its place.
 */
export function UploadMark({ kind, value, failed, onRetry }: { kind: "image" | "file"; value: number | null; failed: boolean; onRetry: () => void }) {
  if (failed) {
    return (
      <button
        type="button"
        className={l.uploadRetry}
        data-upload-mark
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onRetry(); }}
        aria-label="Didn’t upload. Try again"
      >
        <IconRetry size={18} />
      </button>
    );
  }
  if (value === null) return null;
  if (kind === "image") return <span className={l.uploadRing} data-upload-mark><ProgressRing value={value} size={44} /></span>;
  return (
    <span className={l.uploadBar} data-upload-mark role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Uploading">
      <i style={{ width: `${value * 100}%` }} />
    </span>
  );
}

/** Mind home while it loads: the folder cards' shapes, as many as there were last time (else six). */
export function FolderSkeleton({ count = 6 }: { count?: number }) {
  const wait = useShown();
  return (
    <div className={`${l.folders} ${wait}`} aria-label="Loading your Mind" role="status">
      <div className={l.folderBar}><Bone w={92} h={12} /><Bone w={132} h={30} r={999} /></div>
      <div className={l.folderGrid}>
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className={l.folder}>
            <Bone w={40} h={40} r={10} />
            <span className={l.lines}><Bone w="70%" h={15} /><Bone w="45%" h={11} /></span>
            <span className={l.peeks}><Bone w={28} h={28} r={8} /><Bone w={28} h={28} r={8} /><Bone w={28} h={28} r={8} /></span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Rows of results while a search runs, or a link is read. */
export function RowSkeleton({ rows = 4 }: { rows?: number }) {
  const wait = useShown();
  return (
    <div className={`${l.rows} ${wait}`} aria-label="Loading" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className={l.row}>
          <Bone w={40} h={40} r={10} />
          <span className={l.lines}><Bone w={`${60 - i * 6}%`} h={14} /><Bone w={`${38 + i * 5}%`} h={11} /></span>
        </span>
      ))}
    </div>
  );
}

/** Explore while it loads: the top pick, a heading and a shelf of cards. */
export function ExploreSkeleton() {
  const wait = useShown();
  return (
    <div className={`${l.explore} ${wait}`} aria-label="Loading Explore" role="status">
      <span className={l.hero}>
        <Bone h={168} r={0} className={l.heroCover} />
        <span className={l.heroBody}><Bone w="62%" h={20} /><Bone w="88%" h={12} /><Bone w="70%" h={12} /><Bone w={110} h={32} r={999} className={l.heroPill} /></span>
      </span>
      <span className={l.heading}><Bone w={150} h={18} /><Bone w={44} h={14} /></span>
      <span className={l.strip}>{[0, 1, 2].map((i) => <Bone key={i} w={112} h={112} r={16} />)}</span>
      <span className={l.heading}><Bone w={120} h={18} /></span>
      <span className={l.strip}>{[0, 1, 2].map((i) => <Bone key={i} w={112} h={112} r={16} />)}</span>
    </div>
  );
}

/** A book search on its way: rows the shape of book results. */
export function BookSkeleton() {
  const wait = useShown();
  return (
    <div className={`${l.rows} ${wait}`} aria-label="Searching the catalogues" role="status">
      {[0, 1, 2].map((i) => (
        <span key={i} className={l.row}>
          <Bone w={40} h={58} r={4} />
          <span className={l.lines}><Bone w={`${66 - i * 8}%`} h={14} /><Bone w="40%" h={11} /><Bone w="28%" h={10} /></span>
        </span>
      ))}
    </div>
  );
}

/** A video's still, before the link has been read. */
export function VideoSkeleton() {
  const wait = useShown();
  return <Bone w="100%" h={undefined} r={14} className={`${l.video} ${wait}`} />;
}

/**
 * A collection shared with you while it loads: the cover, its icon, name and
 * whose it is, then the grid. No buttons until it's known what you may do,
 * so nothing jumps when they come.
 */
export function SharedSkeleton() {
  const wait = useShown();
  return (
    <div className={`${l.shared} ${wait}`} aria-label="Loading the collection" role="status">
      <Bone h={168} r={24} />
      <Bone w={60} h={60} r={18} className={l.sharedIcon} />
      <span className={l.lines}><Bone w="58%" h={22} /><Bone w="44%" h={12} /></span>
      <span className={l.sharedGrid}>
        {[132, 96, 110, 150].map((h, i) => <Bone key={i} h={h} r={16} />)}
      </span>
    </div>
  );
}
