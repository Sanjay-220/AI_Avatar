// Streams sentences from POST /api/speak and hands each to TalkingHead.speakAudio().
import { TalkingHead } from "talkinghead";

const SAMPLE_RATE = 24000; // Kokoro output rate; must match pcmSampleRate below
const AVATAR_URL = "./vendor/TalkingHead/avatars/brunette.glb";
const $ = (id) => document.getElementById(id);

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// TalkingHead ignores visemes unless words are present, so words are always sent.
function toSpeakAudio(chunk) {
  const item = {
    audio: [base64ToArrayBuffer(chunk.audio)],
    words: chunk.words, wtimes: chunk.wtimes, wdurations: chunk.wdurations,
  };
  if (chunk.visemes) {
    Object.assign(item, { visemes: chunk.visemes, vtimes: chunk.vtimes, vdurations: chunk.vdurations });
  }
  return item;
}

async function* readNdjson(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) if (line.trim()) yield JSON.parse(line);
  }
  if (buffer.trim()) yield JSON.parse(buffer);
}

function showSubtitle(word) {
  $("subtitles").textContent += word;
}

async function speak(head) {
  const text = $("text").value.trim();
  if (!text) return;
  $("subtitles").textContent = "";
  $("stats").textContent = "Working...";
  const started = performance.now();
  const response = await fetch("/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, mode: $("mode").value, voice: $("voice").value }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    $("stats").textContent = `Request failed (${response.status}): ${JSON.stringify(detail.detail ?? "")}`;
    return;
  }
  const rows = [];
  for await (const chunk of readNdjson(response)) {
    if (chunk.error) { $("stats").textContent = chunk.error; return; }
    if (chunk.index === 0) rows.push(`first audio after ${Math.round(performance.now() - started)} ms`);
    head.speakAudio(toSpeakAudio(chunk), {}, showSubtitle);
    const t = chunk.timing;
    rows.push(`#${chunk.index}: tts ${t.tts_ms} ms, lip-sync ${t.lipsync_ms} ms, audio ${t.audio_ms} ms${t.cached ? " (cached)" : ""}`);
    $("stats").textContent = rows.join(" · ");
  }
}

async function loadVoices() {
  const { voices } = await (await fetch("/api/voices")).json();
  $("voice").innerHTML = voices.filter((v) => /^(a|b)[fm]_/.test(v))
    .map((v) => `<option ${v === "af_heart" ? "selected" : ""}>${v}</option>`).join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  const head = new TalkingHead($("avatar"), {
    ttsEndpoint: null, lipsyncModules: ["en"], lipsyncLang: "en",
    pcmSampleRate: SAMPLE_RATE, cameraView: "upper",
  });
  try {
    $("loading").textContent = "Loading avatar...";
    await Promise.all([
      head.showAvatar({ url: AVATAR_URL, body: "F", avatarMood: "neutral", lipsyncLang: "en" }, (ev) => {
        if (ev.lengthComputable) $("loading").textContent = `Loading ${Math.round((ev.loaded / ev.total) * 100)}%`;
      }),
      loadVoices(),
    ]);
    $("loading").textContent = "";
  } catch (error) {
    console.error(error);
    $("loading").textContent = `Could not load: ${error}`;
    return;
  }
  $("speak").addEventListener("click", () => speak(head).catch((e) => {
    console.error(e);
    $("stats").textContent = "Speech failed; is the server running?";
  }));
  $("stop").addEventListener("click", () => head.stopSpeaking());
  document.addEventListener("visibilitychange", () => (document.visibilityState === "visible" ? head.start() : head.stop()));
});
