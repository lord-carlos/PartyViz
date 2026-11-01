import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateBpmFromEnvelope, resampleEnvelope } from '../bpm-estimator.js';

function makeBeatEnvelope(bpm, { rate = 50, seconds = 12 } = {}) {
  const length = rate * seconds;
  const envelope = new Float32Array(length);
  const beatSeconds = 60 / bpm;

  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const beatPhase = (t / beatSeconds) % 1;
    const eighthPhase = (t / (beatSeconds / 2)) % 1;
    const kick = Math.exp(-beatPhase * 10);
    const hat = Math.exp(-eighthPhase * 20) * 0.35;
    const noise = 0.03 * Math.sin(t * 7.3);
    envelope[i] = kick + hat + noise;
  }

  return envelope;
}

test('detects common tempos within 2 BPM', () => {
  for (const bpm of [70, 90, 100, 120, 128, 140, 174]) {
    const result = estimateBpmFromEnvelope(makeBeatEnvelope(bpm), 50);
    assert.ok(result, `expected a result for ${bpm} BPM`);
    assert.ok(
      Math.abs(result.value - bpm) <= 2,
      `expected ~${bpm} BPM, got ${result.value}`,
    );
    assert.ok(result.confidence >= 0.45, `expected confidence >= 0.45 for ${bpm} BPM`);
  }
});

test('returns null for silence and short input', () => {
  assert.equal(estimateBpmFromEnvelope(new Float32Array(600), 50), null);
  assert.equal(estimateBpmFromEnvelope(new Float32Array(100), 50), null);
  assert.equal(estimateBpmFromEnvelope(null, 50), null);
});

test('resampleEnvelope keeps bucket maxima and respects rate', () => {
  const samples = [
    { ts: 0, value: 1 },
    { ts: 10, value: 5 },
    { ts: 25, value: 2 },
    { ts: 50, value: 3 },
  ];
  const envelope = resampleEnvelope(samples, 20); // 50 ms buckets
  assert.equal(envelope.length, 2);
  assert.equal(envelope[0], 5);
  assert.equal(envelope[1], 3);
});
