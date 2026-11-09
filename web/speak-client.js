// Streams sentences from POST /api/speak and feeds each to TalkingHead's streaming API.
import { TalkingHead } from "talkinghead";
import { applyStudioLighting } from "./lighting.js";
import { synthesizeMouth } from "./lipsync/synthesize.js";

const SAMPLE_RATE = 24000; // Kokoro output rate; must match pcmSampleRate below
const AVATAR_URL = "./avatars/avatar-upper.glb";
const CAMERA_Y = 0.4; // lowers the 'upper' view to centre on the face
// MetaPerson rig sits slightly chin-down under TalkingHead's RPM poses
const AVATAR_BASELINE = { headRotateX: -0.12 };
// A product face should look straight at the viewer and stay put. TalkingHead's defaults wander
// the eyes (biased downward), sway the head and body, swap between standing poses every few
// seconds, and gesture with the hands while speaking. On this rig the pose swaps and gestures
// twist the shoulders, and every lookAtCamera() call also adds random head, brow and
// mouthLeft/Right offsets. All of that is switched off here, without touching the library.
const STEADY_FACE_OPTIONS = {
  avatarIdleHeadMove: 0,
  avatarSpeakingHeadMove: 0,
  avatarIdleEyeContact: 1,
  avatarSpeakingEyeContact: 1,
};
const STEADY_POSE = "straight"; // symmetric, so no weight shift to either side
const PINNED_AT_ZERO = [
  "eyesLookDown", "eyesLookUp",
  "eyeLookInLeft", "eyeLookOutLeft", "eyeLookInRight", "eyeLookOutRight",
  "bodyRotateX", "bodyRotateY", "bodyRotateZ", // headRotateX/Y/Z stay free for our own nods and drift
  // The mood layer raises the upper lip while talking, which bares the upper teeth; no recipe uses it
  "mouthShrugUpper",
];
const POSE_BLEND_MS = 500;

// Behaviours that don't depend on the loaded avatar
function silenceAutonomousMotion(head) {
  head.lookAtCamera = () => {};
  head.speakWithHands = () => {};
}

// Morph targets and bones only exist once the avatar has loaded
function holdSteadyFace(head) {
  for (const morph of PINNED_AT_ZERO) head.setFixedValue(morph, 0, 0);
  head.setPoseFromTemplate(head.poseTemplates[STEADY_POSE], POSE_BLEND_MS);
  // Re-applying a pose mirrors its weight shift, so later pose changes are ignored
  head.setPoseFromTemplate = () => {};
}

// The mouth interior is unshadowed, so the stock white teeth glare against the face. A warmer,
// dimmer tint with less environment reflection reads as natural teeth.
const TEETH_TINT = [0.78, 0.74, 0.66];
const TEETH_ENV_INTENSITY = 0.35;
function tuneTeeth(head) {
  head.armature.traverse((obj) => {
    if (!obj.isMesh || !/Teeth/.test(obj.name)) return;
    obj.material.color.setRGB(...TEETH_TINT);
    obj.material.envMapIntensity = TEETH_ENV_INTENSITY;
  });
}

const $ = (id) => document.getElementById(id);

// TalkingHead estimates avatar height from the bind (T-)pose, but its idle
// poses lower this rig's hips noticeably. Wait for the pose to settle, then
// re-measure eye height so the 'upper' view frames the face correctly.
async function fitCameraToPose(head) {
  const POLL_MS = 150;
  const MAX_WAIT_MS = 4000;
  const STABLE_EPSILON = 0.001;
  const eye = head.objectLeftEye.position.clone();
  let lastY = -Infinity;

  $("avatar").style.opacity = "0";
  for (let waited = 0; waited < MAX_WAIT_MS; waited += POLL_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    head.objectLeftEye.getWorldPosition(eye);
    if (Math.abs(eye.y - lastY) < STABLE_EPSILON) break;
    lastY = eye.y;
  }
  head.avatarHeight = eye.y + 0.2;
  head.setView(head.viewName);
  $("avatar").style.opacity = "1";
}

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// Streaming mode times every chunk against ONE start time, so each sentence's
// timings are shifted by the audio already queued ahead of it.
// Words are always sent: they drive the subtitles.
function toStreamChunk(chunk, offsetMs, head, lastNodMs) {
  const shift = (times) => times.map((t) => t + offsetMs);
  const audio = base64ToArrayBuffer(chunk.audio);
  const item = {
    audio,
    words: chunk.words, wtimes: shift(chunk.wtimes), wdurations: chunk.wdurations,
  };
  if (chunk.visemes) {
    Object.assign(item, { visemes: chunk.visemes, vtimes: shift(chunk.vtimes), vdurations: chunk.vdurations });
  }
  if (chunk.phonemes) {
    // streamAudio transfers (detaches) the buffer, so the mouth is built from a copy first
    const pcm16 = new Int16Array(audio.slice(0));
    const has = (name) => name in head.mtAvatar;
    const anim = synthesizeMouth(chunk, pcm16, chunk.sample_rate, { offsetMs, has, last: chunk.last, lastNodMs });
    if (anim) item.anims = [anim];
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

// Bumped by every Speak/Stop so a superseded stream stops feeding the avatar.
let activeRun = 0;

// TalkingHead derives visemes from words itself only in its "words" stream type;
// "blendshapes" plays the mouth animation we synthesize from the phoneme track.
const LIPSYNC_TYPES = { words: "words", blend: "blendshapes" };
const lipsyncTypeFor = (mode) => LIPSYNC_TYPES[mode] ?? "visemes";

async function speak(head) {
  const text = $("text").value.trim();
  if (!text) return;
  const run = ++activeRun;
  const mode = $("mode").value;
  $("subtitles").textContent = "";
  $("stats").textContent = "Working...";
  const started = performance.now();
  const response = await fetch("/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, mode, voice: $("voice").value }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    $("stats").textContent = `Request failed (${response.status}): ${JSON.stringify(detail.detail ?? "")}`;
    return;
  }
  await head.streamStart(
    { sampleRate: SAMPLE_RATE, lipsyncType: lipsyncTypeFor(mode), lipsyncLang: "en" },
    null, null, showSubtitle,
  );
  const rows = [];
  let queuedMs = 0;
  let lastNodMs = -Infinity; // keeps emphasis nods spread out across sentences
  for await (const chunk of readNdjson(response)) {
    if (run !== activeRun) return;
    if (chunk.error) { $("stats").textContent = chunk.error; break; }
    if (chunk.index === 0) rows.push(`first audio after ${Math.round(performance.now() - started)} ms`);
    // A fully drained stream restarts its clock on the next chunk
    if (!head.isSpeaking) { queuedMs = 0; lastNodMs = -Infinity; }
    const item = toStreamChunk(chunk, queuedMs, head, lastNodMs);
    lastNodMs = item.anims?.[0]?.nodsAtMs?.at(-1) ?? lastNodMs;
    head.streamAudio(item);
    queuedMs += chunk.timing.audio_ms;
    const t = chunk.timing;
    rows.push(`#${chunk.index}: tts ${t.tts_ms} ms, lip-sync ${t.lipsync_ms} ms, audio ${t.audio_ms} ms${t.cached ? " (cached)" : ""}`);
    $("stats").textContent = rows.join(" · ");
  }
  if (run === activeRun) head.streamNotifyEnd();
}

async function loadVoices() {
  const { voices } = await (await fetch("/api/voices")).json();
  $("voice").innerHTML = voices.filter((v) => /^(a|b)[fm]_/.test(v))
    .map((v) => `<option ${v === "af_heart" ? "selected" : ""}>${v}</option>`).join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  const head = new TalkingHead($("avatar"), {
    ttsEndpoint: null, lipsyncModules: ["en"], lipsyncLang: "en",
    pcmSampleRate: SAMPLE_RATE, cameraView: "upper", cameraY: CAMERA_Y,
    // Dim the built-in lights; studio lighting is added separately
    lightAmbientIntensity: 0.6, lightDirectIntensity: 4, lightDirectColor: 0xffffff,
    ...STEADY_FACE_OPTIONS,
  });
  silenceAutonomousMotion(head);
  window.__head = head; // debug handle for inspecting morph values from the console
  try {
    $("loading").textContent = "Loading avatar...";
    await Promise.all([
      head.showAvatar(
        { url: AVATAR_URL, body: "M", avatarMood: "neutral", lipsyncLang: "en", baseline: AVATAR_BASELINE },
        (ev) => {
          if (ev.lengthComputable) $("loading").textContent = `Loading ${Math.round((ev.loaded / ev.total) * 100)}%`;
        },
      ).then(async () => {
        await applyStudioLighting(head);
        holdSteadyFace(head);
        tuneTeeth(head);
        await fitCameraToPose(head);
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
  $("stop").addEventListener("click", () => { activeRun++; head.streamInterrupt(); });
  document.addEventListener("visibilitychange", () => (document.visibilityState === "visible" ? head.start() : head.stop()));
});
