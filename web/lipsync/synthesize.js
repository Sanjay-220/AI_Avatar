// Phonemes + audio in, a TalkingHead 'blendshapes' animation out.
import { FRAME_MS, sampleMouth } from "./coarticulation.js";
import { alignToAudio } from "./align.js";
import { energyEnvelope } from "./energy.js";
import { smoothFrames } from "./dynamics.js";
import { GESTURE_TAIL_MS, chooseNods, gestureFrames } from "./gesture.js";
import { DEFAULT_PROFILE } from "./profile.js";
import { LOUDNESS_PARAMS } from "./recipes.js";
import { buildSegments } from "./segments.js";

const QUIET_GAIN = 0.55; // jaw opening for the quietest speech, relative to a normal level
const LOUD_GAIN = 0.75; // extra opening for the loudest speech
const PRECISION = 1000;
const FULL_PRESS = 0.45; // lip press at which the lips count as fully shut
// Closing the lips by the whole jaw opening drags the lower lip up over the upper one and hides it,
// so the lips only meet: mouthClose stays at or below this share of the jaw (checked on screen)
const MAX_CLOSE_OF_JAW = 0.5;

const round = (v) => Math.round(v * PRECISION) / PRECISION;

function shiftEarlier(segments, leadMs) {
  return segments.map((s) => ({ ...s, start: s.start - leadMs, end: s.end - leadMs }));
}

// Rig scaling and loudness come first, so the smoothing that follows sees (and calms) the loudness
// jitter too; the hard ceiling is applied last, on the smoothed value.
function shape(param, raw, loudnessAt, profile) {
  const scale = profile.scale[param] ?? 1;
  const loudnessGain = (f) => (LOUDNESS_PARAMS.has(param) ? QUIET_GAIN + LOUD_GAIN * loudnessAt(f) : 1);
  return Float32Array.from(raw, (v, f) => v * scale * loudnessGain(f));
}

const finish = (param, v, profile) => round(Math.min(profile.limits[param] ?? 1, Math.max(0, v)));

// ARKit's mouthClose only cancels the lip gap jawOpen creates: equal to jawOpen it shuts the lips
// with the jaw open, above jawOpen the lower lip overshoots the upper one. So it is derived from how
// firmly the lips are pressed, and never allowed past the jaw, frame by frame.
function sealLips(vs) {
  if (!vs.mouthClose || !vs.jawOpen || !vs.mouthPressLeft) return;
  vs.mouthClose = vs.mouthClose.map((close, f) => {
    const jaw = vs.jawOpen[f];
    const firmness = Math.min(1, vs.mouthPressLeft[f] / FULL_PRESS);
    return round(Math.min(jaw * MAX_CLOSE_OF_JAW, Math.max(close, firmness * jaw)));
  });
}

/**
 * @param {{phonemes: string[], ptimes: number[], pdurations: number[]}} track from the server (ms)
 * @param {Int16Array} pcm16 the sentence's audio
 * @param {number} sampleRate
 * @param {{offsetMs?: number, has?: (name: string) => boolean, profile?: object}} options
 *   offsetMs: audio already queued before this sentence; has: whether the avatar owns a morph target;
 *   last: this is the final sentence, so the head settles back to rest afterwards;
 *   lastNodMs: stream time of the previous nod, so nods stay spread out across sentences
 * @returns {object|null} anim for TalkingHead's streamAudio({anims: [anim]})
 */
export function synthesizeMouth(track, pcm16, sampleRate, options = {}) {
  const { offsetMs = 0, has = () => true, profile = DEFAULT_PROFILE, last = false, lastNodMs = -Infinity } = options;
  const envelope = energyEnvelope(pcm16, sampleRate, FRAME_MS);
  const leadMs = (profile.timing ?? DEFAULT_PROFILE.timing).leadMs;
  const segments = shiftEarlier(alignToAudio(buildSegments(track), envelope, FRAME_MS), leadMs);
  if (segments.length === 0) return null;

  const audioMs = (pcm16.length / sampleRate) * 1000;
  const gesture = profile.gesture ?? DEFAULT_PROFILE.gesture;
  const tailMs = last && gesture.enabled ? GESTURE_TAIL_MS : undefined;
  const sampled = sampleMouth(segments, audioMs, tailMs, profile.undershootFloor ?? DEFAULT_PROFILE.undershootFloor);
  const count = sampled.count;
  const loudnessAt = (f) => envelope[Math.min(f, envelope.length - 1)] ?? 0;
  const shaped = Object.fromEntries(
    Object.entries(sampled.frames).map(([param, raw]) => [param, shape(param, raw, loudnessAt, profile)]),
  );
  const frames = smoothFrames(shaped, profile.dynamics ?? DEFAULT_PROFILE.dynamics);

  const vs = {};
  for (const [param, values] of Object.entries(frames)) {
    if (has(param)) vs[param] = Array.from(values, (v) => finish(param, v, profile));
  }
  sealLips(vs);
  let nodsAtMs = [];
  if (gesture.enabled) {
    const nods = chooseNods(segments, loudnessAt, offsetMs, gesture.nodGapMs, lastNodMs);
    nodsAtMs = nods.map((n) => n.atMs);
    const moves = gestureFrames(segments, loudnessAt, count, { offsetMs, durationMs: audioMs, last, profile, nods });
    for (const [param, values] of Object.entries(moves)) {
      if (has(param)) vs[param] = Array.from(values, round);
    }
  }
  return { name: "blendshapes", delay: offsetMs, dt: new Array(count).fill(FRAME_MS), vs, nodsAtMs };
}
