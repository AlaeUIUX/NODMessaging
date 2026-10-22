"use client";

import { useEffect, useRef } from "react";

/**
 * Dictation: the browser's speech engine (SpeechRecognition, or the webkit
 * one) listening continuously, with interim results, so words show up as
 * they're spoken. Where there's no engine, the mic is blocked, or nothing
 * was heard, the radio falls back to a sample line that types itself out
 * word by word, so a demo still shows what a live transcript looks like.
 * The composer turns that fallback off (`simulate: false`): it never
 * inserts words nobody said.
 */

interface RecognitionResult { readonly isFinal: boolean; readonly length: number; [i: number]: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}
type RecognitionCtor = new () => Recognition;

function engine(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Whether this browser can turn speech into text at all. */
export function dictationSupported() {
  return !!engine();
}

/** English or Arabic as the browser says; anything else listens in US English. */
function language() {
  if (typeof navigator === "undefined") return "en-US";
  const l = navigator.language || "en-US";
  return /^(en|ar)\b/i.test(l) ? l : "en-US";
}

export interface DictationOptions {
  /** Type out the sample when the engine is missing, fails, or hears nothing. Default true. */
  simulate?: boolean;
  /** false skips the mic and types out the sample straight away (permission denied). Default true. */
  listen?: boolean;
  /** The engine stopped by itself (silence, an error) before stop() was called. */
  onEnd?: () => void;
  /** The engine reported an error ("not-allowed", "no-speech", "network"…). */
  onError?: (code: string) => void;
}

/** One listen, from start() to stop(): each keeps its own words, so a quick stop-and-start never mixes two. */
interface Session {
  r: Recognition | null;
  /** The engine ended (by itself, or after stop()). */
  ended: boolean;
  text: string;
  /** The sample is typing itself out (no engine, or it failed). */
  simulated: boolean;
  timers: ReturnType<typeof setTimeout>[];
  opts: DictationOptions;
}

/** Drops a session at once: no more words, no callbacks. */
function abandon(s: Session) {
  s.timers.forEach(clearTimeout);
  s.timers = [];
  const r = s.r;
  s.r = null;
  if (!r) return;
  r.onend = null;
  r.onresult = null;
  r.onerror = null;
  try {
    if (r.abort) r.abort();
    else r.stop();
  } catch { /* already gone */ }
}

export function useDictation() {
  const current = useRef<Session | null>(null);

  const simulate = (s: Session, line: string, onText: (t: string) => void) => {
    s.simulated = true;
    const words = line.split(/\s+/).filter(Boolean);
    words.forEach((_, i) => {
      s.timers.push(setTimeout(() => {
        s.text = words.slice(0, i + 1).join(" ");
        onText(s.text);
      }, 260 + i * 230));
    });
  };

  const start = (sample: string, onText: (t: string) => void, options: DictationOptions = {}) => {
    if (current.current) abandon(current.current);
    const s: Session = { r: null, ended: false, text: "", simulated: false, timers: [], opts: options };
    current.current = s;
    const fallback = options.simulate !== false;
    const Engine = options.listen === false ? null : engine();
    if (!Engine) {
      s.ended = true;
      if (fallback) simulate(s, sample, onText);
      return;
    }
    try {
      const r = new Engine();
      r.continuous = true;
      r.interimResults = true;
      r.lang = language();
      let finals = "";
      // Results keep coming briefly after stop(): those are the last words, so they count.
      r.onresult = (e) => {
        if (s.simulated) return;
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const piece = e.results[i][0]?.transcript ?? "";
          if (e.results[i].isFinal) finals += piece;
          else interim += piece;
        }
        s.text = (finals + interim).replace(/\s+/g, " ").trim();
        onText(s.text);
      };
      r.onerror = (e) => {
        if (current.current !== s) return; // after stop(): nothing to report
        const code = e?.error ?? "error";
        // No mic, no permission, no network: the radio falls back to the sample.
        if (!s.text && fallback && !s.simulated) simulate(s, sample, onText);
        s.opts.onError?.(code);
      };
      r.onend = () => {
        s.ended = true;
        // Ended by itself while still in use (silence, an error): say so, unless the sample took over.
        if (current.current === s && !s.simulated) s.opts.onEnd?.();
      };
      r.start();
      s.r = r;
    } catch {
      s.ended = true;
      if (fallback) simulate(s, sample, onText);
      else options.onEnd?.();
    }
  };

  /** Stops listening; resolves with what was said, or the sample (voice: false) when nothing was heard. */
  const stop = (sample: string) =>
    new Promise<{ text: string; voice: boolean }>((resolve) => {
      const s = current.current;
      current.current = null;
      if (!s) { resolve({ text: "", voice: false }); return; }
      const fallback = s.opts.simulate !== false;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        s.timers.forEach(clearTimeout);
        s.timers = [];
        const heard = s.text.trim();
        if (heard && !s.simulated) resolve({ text: heard, voice: true });
        else resolve({ text: fallback ? sample : heard, voice: false });
      };
      const r = s.r;
      if (!r || s.ended) { finish(); return; }
      // The last words often land just after stop(): wait for the engine to end, briefly.
      r.onend = () => { s.ended = true; finish(); };
      try { r.stop(); } catch { finish(); }
      setTimeout(finish, 900);
    });

  useEffect(() => () => {
    const s = current.current;
    current.current = null;
    if (s) abandon(s);
  }, []);

  return { start, stop };
}
