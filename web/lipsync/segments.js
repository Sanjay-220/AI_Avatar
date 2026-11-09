// Turns Kokoro's flat phoneme list into mouth segments: {cls, start, end, stress} (ms).
import { classOfPhoneme } from "./recipes.js";

const PRIMARY_STRESS = "ˈ";
const SECONDARY_STRESS = "ˌ";
const LENGTH_MARK = "ː";
const STRESS_GAIN = { [PRIMARY_STRESS]: 1, [SECONDARY_STRESS]: 0.4 };

export function buildSegments({ phonemes, ptimes, pdurations }) {
  const segments = [];
  let pendingStress = null; // { gain, start } carried to the next sound

  phonemes.forEach((phoneme, i) => {
    const start = ptimes[i];
    const end = start + pdurations[i];

    if (phoneme in STRESS_GAIN) {
      pendingStress = { gain: STRESS_GAIN[phoneme], start };
    } else if (phoneme === LENGTH_MARK) {
      const previous = segments.at(-1);
      if (previous) segments[segments.length - 1] = { ...previous, end };
    } else {
      segments.push({
        cls: classOfPhoneme(phoneme),
        start: pendingStress ? pendingStress.start : start,
        end,
        stress: pendingStress ? pendingStress.gain : 0,
      });
      pendingStress = null;
    }
  });
  return segments;
}
