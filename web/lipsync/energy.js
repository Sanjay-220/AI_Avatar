// Loudness envelope of the audio: 0 (silence) to 1 (loud), one value per frame.
const FLOOR_DB = -45; // at or below this the mouth is treated as silent
const CEILING_DB = -15; // at or above this the mouth gets full loudness scaling

export function energyEnvelope(pcm16, sampleRate, frameMs) {
  const samplesPerFrame = Math.round((sampleRate * frameMs) / 1000);
  const frames = Math.ceil(pcm16.length / samplesPerFrame);
  const levels = new Float32Array(frames);

  for (let f = 0; f < frames; f++) {
    const from = f * samplesPerFrame;
    const to = Math.min(from + samplesPerFrame, pcm16.length);
    let sumSquares = 0;
    for (let i = from; i < to; i++) sumSquares += (pcm16[i] / 32768) ** 2;
    const rms = Math.sqrt(sumSquares / (to - from));
    if (rms === 0) continue;
    const db = 20 * Math.log10(rms);
    levels[f] = Math.min(1, Math.max(0, (db - FLOOR_DB) / (CEILING_DB - FLOOR_DB)));
  }
  return levels;
}
