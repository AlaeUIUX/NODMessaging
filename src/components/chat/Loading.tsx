"use client";

import { useCallback, useEffect, useState } from "react";
import { netDown, netFailureText, roundTrip } from "@/lib/chat/api";
import { IconCloudOff, IconRetry } from "./Icons";
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
 * The first time `key` is shown this session: "loading" for a moment, then
 * "ready", or "failed" when `canFail` and the network is down. Later visits
 * are "ready" straight away. `retry` tries again from a failure.
 */
export function useFirstLoad(key: string, { canFail = false }: { canFail?: boolean } = {}) {
  const [state, setState] = useState<"loading" | "ready" | "failed">(() => (loaded.has(key) ? "ready" : "loading"));
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
      if (ok || !canFail) { loaded.add(key); setState("ready"); } else setState("failed");
    });
    return () => { live = false; };
  }, [key, canFail, attempt]);
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
 * Stands in for uploading a photo or a file: progress from 0 to 1 over about
 * a second (bigger files take longer), then whether it went through. With the
 * network down it stalls part of the way and fails.
 */
export function upload(bytes: number, onProgress: (p: number) => void): Promise<boolean> {
  const ms = Math.min(2400, 700 + bytes / 4000);
  const failAt = 0.25 + Math.random() * 0.3;
  const start = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / ms);
      if (netDown() && p >= failAt) { resolve(false); return; }
      // Eased, so it slows near the end the way real uploads seem to.
      onProgress(1 - (1 - p) ** 2);
      if (p < 1) setTimeout(tick, 50); else resolve(true);
    };
    tick();
  });
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

/** In place of something that couldn't load: what happened, and Retry. */
export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className={l.failed} role="alert">
      <span className={l.failedIcon}><IconCloudOff size={22} /></span>
      <b>{what} couldn’t load</b>
      <small>{netFailureText()}. Check your connection and try again.</small>
      <button className={l.retry} onClick={onRetry}><IconRetry size={16} /> Retry</button>
    </div>
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

/** A photo or file uploading, in the sheet it was picked in. */
export function Uploading({ name, value }: { name: string; value: number }) {
  return (
    <p className={l.uploading} role="status">
      <ProgressRing value={value} size={36} />
      <span>Uploading {name}…</span>
    </p>
  );
}

/** Mind home while it loads: the folder cards' shapes. */
export function FolderSkeleton() {
  return (
    <div className={l.folders} aria-label="Loading your Mind" role="status">
      <div className={l.folderBar}><Bone w={92} h={12} /><Bone w={132} h={30} r={999} /></div>
      <div className={l.folderGrid}>
        {[0, 1, 2, 3].map((i) => (
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

/** Rows of results while a search runs. */
export function RowSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className={l.rows} aria-label="Searching" role="status">
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
  return (
    <div className={l.explore} aria-label="Loading Explore" role="status">
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
  return (
    <div className={l.rows} aria-label="Searching the catalogues" role="status">
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
  return <Bone w="100%" h={undefined} r={14} className={l.video} />;
}
