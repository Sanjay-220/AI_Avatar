// Measures how well the server's phoneme timings line up with the audio actually produced.
// Usage (server running): node lipsync/tools/measure-sync.mjs [baseUrl]
import { alignToAudio } from "../align.js";
import { sampleMouth, FRAME_MS } from "../coarticulation.js";
import { energyEnvelope } from "../energy.js";
import { VOWEL_CLASSES } from "../recipes.js";
import { buildSegments } from "../segments.js";

const BASE_URL = process.argv[2] ?? "http://127.0.0.1:8000";
const GRID_MS = 10;
const MAX_LAG_MS = 200;
const ONSET_LEVEL = 0.2; // energy level (0..1) counted as "sound has started"
const SILENT_LEVEL = 0.1;
const MIN_PAUSE_MS = 80;
const VOWEL_WINDOW_MS = 80;

const VOICES = ["af_heart", "am_adam"];
const SENTENCES = [
  "Hello there, how are you today?",
  "Your account balance is available in the mobile app.",
  "Please bring me five very big maps from Miami.",
  "I can help you check your balance, update your address, or set up a new card.",
  "Would you like me to walk you through it?",
  "The quick brown fox jumps over the lazy dog.",
  "We are sorry, but that transaction could not be completed.",
  "Thank you for calling, and have a wonderful afternoon.",
  "Can you confirm the last four digits of your card?",
  "Your new card will arrive within five to seven business days.",
];

const median = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
const quantile = (v, q) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(q * v.length))];
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;

async function fetchChunks(text, voice) {
  const res = await fetch(`${BASE_URL}/api/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, mode: "blend" }),
  });
  if (res.status === 429) throw new Error("rate limited (server allows 30 requests a minute): wait a minute and rerun");
  if (!res.ok) throw new Error(`speak failed: ${res.status}`);
  return (await res.text()).trim().split("\n").map((l) => JSON.parse(l)).filter((c) => !c.error);
}

const toPcm = (b64) => {
  const buf = Buffer.from(b64, "base64");
  return new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
};

// Predicted jaw opening and measured loudness on a shared GRID_MS grid
function signals(segments, pcm, sampleRate) {
  const durationMs = (pcm.length / sampleRate) * 1000;
  const { frames } = sampleMouth(segments, durationMs);
  const jaw = frames.jawOpen;
  const level = energyEnvelope(pcm, sampleRate, GRID_MS);
  const n = level.length;
  const predicted = Float32Array.from({ length: n }, (_, k) => {
    const x = (k * GRID_MS) / FRAME_MS - 1;
    const i = Math.floor(x);
    const a = jaw[Math.max(0, Math.min(jaw.length - 1, i))];
    const b = jaw[Math.max(0, Math.min(jaw.length - 1, i + 1))];
    return a + (b - a) * (x - i);
  });
  return { predicted, level };
}

function pearson(a, b) {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

// Lag L (ms) maximising corr(predicted(t), level(t + L)); positive L: the audio is later than predicted
function bestLag({ predicted, level }) {
  let best = { lag: 0, corr: -1 };
  const at0 = pearson(predicted, level);
  for (let lag = -MAX_LAG_MS; lag <= MAX_LAG_MS; lag += GRID_MS) {
    const s = lag / GRID_MS;
    const a = [], b = [];
    for (let k = 0; k < predicted.length; k++) {
      const j = k + s;
      if (j >= 0 && j < level.length) { a.push(predicted[k]); b.push(level[j]); }
    }
    const c = pearson(a, b);
    if (c > best.corr) best = { lag, corr: c };
  }
  return { ...best, corrAtZero: at0 };
}

function edgeErrors(segments, level) {
  const spoken = segments.filter((s) => s.cls !== "pause");
  const first = level.findIndex((v) => v > ONSET_LEVEL);
  const last = level.length - 1 - [...level].reverse().findIndex((v) => v > ONSET_LEVEL);
  return {
    onset: first * GRID_MS - spoken[0].start,
    offset: (last + 1) * GRID_MS - spoken.at(-1).end,
  };
}

function vowelOffsets(segments, level) {
  const out = [];
  for (const s of segments) {
    if (!VOWEL_CLASSES.has(s.cls) || s.end - s.start < 50) continue;
    const from = Math.max(0, Math.floor((s.start - VOWEL_WINDOW_MS) / GRID_MS));
    const to = Math.min(level.length - 1, Math.ceil((s.end + VOWEL_WINDOW_MS) / GRID_MS));
    let peak = from;
    for (let k = from; k <= to; k++) if (level[k] > level[peak]) peak = k;
    out.push(peak * GRID_MS + GRID_MS / 2 - (s.start + s.end) / 2);
  }
  return out;
}

function silenceMismatch(segments, level) {
  const covered = new Float32Array(level.length);
  for (const s of segments) {
    if (s.cls === "pause") continue;
    for (let k = Math.floor(s.start / GRID_MS); k < Math.min(level.length, Math.ceil(s.end / GRID_MS)); k++) covered[k] = 1;
  }
  let mouthMovingInSilence = 0, soundOutsideSpeech = 0, spokenFrames = 0;
  for (let k = 0; k < level.length; k++) {
    if (covered[k]) { spokenFrames++; if (level[k] < SILENT_LEVEL) mouthMovingInSilence++; }
    else if (level[k] > ONSET_LEVEL) soundOutsideSpeech++;
  }
  return { mouthMovingInSilence, soundOutsideSpeech, spokenFrames, totalFrames: level.length };
}

const chunks = [];
for (const voice of VOICES) {
  for (const text of SENTENCES) {
    for (const chunk of await fetchChunks(text, voice)) chunks.push({ voice, text, chunk });
  }
}

// `align` mirrors what the page does before drawing the mouth (lead time excluded, so the
// numbers show the track's own error against the audio)
function measure(align) {
  return chunks.map(({ voice, text, chunk }) => {
    const pcm = toPcm(chunk.audio);
    const level = energyEnvelope(pcm, chunk.sample_rate, GRID_MS);
    const raw = buildSegments(chunk);
    const segments = align ? alignToAudio(raw, energyEnvelope(pcm, chunk.sample_rate, FRAME_MS), FRAME_MS) : raw;
    const sig = signals(segments, pcm, chunk.sample_rate);
    return {
      voice, text, lag: bestLag(sig), edges: edgeErrors(segments, level),
      vowels: vowelOffsets(segments, level), silence: silenceMismatch(segments, level),
    };
  });
}

function report(title, rows) {
  const lags = rows.map((r) => r.lag.lag);
  const allVowels = rows.flatMap((r) => r.vowels);
  const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : "n/a");
  const sum = (k) => rows.reduce((a, r) => a + r.silence[k], 0);
  console.log(`\n=== ${title} (${rows.length} sentences, voices: ${VOICES.join(", ")}) ===`);
  console.log(`\nOverall timing (positive = audio comes later than the mouth)`);
  console.log(`  best lag per sentence:    median ${fmt(median(lags))} ms, p10 ${fmt(quantile(lags, 0.1))}, p90 ${fmt(quantile(lags, 0.9))}`);
  console.log(`  correlation at best lag:  median ${fmt(median(rows.map((r) => r.lag.corr)), 2)}   at zero lag: ${fmt(median(rows.map((r) => r.lag.corrAtZero)), 2)}`);
  console.log(`\nStart and end of speech (audio minus phoneme track)`);
  console.log(`  onset:  median ${fmt(median(rows.map((r) => r.edges.onset)))} ms, p10 ${fmt(quantile(rows.map((r) => r.edges.onset), 0.1))}, p90 ${fmt(quantile(rows.map((r) => r.edges.onset), 0.9))}`);
  console.log(`  offset: median ${fmt(median(rows.map((r) => r.edges.offset)))} ms, p10 ${fmt(quantile(rows.map((r) => r.edges.offset), 0.1))}, p90 ${fmt(quantile(rows.map((r) => r.edges.offset), 0.9))}`);
  console.log(`\nPer-vowel loudness peak vs vowel midpoint (${allVowels.length} vowels)`);
  console.log(`  median ${fmt(median(allVowels))} ms, p10 ${fmt(quantile(allVowels, 0.1))}, p90 ${fmt(quantile(allVowels, 0.9))}, off by more than 60 ms: ${fmt((100 * allVowels.filter((v) => Math.abs(v) > 60).length) / allVowels.length)}%`);
  console.log(`\nSilence vs mouth`);
  console.log(`  frames where the mouth should be speaking but the audio is silent: ${sum("mouthMovingInSilence")} of ${sum("spokenFrames")} (${fmt((100 * sum("mouthMovingInSilence")) / sum("spokenFrames"), 1)}%)`);
  console.log(`  frames with real sound the phoneme track calls a pause: ${sum("soundOutsideSpeech")} of ${sum("totalFrames")} (${fmt((100 * sum("soundOutsideSpeech")) / sum("totalFrames"), 1)}%)`);
}

report("Phoneme track as delivered by the server", measure(false));
report("After aligning to the audio", measure(true));
