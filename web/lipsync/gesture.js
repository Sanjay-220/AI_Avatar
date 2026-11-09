// Small speech-driven movement: an occasional emphasis nod with a brow lift, plus a slow head
// drift while talking. Amplitudes are deliberately tiny; a product face should feel alive, not busy.
import { FRAME_MS } from "./coarticulation.js";
import { DEFAULT_PROFILE } from "./profile.js";

export const GESTURE_TAIL_MS = 900; // head settles back to rest after the last sentence
const EASE_IN_MS = 800; // drift fades in at the start of a stream
const EASE_OUT_MS = 800;
const PRIMARY_STRESS = 1;
const NOD_RISE_MS = 220; // slow enough to read as a nod, not a twitch
const NOD_FALL_MS = 600;
const BROW_LEAD_MS = 40; // brows lift just before the head dips
const BROW_RISE_MS = 150;
const BROW_FALL_MS = 600;
const MIN_NOD_TIME_MS = 500; // no nod in the first half second of a stream
const QUIET_NOD = 0.6; // share of the nod kept for the quietest speech
const LOUD_NOD = 0.4;
// Two sine waves per axis with unrelated periods, so the drift never looks like a loop
const DRIFT = {
  yaw: [[5300, 0.7, 0.6], [3100, 2.1, 0.4]],
  roll: [[6700, 1.3, 0.6], [4100, 0.2, 0.4]],
  pitch: [[4300, 2.9, 0.6], [2700, 1.1, 0.4]],
};

const smoothstep = (x) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

// 0 -> 1 -> 0 around `center`: smooth rise, then a slower fall
function bump(t, center, rise, fall) {
  const dt = t - center;
  if (dt < -rise || dt > fall) return 0;
  return dt < 0 ? 0.5 - 0.5 * Math.cos(Math.PI * (1 + dt / rise)) : 0.5 + 0.5 * Math.cos((Math.PI * dt) / fall);
}

const wave = (t, terms) => terms.reduce((sum, [period, phase, weight]) => sum + weight * Math.sin((2 * Math.PI * t) / period + phase), 0);

/** Slow head drift at absolute stream time t (ms), within the profile's amplitude. */
export function driftAt(t, g) {
  return {
    yaw: g.driftYaw * wave(t, DRIFT.yaw),
    roll: g.driftRoll * wave(t, DRIFT.roll),
    pitch: g.driftPitch * wave(t, DRIFT.pitch),
  };
}

// Emphasis nods: loudest primary-stressed vowels first, each at least gapMs from any other nod,
// including the previous sentence's (lastNodMs), so a long answer nods only now and then.
// Times are absolute stream time (offsetMs + time within the sentence).
export function chooseNods(segments, loudnessAt, offsetMs, gapMs, lastNodMs) {
  const candidates = segments
    .filter((s) => s.stress >= PRIMARY_STRESS)
    .map((s) => {
      const centre = (s.start + s.end) / 2;
      return { centre, atMs: offsetMs + centre, loud: loudnessAt(Math.round(centre / FRAME_MS)) };
    })
    .filter((c) => c.atMs >= MIN_NOD_TIME_MS && c.atMs - lastNodMs >= gapMs)
    .sort((a, b) => b.loud - a.loud || a.atMs - b.atMs);

  const chosen = [];
  for (const c of candidates) {
    if (chosen.every((n) => Math.abs(n.atMs - c.atMs) >= gapMs)) chosen.push(c);
  }
  return chosen.sort((a, b) => a.atMs - b.atMs);
}

/**
 * @param {Array} segments mouth segments (ms, relative to this sentence)
 * @param {(frame: number) => number} loudnessAt 0..1 loudness for a frame
 * @param {number} count number of frames, one every FRAME_MS starting at FRAME_MS
 * @param {{offsetMs: number, durationMs: number, last?: boolean, profile?: object}} options
 *   offsetMs: audio already queued before this sentence, so drift continues across sentences;
 *   lastNodMs: stream time of the previous nod; nods: precomputed chooseNods() result
 * @returns {Record<string, Float32Array>}
 */
export function gestureFrames(segments, loudnessAt, count, options) {
  const { offsetMs, durationMs, last = false, profile = DEFAULT_PROFILE, lastNodMs = -Infinity } = options;
  const g = profile.gesture ?? DEFAULT_PROFILE.gesture;
  const names = ["headRotateX", "headRotateY", "headRotateZ", "browInnerUp", "browOuterUpLeft", "browOuterUpRight"];
  const frames = Object.fromEntries(names.map((n) => [n, new Float32Array(count)]));
  const nods = options.nods ?? chooseNods(segments, loudnessAt, offsetMs, g.nodGapMs, lastNodMs);

  for (let f = 0; f < count; f++) {
    const t = (f + 1) * FRAME_MS;
    let ease = smoothstep((offsetMs + t) / EASE_IN_MS);
    if (last) ease *= 1 - smoothstep((t - durationMs) / EASE_OUT_MS);
    const drift = driftAt(offsetMs + t, g);

    let nod = 0;
    let brow = 0;
    for (const { centre, loud: level } of nods) {
      const loud = QUIET_NOD + LOUD_NOD * level;
      nod += loud * bump(t, centre, NOD_RISE_MS, NOD_FALL_MS);
      brow += loud * bump(t, centre - BROW_LEAD_MS, BROW_RISE_MS, BROW_FALL_MS);
    }
    frames.headRotateX[f] = g.nodAmplitude * Math.min(1, nod) + ease * drift.pitch;
    frames.headRotateY[f] = ease * drift.yaw;
    frames.headRotateZ[f] = ease * drift.roll;
    frames.browInnerUp[f] = g.browInner * Math.min(1, brow);
    frames.browOuterUpLeft[f] = g.browOuter * Math.min(1, brow);
    frames.browOuterUpRight[f] = g.browOuter * Math.min(1, brow);
  }
  return frames;
}
