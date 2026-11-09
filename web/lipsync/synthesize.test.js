import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROFILE } from "./profile.js";
import { synthesizeMouth } from "./synthesize.js";

const SR = 24000;
const phon = {
  phonemes: ["h", "ə", "l", "ˈ", "o", "ʊ", " ", "m", "a"],
  ptimes: [0, 25, 75, 100, 150, 225, 300, 325, 350],
  pdurations: [25, 50, 25, 50, 75, 75, 25, 25, 100],
};
const pcm = Int16Array.from({ length: (SR * 500) / 1000 }, (_, i) => Math.round(6000 * Math.sin(i / 8)));

test("builds a TalkingHead blendshapes animation", () => {
  const anim = synthesizeMouth(phon, pcm, SR, { offsetMs: 1500 });
  assert.equal(anim.name, "blendshapes");
  assert.equal(anim.delay, 1500);
  for (const values of Object.values(anim.vs)) assert.equal(values.length, anim.dt.length);
  assert.ok(anim.dt.every((d) => d > 0));
});

test("only drives morph targets the avatar has", () => {
  const has = (name) => name === "jawOpen";
  const anim = synthesizeMouth(phon, pcm, SR, { has });
  assert.deepEqual(Object.keys(anim.vs), ["jawOpen"]);
});

test("values are rounded and within [0, 1]", () => {
  const anim = synthesizeMouth(phon, pcm, SR, {});
  // head rotation is signed, so it is checked separately
  for (const [param, values] of Object.entries(anim.vs)) {
    if (param.startsWith("headRotate")) continue;
    for (const v of values) {
      assert.ok(v >= 0 && v <= 1);
      assert.equal(v, Math.round(v * 1000) / 1000);
    }
  }
});

test("louder audio opens the jaw wider than quiet audio", () => {
  const quiet = Int16Array.from(pcm, (v) => Math.round(v / 40));
  const loudAnim = synthesizeMouth(phon, pcm, SR, {});
  const quietAnim = synthesizeMouth(phon, quiet, SR, {});
  assert.ok(Math.max(...loudAnim.vs.jawOpen) > Math.max(...quietAnim.vs.jawOpen));
});

test("returns null when there are no phonemes", () => {
  assert.equal(synthesizeMouth({ phonemes: [], ptimes: [], pdurations: [] }, pcm, SR, {}), null);
});

test("jaw is capped by the profile limit", () => {
  const profile = { limits: { jawOpen: 0.3 }, scale: {} };
  const anim = synthesizeMouth(phon, pcm, SR, { profile });
  assert.ok(Math.max(...anim.vs.jawOpen) <= 0.3);
});

test("lip closure never exceeds jaw opening (ARKit mouthClose only cancels jaw gap)", () => {
  const anim = synthesizeMouth(phon, pcm, SR, {});
  anim.vs.mouthClose?.forEach((close, f) => assert.ok(close <= anim.vs.jawOpen[f] + 1e-9));
});

test("labiodental recipe does not roll the lower lip over the mouth", () => {
  const track = { phonemes: ["a", "f", "a"], ptimes: [0, 100, 200], pdurations: [100, 100, 100] };
  const anim = synthesizeMouth(track, pcm, SR, {});
  assert.ok(Math.max(...anim.vs.mouthRollLower) <= 0.4);
});

test("adds head and brow movement, and it can be switched off", () => {
  const on = synthesizeMouth(phon, pcm, SR, {});
  assert.ok("headRotateY" in on.vs && "browInnerUp" in on.vs);
  const off = synthesizeMouth(phon, pcm, SR, { profile: { limits: {}, scale: {}, gesture: { enabled: false } } });
  assert.ok(!("headRotateY" in off.vs));
});

test("the last sentence gets extra time for the head to settle", () => {
  const middle = synthesizeMouth(phon, pcm, SR, {});
  const final = synthesizeMouth(phon, pcm, SR, { last: true });
  assert.ok(final.dt.length > middle.dt.length);
  assert.ok(Math.abs(final.vs.headRotateY.at(-1)) < 0.002);
});

test("reports when it nodded, and skips a nod too soon after the previous one", () => {
  const stressed = {
    phonemes: ["h", "ˈ", "a", "l", "ˈ", "o"],
    ptimes: [0, 600, 650, 750, 1500, 1550],
    pdurations: [100, 50, 100, 100, 50, 100],
  };
  const twoSeconds = Int16Array.from({ length: SR * 2 }, (_, i) => Math.round(6000 * Math.sin(i / 8)));
  const first = synthesizeMouth(stressed, twoSeconds, SR, { offsetMs: 0 });
  assert.ok(first.nodsAtMs.length >= 1);
  const soon = synthesizeMouth(stressed, twoSeconds, SR, { offsetMs: 0, lastNodMs: first.nodsAtMs[0] });
  assert.ok(soon.nodsAtMs.every((t) => t - first.nodsAtMs[0] >= 3000));
});

test("the mouth leads the audio by the profile's lead time", () => {
  const vowel = { phonemes: ["a"], ptimes: [400], pdurations: [200] };
  const loudPcm = Int16Array.from({ length: SR }, (_, i) => Math.round(8000 * Math.sin(i / 8)));
  const peakMs = (leadMs) => {
    const profile = { limits: {}, scale: {}, timing: { leadMs }, gesture: { enabled: false } };
    const anim = synthesizeMouth(vowel, loudPcm, SR, { profile });
    return anim.vs.jawOpen.indexOf(Math.max(...anim.vs.jawOpen)) * 20;
  };
  assert.ok(peakMs(0) - peakMs(80) >= 60);
});

test("mouth does not keep moving after the audio has stopped", () => {
  const long = { phonemes: ["a", "a"], ptimes: [100, 600], pdurations: [500, 1500] };
  const shortPcm = Int16Array.from({ length: Math.round(SR * 0.9) }, (_, i) => Math.round(8000 * Math.sin(i / 8)));
  const quiet = new Int16Array(SR * 2);
  quiet.set(shortPcm);
  const profile = { limits: {}, scale: {}, timing: { leadMs: 0 }, gesture: { enabled: false } };
  const anim = synthesizeMouth(long, quiet, SR, { profile });
  const at = (ms) => anim.vs.jawOpen[Math.round(ms / 20)];
  assert.ok(at(1500) < 0.1, "jaw should be back near rest well after the audio ended at 900 ms");
});

test("lips seal on a p even though the slower jaw is still partly open", () => {
  const track = {
    phonemes: ["a", "p", "a"], ptimes: [100, 400, 450], pdurations: [300, 50, 300],
  };
  const audio = Int16Array.from({ length: SR }, (_, i) => Math.round(8000 * Math.sin(i / 8)));
  const profile = { limits: {}, scale: {}, timing: { leadMs: 0 }, gesture: { enabled: false } };
  const anim = synthesizeMouth(track, audio, SR, { profile });
  const f = anim.vs.mouthPressLeft.indexOf(Math.max(...anim.vs.mouthPressLeft));
  const jaw = anim.vs.jawOpen[f];
  assert.ok(jaw > 0.05, "the jaw is not fully shut at the closure");
  assert.ok(anim.vs.mouthClose[f] >= 0.4 * jaw, "mouthClose should bring the lips together");
  assert.ok(anim.vs.mouthClose[f] <= 0.5 * jaw + 1e-3, "but not drag the lower lip over the upper one");
});

test("smoothing can be switched off through the profile", () => {
  const base = { limits: {}, scale: {}, timing: { leadMs: 0 }, gesture: { enabled: false } };
  const smooth = synthesizeMouth(phon, pcm, SR, { profile: { ...base, dynamics: { jaw: 35, lips: 22, closure: 10 } } });
  const raw = synthesizeMouth(phon, pcm, SR, { profile: { ...base, dynamics: { jaw: 0, lips: 0, closure: 0 } } });
  const roughness = (a) => a.reduce((s, v, i) => (i ? s + Math.abs(v - a[i - 1]) : s), 0);
  assert.ok(roughness(smooth.vs.jawOpen) < roughness(raw.vs.jawOpen));
});

test("by default the jaw is not smoothed and fast vowels are not reduced", () => {
  const profile = { ...DEFAULT_PROFILE, gesture: { enabled: false } };
  const off = { ...profile, dynamics: { jaw: 0, lips: 0, closure: 0 }, undershootFloor: 1 };
  assert.deepEqual(synthesizeMouth(phon, pcm, SR, { profile }).vs, synthesizeMouth(phon, pcm, SR, { profile: off }).vs);
});

test("fast vowels shrink only when the profile asks for it", () => {
  const audio = Int16Array.from({ length: SR }, (_, i) => Math.round(8000 * Math.sin(i / 8)));
  const peak = (floor, durationMs) => {
    const track = { phonemes: ["a"], ptimes: [400], pdurations: [durationMs] };
    const profile = { ...DEFAULT_PROFILE, undershootFloor: floor, gesture: { enabled: false } };
    return Math.max(...synthesizeMouth(track, audio, SR, { profile }).vs.jawOpen);
  };
  assert.ok(peak(1, 30) >= 0.95 * peak(1, 200));
  assert.ok(peak(0.55, 30) <= 0.85 * peak(0.55, 200));
});
