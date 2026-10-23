"use client";

import { useEffect, useRef } from "react";
import { listen as listenOnDevice, sttStatus } from "./stt";

/**
 * Dictation. First choice: the on-device speech model (stt.ts), which works
 * out the words from the mic's own sound as it comes in, free and private.
 * Where that can't run (no mic it can open, or the model failed to load):
 * the browser's speech engine (SpeechRecognition, or the webkit one)
 * listening continuously, with interim results, so words show up as
 * they're spoken, and it keeps listening through pauses (Chrome stops a
 * listen after a quiet spell; while it's still wanted, it starts again).
 * Only where there's no engine at all does the radio type out a sample
 * line, so a demo still shows a live transcript. When the engine listened
 * and heard nothing, nothing is made up: the result is empty.
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
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
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

/** Whether dictation can happen at all here: the on-device model (unless it failed to load), or the browser's engine. */
export function canDictate() {
  return sttStatus().state !== "failed" || dictationSupported();
}

/** English or Arabic as the browser says; anything else listens in US English. */
function language() {
  if (typeof navigator === "undefined") return "en-US";
  const l = navigator.language || "en-US";
  return /^(en|ar)\b/i.test(l) ? l : "en-US";
}

export interface DictationOptions {
  /** Type out the sample when there's no engine at all (or listen is false). Default true. */
  simulate?: boolean;
  /** false skips the mic and types out the sample straight away (permission denied). Default true. */
  listen?: boolean;
  /** The engine stopped for good (an error it can't get past) before stop() was called. */
  onEnd?: () => void;
  /** The engine reported an error ("not-allowed", "network", "audio-capture"…). */
  onError?: (code: string) => void;
  /** "listening": the mic is open. "hearing": a voice was picked up. */
  onState?: (state: "listening" | "hearing") => void;
  /** false: skip the on-device model and use the browser's engine. Default true. */
  onDevice?: boolean;
}

type DeviceListen = { stop: () => Promise<string> };

/** Errors that listening again won't fix: the mic is blocked or missing, or the speech service can't be reached. */
const FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported", "bad-grammar"]);
/** Chrome ends a listen on its own after a pause; while the button is held it starts again, this many times at most. */
const RESTARTS = 40;

/** One listen, from start() to stop(): each keeps its own words, so a quick stop-and-start never mixes two. */
interface Session {
  r: Recognition | null;
  /** The engine ended (by itself, or after stop()). */
  ended: boolean;
  /** stop() was called: an end now is the last one. */
  stopping: boolean;
  /** Words settled by earlier listens in this session (Chrome restarts after pauses). */
  before: string;
  text: string;
  /** The sample is typing itself out (no engine, or listen: false). */
  simulated: boolean;
  restarts: number;
  failed: boolean;
  /** The on-device listen, once the mic is open (null: it couldn't, and the browser's engine took over). */
  device: Promise<DeviceListen | null> | null;
  timers: ReturnType<typeof setTimeout>[];
  opts: DictationOptions;
}

/** Drops a session at once: no more words, no callbacks. */
function abandon(s: Session) {
  s.timers.forEach(clearTimeout);
  s.timers = [];
  void s.device?.then((h) => h?.stop());
  s.device = null;
  const r = s.r;
  s.r = null;
  if (!r) return;
  r.onend = null;
  r.onresult = null;
  r.onerror = null;
  r.onaudiostart = null;
  r.onspeechstart = null;
  try {
    if (r.abort) r.abort();
    else r.stop();
  } catch { /* already gone */ }
}

const join = (a: string, b: string) => `${a} ${b}`.replace(/\s+/g, " ").trim();

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

  /** One listen of the engine. Words arrive as they're heard (interim results), and settle as they're final. */
  const listen = (s: Session, Engine: RecognitionCtor, onText: (t: string) => void) => {
    const r = new Engine();
    r.continuous = true;
    r.interimResults = true;
    r.lang = language();
    let finals = "";
    // Results keep coming briefly after stop(): those are the last words, so they count.
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0]?.transcript ?? "";
        if (e.results[i].isFinal) finals += ` ${piece}`;
        else interim += ` ${piece}`;
      }
      s.text = join(s.before, join(finals, interim));
      onText(s.text);
    };
    r.onaudiostart = () => { if (current.current === s) s.opts.onState?.("listening"); };
    r.onspeechstart = () => { if (current.current === s) s.opts.onState?.("hearing"); };
    r.onerror = (e) => {
      const code = e?.error ?? "error";
      if (FATAL.has(code)) s.failed = true;
      // After stop(), only the last words matter; "no-speech" and "aborted" just mean a quiet stretch.
      if (current.current === s && FATAL.has(code)) s.opts.onError?.(code);
    };
    r.onend = () => {
      if (s.r !== r) return;
      // Still held and nothing wrong: Chrome stopped after a pause. Listen again, keeping what was said.
      if (current.current === s && !s.stopping && !s.failed && s.restarts < RESTARTS) {
        s.restarts++;
        s.before = s.text;
        try { s.r = null; listen(s, Engine, onText); return; } catch { /* fall through: it's over */ }
      }
      s.ended = true;
      if (current.current === s && !s.stopping) s.opts.onEnd?.();
    };
    s.r = r;
    r.start();
  };

  const start = (sample: string, onText: (t: string) => void, options: DictationOptions = {}) => {
    if (current.current) abandon(current.current);
    const s: Session = { r: null, ended: false, stopping: false, before: "", text: "", simulated: false, restarts: 0, failed: false, device: null, timers: [], opts: options };
    current.current = s;
    const fallback = options.simulate !== false;
    const Engine = options.listen === false ? null : engine();
    const browser = () => {
      if (!Engine) {
        s.ended = true;
        if (fallback) simulate(s, sample, onText);
        else options.onEnd?.();
        return;
      }
      try {
        listen(s, Engine, onText);
      } catch {
        s.ended = true;
        s.failed = true;
        options.onError?.("error");
        options.onEnd?.();
      }
    };
    if (options.listen !== false && options.onDevice !== false && sttStatus().state !== "failed") {
      options.onState?.("listening");
      s.device = listenOnDevice(
        (text) => { if (current.current !== s) return; s.text = text; onText(text); },
        () => { if (current.current === s) options.onState?.("hearing"); },
      ).then((h) => {
        if (h) return h;
        // No mic the page could open, or no model: the browser's engine has a go.
        s.device = null;
        if (current.current === s) browser();
        return null;
      });
      return;
    }
    browser();
  };

  /**
   * Stops listening; resolves with what was said. `voice` is true when the
   * real engine listened, even if it heard nothing (then `text` is empty:
   * nobody's words are made up). Only a session that never had an engine
   * resolves with the sample.
   */
  const stop = (sample: string) =>
    new Promise<{ text: string; voice: boolean }>((resolve) => {
      const s = current.current;
      current.current = null;
      if (!s) { resolve({ text: "", voice: false }); return; }
      s.stopping = true;
      if (s.device) {
        // On the device: the model hears the whole of it once more for the final words.
        void s.device.then(async (h) => {
          if (h) { resolve({ text: (await h.stop()).trim() || s.text.trim(), voice: true }); return; }
          resolve({ text: "", voice: true });
        });
        return;
      }
      const fallback = s.opts.simulate !== false;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        s.timers.forEach(clearTimeout);
        s.timers = [];
        const heard = s.text.trim();
        if (s.simulated) resolve({ text: fallback ? sample : heard, voice: false });
        else resolve({ text: heard, voice: true });
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
