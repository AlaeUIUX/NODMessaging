"use client";

import { useSyncExternalStore } from "react";
import { tap } from "./mic";

/**
 * Live dictation on the device: the mic's sound goes to a worker running a
 * small open speech model (Moonshine, public/stt-worker.js), and the words
 * come back while you're still talking. Free and private: the model
 * downloads once (about 28 MB, then the browser keeps it) and nothing else
 * leaves the page. prepare() starts the download early (the radio opening
 * is enough); a call made while it's still downloading is heard as soon as
 * it's done.
 */

export interface SttStatus {
  state: "idle" | "loading" | "ready" | "failed";
  /** 0 to 1 while downloading. */
  progress: number;
  /** "webgpu" or "wasm", once ready. */
  device?: string;
}

let status: SttStatus = { state: "idle", progress: 0 };
const watchers = new Set<() => void>();
const set = (next: Partial<SttStatus>) => { status = { ...status, ...next }; watchers.forEach((w) => w()); };

let worker: Worker | null = null;
const partials = new Map<string, (text: string) => void>();
const finals = new Map<string, (text: string) => void>();

type FromWorker =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready"; device: string }
  | { type: "error"; message: string }
  | { type: "partial"; id: string; text: string }
  | { type: "final"; id: string; text: string };

/** Starts the model downloading, if it isn't already. */
export function prepare() {
  if (worker || typeof Worker === "undefined") return;
  try {
    worker = new Worker("/stt-worker.js", { type: "module" });
  } catch {
    set({ state: "failed" });
    return;
  }
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if (m.type === "progress") set({ state: "loading", progress: m.total ? m.loaded / m.total : 0 });
    else if (m.type === "ready") set({ state: "ready", progress: 1, device: m.device });
    else if (m.type === "error") { if (status.state !== "ready") set({ state: "failed" }); }
    else if (m.type === "partial") partials.get(m.id)?.(m.text);
    else if (m.type === "final") { finals.get(m.id)?.(m.text); finals.delete(m.id); }
  };
  worker.onerror = () => set({ state: "failed" });
  set({ state: "loading", progress: 0 });
  worker.postMessage({ type: "load" });
}

export const sttStatus = () => status;

/** The model's state, for showing "getting dictation ready · 40%". */
export function useSttStatus() {
  return useSyncExternalStore(
    (w) => { watchers.add(w); return () => { watchers.delete(w); }; },
    () => status,
    () => status,
  );
}

/** Loud enough to be a voice rather than the room. */
const voiced = (pcm: Float32Array) => {
  let peak = 0;
  for (let i = 0; i < pcm.length; i += 8) peak = Math.max(peak, Math.abs(pcm[i]));
  return peak > 0.05;
};

/**
 * Listens until stop(): `onText` gets the words so far as they're heard,
 * `onVoice` fires the first time a voice comes through. Resolves null when
 * there's no mic or the model can't run here (use the browser's engine).
 */
export async function listen(onText: (text: string) => void, onVoice?: () => void): Promise<{ stop: () => Promise<string> } | null> {
  prepare();
  const w = worker;
  if (!w || status.state === "failed") return null;
  const id = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  let latest = "";
  let heard = false;
  w.postMessage({ type: "begin", id });
  partials.set(id, (text) => { latest = text; onText(text); });
  const untap = await tap((pcm, rate) => {
    if (!heard && voiced(pcm)) { heard = true; onVoice?.(); }
    w.postMessage({ type: "audio", id, pcm, rate });
  });
  if (!untap) { partials.delete(id); return null; }
  return {
    stop: () => new Promise<string>((resolve) => {
      untap();
      let done = false;
      const finish = (text: string) => {
        if (done) return;
        done = true;
        partials.delete(id);
        finals.delete(id);
        resolve(text);
      };
      finals.set(id, (text) => finish(text || latest));
      w.postMessage({ type: "end", id });
      // A model that never arrives (offline mid-download): keep what was heard so far.
      setTimeout(() => finish(latest), 60_000);
    }),
  };
}
