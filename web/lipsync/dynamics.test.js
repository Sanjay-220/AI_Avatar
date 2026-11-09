import test from "node:test";
import assert from "node:assert/strict";
import { smoothFrames } from "./dynamics.js";
import { FRAME_MS } from "./coarticulation.js";

const pulse = (count, from, to) => Float32Array.from({ length: count }, (_, i) => (i >= from && i < to ? 1 : 0));
const swing = (a) => Math.max(...a) - Math.min(...a);
const TAUS = { jaw: 55, lips: 28, closure: 12 };

test("smoothing adds no delay: an isolated pulse peaks where it did", () => {
  const out = smoothFrames({ jawOpen: pulse(60, 20, 30) }, TAUS);
  const peak = out.jawOpen.indexOf(Math.max(...out.jawOpen));
  assert.ok(Math.abs(peak - 25) <= 1);
});

test("the jaw is slower than the lips: fast alternation is damped more", () => {
  const fast = Float32Array.from({ length: 80 }, (_, i) => (Math.floor(i / 3) % 2 === 0 ? 1 : 0));
  const out = smoothFrames({ jawOpen: fast, mouthStretchLeft: fast }, TAUS);
  assert.ok(swing(out.jawOpen) < swing(out.mouthStretchLeft));
});

test("closure shapes keep most of a short pulse", () => {
  const out = smoothFrames({ mouthPressLeft: pulse(60, 20, 23) }, TAUS);
  assert.ok(Math.max(...out.mouthPressLeft) >= 0.8, "a 60 ms lip press must still seal");
});

test("a constant signal and the frame count are unchanged", () => {
  const flat = new Float32Array(50).fill(0.4);
  const out = smoothFrames({ jawOpen: flat }, TAUS);
  assert.equal(out.jawOpen.length, 50);
  assert.ok(out.jawOpen.every((v) => Math.abs(v - 0.4) < 1e-6));
});

test("values stay within [0, 1]", () => {
  const out = smoothFrames({ jawOpen: pulse(40, 5, 25) }, TAUS);
  assert.ok(out.jawOpen.every((v) => v >= 0 && v <= 1));
});

test("a time constant of 0 switches smoothing off", () => {
  const input = pulse(40, 10, 15);
  const out = smoothFrames({ jawOpen: input }, { jaw: 0, lips: 0, closure: 0 });
  assert.deepEqual([...out.jawOpen], [...input]);
});

test("the input is not modified", () => {
  const input = pulse(40, 10, 15);
  const copy = [...input];
  smoothFrames({ jawOpen: input }, TAUS);
  assert.deepEqual([...input], copy);
  assert.ok(FRAME_MS > 0);
});
