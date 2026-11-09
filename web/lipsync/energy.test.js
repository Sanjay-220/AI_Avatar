import test from "node:test";
import assert from "node:assert/strict";
import { energyEnvelope } from "./energy.js";

const SR = 24000;
const tone = (amp, ms) =>
  Int16Array.from({ length: (SR * ms) / 1000 }, (_, i) => Math.round(amp * 32767 * Math.sin(i / 10)));

test("louder audio gives a higher level than quiet audio", () => {
  const loud = energyEnvelope(tone(0.4, 200), SR, 20);
  const quiet = energyEnvelope(tone(0.01, 200), SR, 20);
  assert.ok(loud[5] > quiet[5] + 0.3);
});

test("silence gives level 0", () => {
  const env = energyEnvelope(new Int16Array(SR / 5), SR, 20);
  assert.ok(env.every((v) => v === 0));
});

test("levels are within [0, 1] and one per frame", () => {
  const env = energyEnvelope(tone(1, 200), SR, 20);
  assert.equal(env.length, 10);
  assert.ok(env.every((v) => v >= 0 && v <= 1));
});
