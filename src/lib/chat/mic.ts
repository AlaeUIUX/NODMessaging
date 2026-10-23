"use client";

/**
 * The microphone, live, while you talk on the radio: its loudness for the
 * wave (an AnalyserNode), and its sound for dictation (tap(), which hands the
 * audio to the on-device speech model; nothing is sent anywhere). One mic is
 * shared; each open() is matched by a close(), and the last close lets it
 * go. Where there's no mic (blocked, none, or no permission), open()
 * resolves false and the wave draws a voice of its own instead.
 */

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let stream: MediaStream | null = null;
let bins: Uint8Array<ArrayBuffer> | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let tapNode: AudioWorkletNode | null = null;
const sinks = new Set<(pcm: Float32Array, rate: number) => void>();
let users = 0;
let opening: Promise<boolean> | null = null;

export function open(): Promise<boolean> {
  users++;
  if (analyser) return Promise.resolve(true);
  if (opening) return opening;
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return Promise.resolve(false);
  // Cleaned up the way a call is (echo, noise, level): it's what the speech model hears.
  opening = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    .then((s) => {
      // Closed again before the mic answered: let it go straight away.
      if (users <= 0) { s.getTracks().forEach((t) => t.stop()); return false; }
      stream = s;
      ctx = new AudioContext();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source = ctx.createMediaStreamSource(s);
      source.connect(analyser);
      bins = new Uint8Array(analyser.frequencyBinCount);
      return true;
    })
    .catch(() => false)
    .finally(() => { opening = null; });
  return opening;
}

export function close() {
  users = Math.max(0, users - 1);
  if (users > 0) return;
  stream?.getTracks().forEach((t) => t.stop());
  void ctx?.close();
  ctx = null;
  analyser = null;
  source = null;
  tapNode = null;
  sinks.clear();
  stream = null;
  bins = null;
}

/** Fills `out` with the voice's loudness in bands, 0 to 1, low to high. False while there's no mic. */
export function levels(out: Float32Array): boolean {
  if (!analyser || !bins) return false;
  analyser.getByteFrequencyData(bins);
  // Speech lives in the lower third of the spectrum; spread that over the bars.
  const span = Math.floor(bins.length / 3);
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor((i / out.length) * span);
    const to = Math.max(from + 1, Math.floor(((i + 1) / out.length) * span));
    let sum = 0;
    for (let j = from; j < to; j++) sum += bins[j];
    out[i] = Math.min(1, (sum / (to - from) / 255) * 1.6);
  }
  return true;
}

// Hands the raw sound on in batches of 2048 samples (about 40 ms), off the audio thread.
const TAP = `class NodTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
    }
    return true;
  }
}
registerProcessor("nod-tap", NodTap);`;

/**
 * The mic's sound as it comes in, for dictation: `fn` gets each batch and
 * the rate it was recorded at. Resolves with a function that stops it (and
 * lets the mic go), or null when there's no mic.
 */
export async function tap(fn: (pcm: Float32Array, rate: number) => void): Promise<(() => void) | null> {
  if (!(await open()) || !ctx || !source) { close(); return null; }
  try {
    if (ctx.state === "suspended") await ctx.resume();
    if (!tapNode) {
      const url = URL.createObjectURL(new Blob([TAP], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      if (!ctx || !source) { close(); return null; }
      const node = new AudioWorkletNode(ctx, "nod-tap");
      const rate = ctx.sampleRate;
      node.port.onmessage = (e: MessageEvent<Float32Array>) => sinks.forEach((s) => s(e.data, rate));
      source.connect(node);
      // Silent, but connected, so the browser keeps it running.
      const mute = ctx.createGain();
      mute.gain.value = 0;
      node.connect(mute).connect(ctx.destination);
      tapNode = node;
    }
  } catch {
    close();
    return null;
  }
  sinks.add(fn);
  return () => { sinks.delete(fn); close(); };
}

export type MicAccess = "granted" | "denied" | "missing";

/**
 * The browser’s own microphone permission (not the app’s phone-style
 * prompt): asked here, before anyone goes on air, so its prompt never sits
 * unanswered in the address bar while the speech engine waits in silence.
 */
export async function micAccess(): Promise<MicAccess> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "missing";
  try {
    const p = await navigator.permissions?.query({ name: "microphone" as PermissionName });
    if (p?.state === "granted") return "granted";
    if (p?.state === "denied") return "denied";
  } catch { /* no Permissions API for the mic here: ask instead */ }
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    return "granted";
  } catch (e) {
    const name = (e as { name?: string })?.name;
    return name === "NotFoundError" || name === "OverconstrainedError" ? "missing" : "denied";
  }
}

/** Whether the browser has already said yes, without asking. */
export async function micGranted() {
  try {
    const p = await navigator.permissions?.query({ name: "microphone" as PermissionName });
    return p?.state === "granted";
  } catch { return false; }
}
