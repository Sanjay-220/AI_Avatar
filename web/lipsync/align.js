// Reconciles the phoneme track with the audio that was actually produced.
// The TTS predicts phoneme durations before synthesising, and its last phoneme tends to run
// on well past the point where the voice has stopped; left alone, the mouth keeps moving in silence.
const SPEECH_LEVEL = 0.2; // loudness level (0..1) counted as "speaking"
const END_MARGIN_MS = 40; // grace after the last loud frame, so quiet endings aren't cut off
const MIN_SEGMENT_MS = 25;

/** First and last time (ms) the loudness envelope is above the speech level, or null for silence. */
export function speechSpan(level, frameMs, threshold = SPEECH_LEVEL) {
  const first = level.findIndex((v) => v > threshold);
  if (first === -1) return null;
  const last = level.length - 1 - [...level].reverse().findIndex((v) => v > threshold);
  return { startMs: first * frameMs, endMs: (last + 1) * frameMs };
}

/** Returns segments cut back to the audio's real end; the input is left untouched. */
export function alignToAudio(segments, level, frameMs) {
  const span = speechSpan(level, frameMs);
  if (!span) return segments;
  const limit = span.endMs + END_MARGIN_MS;

  return segments.flatMap((s) => {
    if (s.cls === "pause" || s.end <= limit) return [s];
    if (s.start >= limit) return [];
    return [{ ...s, end: Math.max(limit, s.start + MIN_SEGMENT_MS) }];
  });
}
