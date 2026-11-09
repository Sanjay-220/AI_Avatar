import test from "node:test";
import assert from "node:assert/strict";
import { sampleMouth, FRAME_MS } from "./coarticulation.js";

const seg = (cls, start, end, stress = 0) => ({ cls, start, end, stress });
const at = (frames, param, ms) => frames[param]?.[Math.round(ms / FRAME_MS)] ?? 0;

test("an open vowel opens the jaw at its midpoint", () => {
  const { frames } = sampleMouth([seg("aa", 100, 300)], 400);
  assert.ok(at(frames, "jawOpen", 200) >= 0.3);
});

test("bilabial closure is reached even between wide vowels", () => {
  const segs = [seg("aa", 0, 150), seg("PP", 150, 175), seg("aa", 175, 325)];
  const { frames } = sampleMouth(segs, 400);
  assert.ok(at(frames, "mouthPressLeft", 162) >= 0.45, "lips must press together for p/b/m");
  assert.ok(at(frames, "jawOpen", 162) <= 0.25, "jaw must be nearly shut for p/b/m");
});

test("a quick tongue consonant does not close the vowel shape", () => {
  const segs = [seg("aa", 0, 150), seg("DD", 150, 175), seg("aa", 175, 325)];
  const { frames } = sampleMouth(segs, 400);
  assert.ok(at(frames, "jawOpen", 162) >= 0.3, "vowel should carry through t/d");
});

test("rounded vowel produces pucker, not stretch", () => {
  const { frames } = sampleMouth([seg("U", 100, 300)], 400);
  assert.ok(at(frames, "mouthPucker", 200) >= 0.4);
  assert.ok(at(frames, "mouthStretchLeft", 200) < 0.1);
});

test("silence leaves the mouth neutral", () => {
  const { frames } = sampleMouth([seg("pause", 0, 400)], 400);
  for (const values of Object.values(frames)) assert.ok(Math.max(...values) < 0.02);
});

test("mouth settles to neutral after the last sound", () => {
  const { frames } = sampleMouth([seg("aa", 0, 100)], 100);
  assert.ok(at(frames, "jawOpen", 100 + 400) < 0.05);
});

test("all weights stay within [0, 1] and frames are equal length", () => {
  const segs = [seg("aa", 0, 100, 1), seg("PP", 100, 125), seg("O", 125, 300, 1)];
  const { frames, count } = sampleMouth(segs, 300);
  for (const values of Object.values(frames)) {
    assert.equal(values.length, count);
    for (const v of values) assert.ok(v >= 0 && v <= 1);
  }
});

test("movement is continuous: no frame jumps more than 0.3", () => {
  const segs = [seg("aa", 0, 100), seg("PP", 100, 125), seg("U", 125, 250), seg("SS", 250, 300)];
  const { frames } = sampleMouth(segs, 300);
  for (const values of Object.values(frames)) {
    for (let i = 1; i < values.length; i++) assert.ok(Math.abs(values[i] - values[i - 1]) <= 0.3);
  }
});

test("stress opens the jaw wider", () => {
  const plain = sampleMouth([seg("aa", 100, 300, 0)], 400).frames;
  const stressed = sampleMouth([seg("aa", 100, 300, 1)], 400).frames;
  assert.ok(at(stressed, "jawOpen", 200) > at(plain, "jawOpen", 200));
});

test("the mouth rests before the first sound and long after the last", () => {
  const { frames } = sampleMouth([seg("aa", 600, 800)], 800, 1500);
  assert.ok(at(frames, "jawOpen", 40) < 0.05, "rests before the first sound");
  assert.ok(at(frames, "jawOpen", 2000) < 0.05, "rests long after the last sound");
  assert.ok(at(frames, "jawOpen", 700) >= 0.3, "still opens fully for the sound itself");
});

test("a fast vowel opens the jaw less than a held one", () => {
  const fast = sampleMouth([seg("aa", 100, 130)], 400).frames.jawOpen;
  const held = sampleMouth([seg("aa", 100, 300)], 400).frames.jawOpen;
  assert.ok(Math.max(...fast) <= 0.85 * Math.max(...held));
  assert.ok(Math.max(...fast) >= 0.45 * Math.max(...held), "but it must not vanish");
});

test("a lip closure is never reduced for being quick", () => {
  const segs = [seg("aa", 0, 150), seg("PP", 150, 175), seg("aa", 175, 325)];
  const { frames } = sampleMouth(segs, 400);
  assert.ok(at(frames, "mouthPressLeft", 162) >= 0.45);
});
