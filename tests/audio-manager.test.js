import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager } from '../audio-manager.js';

test('maps Hz to analyser bins', () => {
  const manager = new AudioManager();
  manager.sampleRate = 44100;
  manager.fftSize = 2048;
  manager.binCount = 1024;

  assert.equal(manager._hzToBin(0), 0);
  assert.equal(manager._hzToBin(1000), 46);
  assert.equal(manager._hzToBin(44100), 1023); // clamped
  assert.equal(manager._hzToBin(-10), 0); // clamped
});

test('computes non-overlapping band bins', () => {
  const manager = new AudioManager();
  manager.sampleRate = 44100;
  manager.fftSize = 2048;
  manager.binCount = 1024;
  manager._computeBandBins();

  assert.equal(manager.bands.low.fromBin, 0);
  assert.equal(manager.bands.low.toBin, 11);
  assert.equal(manager.bands.mid.fromBin, 11);
  assert.ok(manager.bands.high.toBin > manager.bands.mid.toBin);
});

test('test mode produces in-range, musical band values', () => {
  const manager = new AudioManager();
  for (let i = 0; i < 120; i++) {
    const bands = manager._generateTestSpectrum(i / 60);
    for (const value of Object.values(bands)) {
      assert.ok(value >= 0 && value <= 100, `band value out of range: ${value}`);
    }
  }
});

test('BPM samples ignore low confidence and fold octave errors', () => {
  const manager = new AudioManager();
  manager.addBpmSample(80, 0.1); // ignored
  assert.equal(manager.bpmSamples.length, 0);

  manager.addBpmSample(120, 0.9);
  manager.addBpmSample(240, 0.9); // folded to 120
  manager.addBpmSample(60, 0.9); // folded to 120
  assert.equal(manager.bpmSamples.length, 3);
  for (const sample of manager.bpmSamples) {
    assert.ok(Math.abs(sample.value - 120) < 0.01, `expected 120, got ${sample.value}`);
  }

  const info = manager.getBpmInfo();
  assert.equal(info.value, 120);
  assert.equal(info.rolling, 120);
  assert.equal(info.stable, true);
});

test('setTestBpm clamps to a sane range', () => {
  const manager = new AudioManager();
  assert.equal(manager.setTestBpm(128), 128);
  assert.equal(manager.setTestBpm(999), 128);
  assert.equal(manager.setTestBpm(-1), 128);
});
