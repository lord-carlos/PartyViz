---
name: PartyViz Audio
description: Work on PartyViz's Web Audio analyser, frequency bands, test mode, rich update payload, and experimental BPM estimator.
---

# PartyViz Audio Workflow

Use this skill when changing `audio-manager.js`, `bpm-estimator.js`,
`bpm-worker.js`, the mic/test-mode UI in `index.js`, or the debug visualizer.

Read `AGENTS.md` for repo-wide rules.

## Pipeline

```
AudioContext -> AnalyserNode -> AudioManager loop
                                |-- dB spectrum
                                |-- linear magnitudes / RMS / centroid / flux
                                |-- bands: low/mid/high (0..100)
                                |-- BPM estimator (worker, main-thread fallback)
                                '-- window.currentAnimation.updateFrequencies()
```

- One `requestAnimationFrame` loop drives everything.
- `AudioManager` starts in test mode, so the app works without microphone
  permission.
- The loop calls `updateFrequencies(low, mid, high)` on the active animation and
  emits a richer payload to `onUpdate` subscribers.

## Bands

Defined in `audio-manager.js` (`bandDefs`):

| Band | Hz |
| --- | --- |
| low | 20–250 |
| mid | 250–4000 |
| high | 4000–20000 |

Each band value is the average dB of its bins mapped from `-100..0` to `0..100`.
Values are integers after rounding. Animations must never assume `0..255`.

`setBands([{ name, from, to }])` can override the ranges; `_computeBandBins()`
recomputes the bin boundaries. Band names become keys in `payload.bands`.

## Test mode

Test mode is not random noise. It simulates a four-on-the-floor pattern at
`this.testBpm` (default 120):

- kick on every beat (drives `low`)
- snare on beats 2 and 4 (drives `mid`)
- eighth-note hats (drive `high`)
- a static noise floor in the synthetic spectrum so spectral flux reflects real
  onsets

This makes animations look plausible and lets the BPM estimator converge without
audio hardware. Use `audioManager.setTestBpm(128)` to test another tempo.

When test mode is off and no live input is available, the manager emits silence
(0 bands), not random values.

## Rich update payload

```js
const unsubscribe = window.audioManager.onUpdate((payload) => { ... });
```

Payload shape:

```js
{
  timestamp, sampleRate, fftSize,
  spectrumDb,      // Float32Array, -100..0 dB
  spectrumNorm,    // Float32Array, 0..100
  bands: { low, mid, high },
  features: { rms, centroidHz, spectralFlux },
  bpm: { value, rolling, confidence, correlation, ageMs, samples, stable }
}
```

`onUpdate` returns an unsubscribe function. Always call it from `stop()` when an
animation subscribes; otherwise a stopped animation keeps receiving frames.

## BPM estimator

`bpm-estimator.js` is shared by the main thread and `bpm-worker.js`.

1. Spectral flux is accumulated in `fluxHistory` as `{ ts, flux }`.
2. Every `bpmUpdateIntervalSec` (3 s), the manager resamples the last
   `bpmWindowSec` (20 s) to a fixed 50 Hz envelope using bucket maxima.
3. The estimator removes the mean, runs normalized autocorrelation over lags
   corresponding to 60–200 BPM, applies a mild prior around 120 BPM to reduce
   octave errors, and parabolic-interpolates the winning lag.
4. Results below `bpmMinConfidence` (0.45) are ignored.
5. `addBpmSample` folds obvious octave jumps (×2/÷2) relative to the current
   rolling value.
6. `getBpmInfo()` returns the weighted rolling BPM, confidence, age, sample
   count, and a `stable` flag (≥3 recent samples within 3 BPM).

BPM is deliberately marked experimental. It works best with strong, regular
transients (kick/hats). Do not block on it for visuals; use it as an optional
enhancement.

## Common pitfalls

- Do not call `getFloatFrequencyData` and expect values in `0..1`; they are dB.
- Do not set `smoothingTimeConstant` too high when relying on onsets; it blunts
  spectral flux.
- Do not create a second analyser or a second audio loop; one manager owns the
  loop.
- Do not use `Date.now()` as a per-frame clock for animation visuals; use
  `performance.now()` or an accumulated frame counter. `Date.now()` is fine for
  payload timestamps and BPM history.
- Do not add per-frame `Math.pow`/array allocation in the hot path unless the
  gain is measurable. The current feature loop is already O(bins).
- When switching input devices, stop the old stream tracks and disconnect the
  old source before creating the new one.
- On `dispose()`, stop the loop first, then terminate the worker, stop the
  stream, disconnect nodes, close the context, and null buffers.

## Debugging

- `window.audioManager.getBpmInfo()`
- `window.audioManager.getSpectrum({ format: 'norm' })`
- `window.audioManager.setTestMode(true)`
- `window.audioManager.setTestBpm(120)`
- The `debug-visualizer` animation shows spectra, features, and BPM live.
- Headless check: `bun run smoke` expects test-mode BPM near 120 and stable.

## Tests

```bash
bun run test
```

`tests/bpm-estimator.test.js` covers 70–174 BPM, silence, short input, and
resampling. `tests/audio-manager.test.js` covers bin mapping, band bins, test
mode ranges, octave folding, and `setTestBpm`.

When changing the estimator, add or update a synthetic-envelope test rather than
only testing through the browser.
