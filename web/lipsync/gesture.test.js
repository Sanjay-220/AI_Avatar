import test from "node:test";
import assert from "node:assert/strict";
import { gestureFrames, chooseNods, driftAt, GESTURE_TAIL_MS } from "./gesture.js";
import { FRAME_MS } from "./coarticulation.js";
import { DEFAULT_PROFILE } from "./profile.js";

const seg = (cls, start, end, stress = 0) => ({ cls, start, end, stress });
const loud = () => 0.8;
const run = (segments, durationMs, opts = {}) => {
  const count = Math.ceil((durationMs + (opts.last ? GESTURE_TAIL_MS : 300)) / FRAME_MS);
  return { frames: gestureFrames(segments, loud, count, { offsetMs: 0, durationMs, ...opts }), count };
};
const peakIndex = (arr) => arr.indexOf(Math.max(...arr));

test("a stressed vowel produces a head nod near that vowel", () => {
  const { frames } = run([seg("aa", 1000, 1200, 1)], 2000);
  const peakMs = peakIndex(frames.headRotateX) * FRAME_MS;
  assert.ok(Math.max(...frames.headRotateX) >= 0.02);
  assert.ok(Math.abs(peakMs - 1100) <= 200);
});

test("unstressed speech produces no nod", () => {
  const { frames } = run([seg("aa", 1000, 1200, 0), seg("E", 1300, 1500, 0)], 2000);
  assert.ok(Math.max(...frames.headRotateX) <= DEFAULT_PROFILE.gesture.driftPitch + 1e-9, "only the slow drift, no nod");
});

test("a dense run of stressed words still gives one nod per window, not a bob", () => {
  const segs = Array.from({ length: 10 }, (_, i) => seg("aa", 200 + i * 250, 400 + i * 250, 1));
  const { frames } = run(segs, 3000);
  const peaks = frames.headRotateX.filter((v, i, a) => v > 0.02 && v >= (a[i - 1] ?? 0) && v > (a[i + 1] ?? 0));
  assert.ok(peaks.length <= 2);
});

test("the nod lands on the loudest stressed word in its window", () => {
  const segs = [seg("aa", 1000, 1200, 1), seg("aa", 1600, 1800, 1)];
  const louderLater = (f) => (f >= 80 ? 0.9 : 0.3);
  const count = Math.ceil(2300 / FRAME_MS);
  const frames = gestureFrames(segs, louderLater, count, { offsetMs: 0, durationMs: 2000 });
  const peakMs = peakIndex(frames.headRotateX) * FRAME_MS;
  assert.ok(Math.abs(peakMs - 1700) <= 250);
});

test("no nod starts within the gap after the previous sentence's nod", () => {
  const { frames } = run([seg("aa", 1000, 1200, 1)], 2000, { offsetMs: 2000, lastNodMs: 1500 });
  assert.ok(Math.max(...frames.headRotateX) <= DEFAULT_PROFILE.gesture.driftPitch + 1e-9);
});

test("a nod is allowed again once the gap has passed", () => {
  const { frames } = run([seg("aa", 1000, 1200, 1)], 2000, { offsetMs: 2000, lastNodMs: -5000 });
  assert.ok(Math.max(...frames.headRotateX) >= 0.02);
});

test("chooseNods reports absolute stream times and keeps nods a gap apart", () => {
  const segs = [seg("aa", 600, 800, 1), seg("aa", 2000, 2200, 1), seg("aa", 4000, 4200, 1)];
  const nods = chooseNods(segs, loud, 1000, DEFAULT_PROFILE.gesture.nodGapMs, -Infinity);
  const times = nods.map((n) => n.atMs);
  assert.ok(times.every((t, i) => i === 0 || t - times[i - 1] >= DEFAULT_PROFILE.gesture.nodGapMs));
  assert.ok(times.every((t) => t >= 1000));
});

test("the nod is slow enough to read as a nod, not a twitch", () => {
  const { frames } = run([seg("aa", 1000, 1200, 1)], 2000);
  const above = frames.headRotateX.filter((v) => v > 0.5 * Math.max(...frames.headRotateX)).length * FRAME_MS;
  assert.ok(above >= 200, "head should stay dipped for at least 200 ms");
});

test("brows lift together with the nod", () => {
  const { frames } = run([seg("aa", 1000, 1200, 1)], 2000);
  const nod = peakIndex(frames.headRotateX) * FRAME_MS;
  const brow = peakIndex(frames.browInnerUp) * FRAME_MS;
  assert.ok(Math.max(...frames.browInnerUp) >= 0.1);
  assert.ok(Math.abs(nod - brow) <= 150);
});

test("movement stays small", () => {
  const segs = Array.from({ length: 6 }, (_, i) => seg("aa", 500 + i * 900, 700 + i * 900, 1));
  const { frames } = run(segs, 6500);
  const g = DEFAULT_PROFILE.gesture;
  assert.ok(Math.max(...frames.headRotateX) <= g.nodAmplitude + g.driftPitch + 1e-9);
  assert.ok(Math.max(...frames.headRotateY.map(Math.abs)) <= g.driftYaw + 1e-9);
  assert.ok(Math.max(...frames.headRotateZ.map(Math.abs)) <= g.driftRoll + 1e-9);
});

test("drift is continuous in time, so sentences join without a jump", () => {
  for (let t = 0; t < 20000; t += FRAME_MS) {
    const a = driftAt(t, DEFAULT_PROFILE.gesture);
    const b = driftAt(t + FRAME_MS, DEFAULT_PROFILE.gesture);
    assert.ok(Math.abs(a.yaw - b.yaw) < 0.004 && Math.abs(a.roll - b.roll) < 0.004);
  }
});

test("the head eases in at the start of a stream", () => {
  const { frames } = run([seg("aa", 500, 700, 0)], 2000, { offsetMs: 0 });
  assert.ok(Math.abs(frames.headRotateY[0]) < 0.004);
});

test("the head settles back to neutral after the last sentence", () => {
  const { frames, count } = run([seg("aa", 500, 700, 0)], 2000, { offsetMs: 8000, last: true });
  for (const k of ["headRotateX", "headRotateY", "headRotateZ"]) {
    assert.ok(Math.abs(frames[k][count - 1]) < 0.002, `${k} should end at rest`);
  }
});

test("later sentences carry on from where the drift already is", () => {
  const first = run([seg("aa", 500, 700, 0)], 2000, { offsetMs: 0 });
  const second = run([seg("aa", 500, 700, 0)], 2000, { offsetMs: 2000 });
  const endOfFirst = first.frames.headRotateY[Math.round(2000 / FRAME_MS) - 1];
  assert.ok(Math.abs(second.frames.headRotateY[0] - endOfFirst) < 0.006);
});
