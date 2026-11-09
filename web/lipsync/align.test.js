import test from "node:test";
import assert from "node:assert/strict";
import { alignToAudio, speechSpan } from "./align.js";

const FRAME = 20;
const seg = (cls, start, end) => ({ cls, start, end, stress: 0 });
// loudness level per 20 ms frame: sound from `fromMs` until `toMs`
const level = (totalMs, fromMs, toMs) =>
  Float32Array.from({ length: totalMs / FRAME }, (_, f) => (f * FRAME >= fromMs && f * FRAME < toMs ? 0.8 : 0));

test("speechSpan finds where sound starts and ends", () => {
  assert.deepEqual(speechSpan(level(2000, 100, 1500), FRAME), { startMs: 100, endMs: 1500 });
});

test("speechSpan is null for silence", () => {
  assert.equal(speechSpan(level(1000, 0, 0), FRAME), null);
});

test("a final sound that outlasts the audio is cut back to where the audio ends", () => {
  const segs = [seg("aa", 100, 600), seg("E", 600, 1600)];
  const out = alignToAudio(segs, level(2000, 100, 1400), FRAME);
  assert.ok(out[1].end <= 1400 + 60);
  assert.equal(out[1].start, 600);
});

test("sounds that start after the audio has finished are dropped", () => {
  const segs = [seg("aa", 100, 600), seg("PP", 1700, 1800)];
  const out = alignToAudio(segs, level(2000, 100, 1000), FRAME);
  assert.deepEqual(out.map((s) => s.cls), ["aa"]);
});

test("segments inside the audio are left exactly as they were", () => {
  const segs = [seg("aa", 100, 600), seg("E", 600, 1000)];
  assert.deepEqual(alignToAudio(segs, level(2000, 100, 1400), FRAME), segs);
});

test("pauses are never dropped or stretched", () => {
  const segs = [seg("aa", 100, 600), seg("pause", 1500, 1900)];
  const out = alignToAudio(segs, level(2000, 100, 1000), FRAME);
  assert.deepEqual(out.at(-1), segs.at(-1));
});

test("silent audio leaves the segments alone", () => {
  const segs = [seg("aa", 100, 600)];
  assert.deepEqual(alignToAudio(segs, level(1000, 0, 0), FRAME), segs);
});

test("the input is not modified", () => {
  const segs = [seg("aa", 100, 600), seg("E", 600, 1600)];
  const copy = structuredClone(segs);
  alignToAudio(segs, level(2000, 100, 1400), FRAME);
  assert.deepEqual(segs, copy);
});
