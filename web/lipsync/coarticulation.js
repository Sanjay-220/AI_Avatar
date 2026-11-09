// Cohen-Massaro style blending: every segment pulls on every mouth parameter, and the pull
// weakens with distance in time. A parameter's value is the pull-weighted average of targets,
// so neighbouring sounds blend and strong sounds (lip closures) win where they matter.
import { recipeFor } from "./recipes.js";

export const FRAME_MS = 20;
const DEFAULT_TAIL_MS = 300; // time allowed for the mouth to settle after the last sound
const STRESS_OPEN_GAIN = 0.25; // extra jaw/lip opening on a fully stressed vowel
// A faint constant pull toward the resting mouth: with no sound nearby the mouth rests, instead of
// holding the nearest sound's shape (a lone first sound would otherwise be held from time zero)
const REST_PULL = 0.03;

// Segments shorter than their recipe's `hold` are widened around their centre
function holdInterval({ start, end }, hold) {
  const missing = Math.max(0, hold - (end - start));
  return [start - missing / 2, end + missing / 2];
}

// Fast speech under-articulates: a sound shorter than its reference duration is not fully formed
function reach(segment, recipe, floor) {
  if (!recipe.refMs) return 1;
  const fraction = (segment.end - segment.start) / recipe.refMs;
  return Math.min(1, floor + (1 - floor) * fraction);
}

function prepare(segments, undershootFloor) {
  return segments.map((s) => {
    const recipe = recipeFor(s.cls);
    const [from, to] = holdInterval(s, recipe.hold);
    return { recipe, from, to, stress: s.stress, reach: reach(s, recipe, undershootFloor) };
  });
}

function pull({ recipe, from, to }, t) {
  const distance = Math.max(0, from - t, t - to);
  return recipe.alpha * Math.exp(-recipe.decay * distance);
}

// Returns { frames: {param: Float32Array}, count } sampled every FRAME_MS from t = FRAME_MS.
// undershootFloor: the share of its shape a vanishingly short sound still reaches (1 = no reduction)
export function sampleMouth(segments, durationMs, tailMs = DEFAULT_TAIL_MS, undershootFloor = 0.55) {
  const items = prepare(segments, undershootFloor);
  const lastEnd = Math.max(durationMs, ...items.map((i) => i.to));
  const count = Math.ceil((lastEnd + tailMs) / FRAME_MS);
  const params = new Set(items.flatMap((i) => Object.keys(i.recipe.targets)));
  const frames = Object.fromEntries([...params].map((p) => [p, new Float32Array(count)]));

  for (let f = 0; f < count; f++) {
    const t = (f + 1) * FRAME_MS;
    const pulls = items.map((item) => pull(item, t));
    const total = pulls.reduce((sum, p) => sum + p, REST_PULL);
    for (const param of params) {
      let weighted = 0;
      items.forEach((item, i) => {
        const target = (item.recipe.targets[param] ?? 0) * item.reach;
        weighted += pulls[i] * target * (1 + STRESS_OPEN_GAIN * item.stress * (target > 0 ? 1 : 0));
      });
      frames[param][f] = Math.min(1, weighted / total);
    }
  }
  return { frames, count };
}
