// Different parts of the face move at different speeds: the jaw is heavy, the lips are quick, and
// lip closures must stay sharp or p, b and m never seal. Each group is low-pass filtered with its own
// time constant. The filter runs forwards and then backwards, so it adds no delay: peaks stay in time.
import { FRAME_MS } from "./coarticulation.js";

const JAW_PARAMS = new Set(["jawOpen", "mouthLowerDownLeft", "mouthLowerDownRight"]);
const CLOSURE_PARAMS = /^(mouthClose|mouthPress|mouthRoll)/;

export function groupOf(param) {
  if (JAW_PARAMS.has(param)) return "jaw";
  return CLOSURE_PARAMS.test(param) ? "closure" : "lips";
}

// One pass of a first-order low-pass over `values`, from either end
function onePole(values, alpha, backwards) {
  const out = new Float32Array(values.length);
  const n = values.length;
  const at = (i) => (backwards ? n - 1 - i : i);
  let previous = values[at(0)];
  for (let i = 0; i < n; i++) {
    previous += alpha * (values[at(i)] - previous);
    out[at(i)] = previous;
  }
  return out;
}

function smooth(values, tauMs, frameMs) {
  if (!(tauMs > 0)) return values;
  const alpha = 1 - Math.exp(-frameMs / tauMs);
  return onePole(onePole(values, alpha, false), alpha, true);
}

/**
 * @param {Record<string, Float32Array>} frames mouth parameter tracks, one value per frame
 * @param {{jaw: number, lips: number, closure: number}} taus time constants in ms (0 = off)
 * @returns {Record<string, Float32Array>} new tracks; the input is not modified
 */
export function smoothFrames(frames, taus, frameMs = FRAME_MS) {
  return Object.fromEntries(
    Object.entries(frames).map(([param, values]) => [param, smooth(values, taus[groupOf(param)], frameMs)]),
  );
}
