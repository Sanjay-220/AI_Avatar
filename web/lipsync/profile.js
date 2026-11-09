// Per-avatar tuning. Another rig (different morph names or proportions) gets its own profile.
export const DEFAULT_PROFILE = {
  // Hard ceilings keep an over-driven jaw from looking like a yawn
  // The upper-lip raise is capped: on this rig it lifts the lip off the upper teeth
  limits: {
    jawOpen: 0.5, mouthFunnel: 0.8, mouthPucker: 0.85, mouthClose: 0.85,
    mouthUpperUpLeft: 0.08, mouthUpperUpRight: 0.08,
    // A hard press squashes the upper lip out of sight under the lower one
    mouthPressLeft: 0.3, mouthPressRight: 0.3,
  },
  // Multipliers on the recipe values for this rig
  // The jaw and lower lip opened too wide while speaking, so they are damped
  scale: {
    jawOpen: 0.7, mouthLowerDownLeft: 0.8, mouthLowerDownRight: 0.8,
    mouthUpperUpLeft: 0.3, mouthUpperUpRight: 0.3,
  },
  // Smoothing time constants in ms (0 = off): a heavy jaw, quick lips, sharp lip closures.
  // Off by default: it made the jaw about 50% slower, and the unsmoothed movement read better.
  // A good starting point if you want it back: { jaw: 35, lips: 22, closure: 10 }
  dynamics: { jaw: 0, lips: 0, closure: 0 },
  // Fast sounds under-articulate. The share of its shape a vanishingly short sound still reaches
  // (1 = off, every sound reaches its full shape). Also off by default; 0.55 is the tested setting.
  undershootFloor: 1,
  // The track measures about 25 ms late against the audio; the rest of the lead is deliberate,
  // because lips move before the sound they make and viewers tolerate early video far better than late
  timing: { leadMs: 60 },
  // Head nods, brow lifts and drift while talking, in TalkingHead's rotation units (about radians)
  gesture: {
    enabled: true,
    nodAmplitude: 0.035,
    nodGapMs: 3000, // minimum time between emphasis nods
    browInner: 0.2,
    browOuter: 0.12,
    driftYaw: 0.04,
    driftRoll: 0.025,
    driftPitch: 0.008,
  },
};
