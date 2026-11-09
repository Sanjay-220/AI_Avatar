import test from "node:test";
import assert from "node:assert/strict";
import { buildSegments } from "./segments.js";

const track = (rows) => ({
  phonemes: rows.map((r) => r[0]),
  ptimes: rows.map((r) => r[1]),
  pdurations: rows.map((r) => r[2]),
});

test("stress mark moves its time onto the following vowel", () => {
  const segs = buildSegments(track([["l", 0, 25], ["ˈ", 25, 50], ["a", 75, 50]]));
  const vowel = segs.find((s) => s.cls === "aa");
  assert.equal(vowel.start, 25);
  assert.equal(vowel.end, 125);
  assert.equal(vowel.stress, 1);
  assert.equal(segs.length, 2);
});

test("secondary stress is weaker than primary", () => {
  const primary = buildSegments(track([["ˈ", 0, 25], ["a", 25, 50]]))[0];
  const secondary = buildSegments(track([["ˌ", 0, 25], ["a", 25, 50]]))[0];
  assert.ok(secondary.stress > 0 && secondary.stress < primary.stress);
});

test("length mark extends the previous vowel", () => {
  const segs = buildSegments(track([["u", 0, 25], ["ː", 25, 25], ["t", 50, 25]]));
  assert.equal(segs[0].cls, "U");
  assert.equal(segs[0].end, 50);
});

test("spaces and punctuation become pauses", () => {
  const segs = buildSegments(track([["a", 0, 50], [" ", 50, 25], ["a", 75, 50], [".", 125, 25]]));
  assert.deepEqual(segs.map((s) => s.cls), ["aa", "pause", "aa", "pause"]);
});

test("diphthong tokens stay separate segments", () => {
  const segs = buildSegments(track([["o", 0, 50], ["ʊ", 50, 50]]));
  assert.deepEqual(segs.map((s) => s.cls), ["O", "U"]);
});

test("empty track gives no segments", () => {
  assert.deepEqual(buildSegments(track([])), []);
});
