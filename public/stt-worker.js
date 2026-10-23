// Live dictation, on the device: Moonshine (a small open speech model made
// for live use) running in this worker through transformers.js. Audio comes
// in as it's spoken; every half second or so the words so far go back out,
// and on "end" the whole of it is heard once more for the final text. Free,
// and nothing leaves the browser except the one-time model download.

import { env, pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

env.allowLocalModels = false;

const MODEL = "onnx-community/moonshine-tiny-ONNX";
const RATE = 16000;
/** Hear again once this much new audio has come in. */
const STEP = RATE * 0.5;
/** Past this, what's been said so far is settled and listening carries on from there. */
const SPAN = RATE * 24;

let asr = null;
let loading = null;
let session = null; // { id, chunks: Float32Array[], length, settled, heardAt, busy, ending }

const post = (m) => self.postMessage(m);

async function load() {
  if (asr) return asr;
  if (loading) return loading;
  const files = {};
  const progress = (p) => {
    if (p.status !== "progress" || !p.file) return;
    files[p.file] = { loaded: p.loaded ?? 0, total: p.total ?? 0 };
    const all = Object.values(files);
    const total = all.reduce((a, f) => a + f.total, 0);
    const loaded = all.reduce((a, f) => a + f.loaded, 0);
    if (total) post({ type: "progress", loaded, total });
  };
  const tryDevice = async (device) => pipeline("automatic-speech-recognition", MODEL, {
    device,
    dtype: device === "webgpu" ? { encoder_model: "fp32", decoder_model_merged: "q4" } : "q8",
    progress_callback: progress,
  });
  loading = (async () => {
    let device = "wasm";
    try {
      const gpu = self.navigator?.gpu && (await self.navigator.gpu.requestAdapter());
      if (gpu) device = "webgpu";
    } catch { /* no WebGPU: WebAssembly it is */ }
    try {
      asr = await tryDevice(device);
    } catch (e) {
      if (device !== "webgpu") throw e;
      device = "wasm";
      asr = await tryDevice(device);
    }
    // One short warm-up, so the first real words don't wait on it.
    await asr(new Float32Array(RATE / 2));
    post({ type: "ready", device });
    return asr;
  })().catch((e) => {
    loading = null;
    post({ type: "error", message: String(e?.message ?? e) });
    throw e;
  });
  return loading;
}

/** Resamples to 16 kHz (the model's rate), averaging so nothing aliases. */
function resample(pcm, rate) {
  if (rate === RATE) return pcm;
  const ratio = rate / RATE;
  const out = new Float32Array(Math.floor(pcm.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.min(pcm.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = from; j < to; j++) sum += pcm[j];
    out[i] = sum / Math.max(1, to - from);
  }
  return out;
}

function joined(s) {
  const all = new Float32Array(s.length);
  let at = 0;
  for (const c of s.chunks) { all.set(c, at); at += c.length; }
  return all;
}

const tidy = (t) => (t ?? "").replace(/\s+/g, " ").trim();
const both = (a, b) => tidy(`${a} ${b}`);

/** Quiet audio makes small models invent words: below this level there's nothing to hear. */
function loud(pcm) {
  let peak = 0;
  for (let i = 0; i < pcm.length; i += 4) peak = Math.max(peak, Math.abs(pcm[i]));
  return peak > 0.02;
}

async function hear(s, final) {
  if (s.busy) { if (final) s.ending = true; return; }
  if (!asr) { if (final) s.ending = true; return; }
  s.busy = true;
  try {
    const audio = joined(s);
    s.heardAt = s.length;
    let text = "";
    if (audio.length >= RATE * 0.3 && loud(audio)) text = tidy((await asr(audio)).text);
    if (session !== s) return;
    if (s.length >= SPAN && !final) {
      // A long call: settle this stretch and keep listening from here.
      s.settled = both(s.settled, text);
      s.chunks = [];
      s.length = 0;
      s.heardAt = 0;
      text = "";
    }
    const now = both(s.settled, text);
    if (final) { post({ type: "final", id: s.id, text: now }); session = null; return; }
    post({ type: "partial", id: s.id, text: now });
  } catch (e) {
    if (final) { post({ type: "final", id: s.id, text: s.settled }); session = null; }
    post({ type: "error", message: String(e?.message ?? e) });
  } finally {
    s.busy = false;
  }
  if (session !== s) return;
  if (s.ending) { s.ending = false; void hear(s, true); return; }
  if (s.length - s.heardAt >= STEP) void hear(s, false);
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "load") { load().catch(() => {}); return; }
  if (m.type === "begin") {
    session = { id: m.id, chunks: [], length: 0, settled: "", heardAt: 0, busy: false, ending: false };
    return;
  }
  const s = session;
  if (!s || s.id !== m.id) return;
  if (m.type === "audio") {
    const pcm = resample(m.pcm, m.rate);
    s.chunks.push(pcm);
    s.length += pcm.length;
    if (asr && s.length - s.heardAt >= STEP) void hear(s, false);
    return;
  }
  if (m.type === "end") {
    // Still downloading: the words are heard as soon as the model is here.
    if (!asr) { try { await load(); } catch { post({ type: "final", id: s.id, text: "" }); session = null; return; } }
    if (session === s) void hear(s, true);
  }
};
