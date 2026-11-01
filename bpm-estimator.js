// bpm-estimator.js
// Shared tempo estimator used by AudioManager (main thread fallback) and bpm-worker.js.
//
// Input is an onset-strength envelope sampled at a fixed rate (Hz). The estimator
// removes the mean, runs a normalized autocorrelation over plausible beat lags,
// applies a mild tempo prior around 120 BPM (to avoid octave errors), and returns
// the best tempo plus a 0..1 confidence.

const DEFAULT_MIN_BPM = 60;
const DEFAULT_MAX_BPM = 200;
const PREFERRED_BPM = 120;
const TEMPO_PRIOR_SIGMA_OCTAVES = 0.85;

/**
 * @param {ArrayLike<number>} envelope onset strength samples
 * @param {number} rate sample rate in Hz
 * @param {{minBpm?: number, maxBpm?: number}} [options]
 * @returns {{value: number, confidence: number, correlation: number, seconds: number} | null}
 */
export function estimateBpmFromEnvelope(envelope, rate, options = {}) {
    const minBpm = options.minBpm || DEFAULT_MIN_BPM;
    const maxBpm = options.maxBpm || DEFAULT_MAX_BPM;

    if (!envelope || !isFinite(rate) || rate <= 0) return null;

    const n = envelope.length;
    // Need at least four seconds of data for a stable beat period.
    if (n < rate * 4) return null;

    let mean = 0;
    for (let i = 0; i < n; i++) mean += envelope[i];
    mean /= n;

    const centered = new Float32Array(n);
    let totalEnergy = 0;
    for (let i = 0; i < n; i++) {
        const v = envelope[i] - mean;
        centered[i] = v;
        totalEnergy += v * v;
    }
    if (totalEnergy <= 1e-9) return null;

    const minLag = Math.max(1, Math.floor((60 / maxBpm) * rate));
    const maxLag = Math.min(n - 1, Math.ceil((60 / minBpm) * rate));
    if (maxLag <= minLag) return null;

    const correlations = new Float32Array(maxLag + 2);
    let bestLag = 0;
    let bestCorr = -Infinity;
    let bestScore = -Infinity;
    let scoreSum = 0;
    let scoreCount = 0;
    let bestSecond = 0;

    for (let lag = minLag; lag <= maxLag; lag++) {
        let sum = 0;
        const count = n - lag;
        for (let i = 0; i < count; i++) sum += centered[i] * centered[i + lag];

        // Normalize so a perfectly periodic envelope scores close to 1.
        const corr = sum / (totalEnergy * (count / n));
        correlations[lag] = corr;

        const bpmAtLag = (60 * rate) / lag;
        const octaves = Math.log2(bpmAtLag / PREFERRED_BPM);
        const prior = Math.exp(-0.5 * Math.pow(octaves / TEMPO_PRIOR_SIGMA_OCTAVES, 2));
        const score = corr * prior;

        scoreSum += score;
        scoreCount++;

        if (score > bestScore) {
            bestSecond = bestScore;
            bestScore = score;
            bestLag = lag;
            bestCorr = corr;
        } else if (score > bestSecond) {
            bestSecond = score;
        }
    }

    if (!bestLag || !isFinite(bestCorr)) return null;

    // Parabolic interpolation around the winning lag for sub-sample accuracy.
    const left = correlations[bestLag - 1] !== undefined ? correlations[bestLag - 1] : bestCorr;
    const right = correlations[bestLag + 1] !== undefined ? correlations[bestLag + 1] : bestCorr;
    const denom = left - 2 * bestCorr + right;
    const delta = Math.abs(denom) > 1e-9 ? (0.5 * (left - right)) / denom : 0;
    const refinedLag = bestLag + Math.max(-0.5, Math.min(0.5, delta));

    const value = (60 * rate) / refinedLag;
    if (!isFinite(value) || value < minBpm || value > maxBpm) return null;

    // Confidence combines absolute correlation and how clearly the winning
    // peak stands out from the others.
    const meanScore = scoreCount ? scoreSum / scoreCount : 0;
    const prominence = Math.max(0, bestScore - meanScore);
    const confidence = Math.max(0, Math.min(1, bestCorr * 0.75 + prominence * 0.25));

    return {
        value: Math.round(value * 10) / 10,
        confidence,
        correlation: bestCorr,
        seconds: n / rate,
    };
}

/**
 * Resample irregular {ts, value} samples into a fixed-rate envelope.
 * Buckets keep the maximum value so short transients are not lost.
 *
 * @param {Array<{ts: number, value: number}>} samples
 * @param {number} rate samples per second
 * @returns {Float32Array}
 */
export function resampleEnvelope(samples, rate) {
    if (!samples || samples.length < 2 || !isFinite(rate) || rate <= 0) {
        return new Float32Array(0);
    }

    const start = samples[0].ts;
    const end = samples[samples.length - 1].ts;
    const durationSec = (end - start) / 1000;
    if (durationSec <= 0) return new Float32Array(0);

    const length = Math.floor(durationSec * rate) + 1;
    const out = new Float32Array(length);

    for (let i = 0; i < samples.length; i++) {
        const sample = samples[i];
        const index = Math.round(((sample.ts - start) / 1000) * rate);
        if (index >= 0 && index < length && sample.value > out[index]) {
            out[index] = sample.value;
        }
    }

    return out;
}
