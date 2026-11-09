// Mouth-shape recipes: each phoneme class is a blend of ARKit blendshapes, not one viseme.
// `refMs` is the duration at which a sound reaches its full shape; shorter sounds are reduced
// (0 = never reduced: lip closures and f/v must always be seen).
// `alpha` is how strongly the sound claims the mouth, `decay` (1/ms) how quickly that claim
// fades with distance, `hold` the shortest time (ms) the shape is held so quick sounds aren't skipped.
// Tongue-only sounds get a low alpha so the neighbouring vowel carries through them.

const both = (name, v) => ({ [`${name}Left`]: v, [`${name}Right`]: v });

const RECIPES = {
  aa: { alpha: 1.0, decay: 1 / 90, hold: 0, refMs: 80, targets: { jawOpen: 0.4, ...both("mouthLowerDown", 0.18), ...both("mouthStretch", 0.1) } },
  E: { alpha: 1.0, decay: 1 / 90, hold: 0, refMs: 80, targets: { jawOpen: 0.26, ...both("mouthStretch", 0.25), ...both("mouthLowerDown", 0.08) } },
  schwa: { alpha: 0.8, decay: 1 / 90, hold: 0, refMs: 60, targets: { jawOpen: 0.16 } },
  I: { alpha: 1.0, decay: 1 / 80, hold: 0, refMs: 70, targets: { jawOpen: 0.15, ...both("mouthStretch", 0.4), ...both("mouthSmile", 0.25) } },
  O: { alpha: 1.0, decay: 1 / 90, hold: 0, refMs: 80, targets: { jawOpen: 0.27, mouthFunnel: 0.55, mouthPucker: 0.15 } },
  U: { alpha: 1.0, decay: 1 / 80, hold: 0, refMs: 80, targets: { jawOpen: 0.12, mouthPucker: 0.65, mouthFunnel: 0.45 } },
  W: { alpha: 1.1, decay: 1 / 60, hold: 40, refMs: 0, targets: { jawOpen: 0.08, mouthPucker: 0.75, mouthFunnel: 0.35 } },
  // mouthClose only cancels the gap jawOpen makes, so it stays small here (see synthesize.js)
  PP: { alpha: 5.0, decay: 1 / 35, hold: 50, refMs: 0, targets: { ...both("mouthPress", 0.65), mouthClose: 0.1, jawOpen: 0.1 } },
  FF: { alpha: 2.5, decay: 1 / 40, hold: 50, refMs: 0, targets: { mouthRollLower: 0.3, ...both("mouthUpperUp", 0.35), jawOpen: 0.14 } },
  TH: { alpha: 0.7, decay: 1 / 50, hold: 30, refMs: 50, targets: { jawOpen: 0.12, ...both("mouthLowerDown", 0.08) } },
  DD: { alpha: 0.45, decay: 1 / 50, hold: 0, refMs: 50, targets: { jawOpen: 0.15, ...both("mouthStretch", 0.15) } },
  nn: { alpha: 0.45, decay: 1 / 50, hold: 0, refMs: 50, targets: { jawOpen: 0.18, ...both("mouthStretch", 0.1) } },
  kk: { alpha: 0.4, decay: 1 / 50, hold: 0, refMs: 50, targets: { jawOpen: 0.2 } },
  SS: { alpha: 0.8, decay: 1 / 50, hold: 30, refMs: 50, targets: { jawOpen: 0.08, ...both("mouthStretch", 0.35), ...both("mouthSmile", 0.15) } },
  CH: { alpha: 0.9, decay: 1 / 55, hold: 30, refMs: 50, targets: { mouthFunnel: 0.5, mouthPucker: 0.3, jawOpen: 0.12 } },
  RR: { alpha: 0.7, decay: 1 / 60, hold: 0, refMs: 50, targets: { mouthFunnel: 0.3, mouthPucker: 0.15, jawOpen: 0.2 } },
  Y: { alpha: 0.6, decay: 1 / 60, hold: 0, refMs: 50, targets: { jawOpen: 0.12, ...both("mouthStretch", 0.3) } },
  H: { alpha: 0.3, decay: 1 / 50, hold: 0, refMs: 50, targets: { jawOpen: 0.15 } },
  pause: { alpha: 0.5, decay: 1 / 60, hold: 0, refMs: 0, targets: {} },
};

const GROUPS = {
  aa: "ɑaæʌɐ", E: "ɛeɜ", schwa: "əɘ", I: "ɪiᵻ", O: "ɔoɒ", U: "uʊ", W: "w",
  PP: "pbm", FF: "fv", TH: "θð", DD: "tdɾ", nn: "nlɫ", kk: "kɡgŋx",
  SS: "sz", CH: "ʃʒʧʤ", RR: "ɹrɚɝ", Y: "jy", H: "h",
};

export const VOWEL_CLASSES = new Set(["aa", "E", "schwa", "I", "O", "U"]);
const CLASS_OF = new Map(Object.entries(GROUPS).flatMap(([cls, chars]) => [...chars].map((c) => [c, cls])));
const FALLBACK_CLASS = "kk"; // an unknown consonant still opens the jaw slightly

export const recipeFor = (cls) => RECIPES[cls];

// Kokoro emits spaces, punctuation, stress and length marks as their own entries
export function classOfPhoneme(phoneme) {
  const first = phoneme.trim()[0];
  if (first === undefined) return "pause";
  return CLASS_OF.get(first) ?? (/[\p{L}]/u.test(first) ? FALLBACK_CLASS : "pause");
}

// Jaw and lip-opening shapes follow loudness; closure and rounding shapes must not.
export const LOUDNESS_PARAMS = new Set([
  "jawOpen", "mouthLowerDownLeft", "mouthLowerDownRight", "mouthStretchLeft", "mouthStretchRight",
]);
