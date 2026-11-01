// audio-manager.js
import { estimateBpmFromEnvelope, resampleEnvelope } from './bpm-estimator.js';

const DEFAULT_BAND_DEFS = [
    { name: 'low', from: 20, to: 250 },
    { name: 'mid', from: 250, to: 4000 },
    { name: 'high', from: 4000, to: 20000 },
];

const TEST_BPM_MIN = 40;
const TEST_BPM_MAX = 200;
const DEFAULT_MIN_BPM = 60;
const DEFAULT_MAX_BPM = 200;

export class AudioManager {
    constructor() {
        this.audioCtx = null;
        this.analyser = null;
        this.source = null;
        this.stream = null;

        this.dataArray = null; // legacy byte spectrum
        this.floatSpectrum = null; // dB values from AnalyserNode
        this.magArray = null; // linear magnitudes
        this.prevDb = null; // previous dB values for spectral flux
        this.spectrumNorm = null; // 0..100 normalized spectrum

        this.sampleRate = 44100;
        this.fftSize = 2048;
        this.binCount = Math.floor(this.fftSize / 2);

        // Allocate fallback buffers so test mode works before the mic is enabled.
        this.dataArray = new Uint8Array(this.binCount);
        this.floatSpectrum = new Float32Array(this.binCount);
        this.magArray = new Float32Array(this.binCount);
        this.prevDb = new Float32Array(this.binCount);
        this.spectrumNorm = new Float32Array(this.binCount);
        this.prevDb.fill(-100);

        this.isLive = false;
        this.isTestMode = true;
        this.running = false;
        this.rafId = null;

        // Frequency bands (Hz) — override with setBands().
        this.bandDefs = DEFAULT_BAND_DEFS.map((band) => ({ ...band }));
        this.bands = {};
        this._computeBandBins();

        // Rich updates. onUpdate() keeps every subscriber and returns an unsubscribe fn.
        this._listeners = new Set();
        this.onUpdateCallback = null; // legacy single-callback slot

        // Spectral feature state.
        this.fluxHistory = []; // {ts, flux}
        this.maxFluxHistorySec = 30;

        // BPM settings & state.
        this.bpmWindowSec = 20;
        this.bpmUpdateIntervalSec = 3;
        this.bpmMinConfidence = 0.45;
        this.bpmSampleRateHz = 50;
        this.bpmSamples = []; // {value, confidence, ts}
        this.lastBpm = null;
        this.lastBpmTs = 0;
        this._lastBpmEstimateRun = 0;
        this._bpmRequestId = 0;
        this._bpmWorker = null;
        this.lastBpmCorrelation = 0;

        // Test-mode generator. A deterministic musical pattern is much more useful
        // than random noise: it exercises transients and can be BPM-detected.
        this.testBpm = 120;
        this._testNoise = new Float32Array(this.binCount);
        for (let i = 0; i < this._testNoise.length; i++) {
            this._testNoise[i] = Math.random();
        }
        this._testLow = 0;
        this._testMid = 0;
        this._testHigh = 0;

        // Kept for backwards compatibility with older callers.
        this.bassRange = [0, 5];
        this.midRange = [15, 90];
        this.highRange = [120, 500];
    }

    setTestMode(enabled) {
        this.isTestMode = !!enabled;
        this._resetAudioState();
        if (this.audioCtx) {
            if (enabled && this.audioCtx.state === 'running') this.audioCtx.suspend();
            else if (!enabled && this.audioCtx.state === 'suspended') this.audioCtx.resume();
        }
    }

    setTestBpm(bpm) {
        const value = Number(bpm);
        if (isFinite(value) && value >= TEST_BPM_MIN && value <= TEST_BPM_MAX) {
            this.testBpm = value;
        }
        return this.testBpm;
    }

    /**
     * Returns a list of available audio input devices.
     * Labels are empty until microphone permission has been granted.
     */
    async getAudioDevices() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter((device) => device.kind === 'audioinput');
    }

    /**
     * Starts or switches audio input.
     * @param {string|null} deviceId
     */
    async enableLiveInput(deviceId = null) {
        try {
            if (!this.audioCtx) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextClass) throw new Error('Web Audio API is not available');
                this.audioCtx = new AudioContextClass();
                this.analyser = this.audioCtx.createAnalyser();
                this.analyser.fftSize = this.fftSize;
                this.fftSize = this.analyser.fftSize;
                this.analyser.smoothingTimeConstant = 0.7;

                const bufferLength = this.analyser.frequencyBinCount;
                this.binCount = bufferLength;
                this.dataArray = new Uint8Array(bufferLength);
                this.floatSpectrum = new Float32Array(bufferLength);
                this.magArray = new Float32Array(bufferLength);
                this.spectrumNorm = new Float32Array(bufferLength);
                this.prevDb = new Float32Array(bufferLength);
                this.prevDb.fill(-100);
                this._testNoise = new Float32Array(bufferLength);
                for (let i = 0; i < this._testNoise.length; i++) {
                    this._testNoise[i] = Math.random();
                }
                this.sampleRate = this.audioCtx.sampleRate || 44100;

                this._computeBandBins();
            }

            if (this.stream) {
                this.stream.getTracks().forEach((track) => track.stop());
            }
            if (this.source) {
                this.source.disconnect();
                this.source = null;
            }

            const constraints = {
                audio: deviceId ? { deviceId: { exact: deviceId } } : true,
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);

            this.source = this.audioCtx.createMediaStreamSource(this.stream);
            this.source.connect(this.analyser);

            this.isLive = true;
            this.isTestMode = false;
            this._resetAudioState();

            if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();

            console.log(`[AudioManager] Connected to device: ${deviceId || 'Default'}`);
            return true;
        } catch (err) {
            console.error('[AudioManager] Access denied or error:', err);
            this.isLive = false;
            return false;
        }
    }

    getAverageVolume(array, start, end) {
        let values = 0;
        let count = 0;
        for (let i = start; i < end; i++) {
            if (array[i] !== undefined) {
                values += array[i];
                count++;
            }
        }
        return count === 0 ? 0 : values / count;
    }

    // --- Rich update API ---

    /**
     * Subscribe to per-frame audio data. Returns an unsubscribe function.
     * @param {(payload: object) => void} callback
     */
    onUpdate(callback) {
        if (typeof callback !== 'function') return () => {};
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    getSpectrum({ format = 'db' } = {}) {
        if (!this.floatSpectrum) return null;
        if (format === 'db') return this.floatSpectrum;
        if (format === 'mag') return this.magArray;
        if (format === 'norm') return this.spectrumNorm;
        if (format === 'byte') return this.dataArray;
        return this.floatSpectrum;
    }

    setBands(bandDefs) {
        if (!Array.isArray(bandDefs) || !bandDefs.length) return;
        this.bandDefs = bandDefs.map((band) => ({ ...band }));
        this._computeBandBins();
    }

    _computeBandBins() {
        if (!this.binCount || !this.fftSize) return;
        this.bands = {};
        for (const def of this.bandDefs) {
            const fromBin = this._hzToBin(def.from);
            const toBin = Math.min(this.binCount - 1, this._hzToBin(def.to));
            this.bands[def.name] = { fromBin, toBin };
        }
    }

    _hzToBin(hz) {
        const sr = this.sampleRate || 44100;
        const bin = Math.floor((hz * this.fftSize) / sr);
        return Math.max(0, Math.min(this.binCount - 1, bin));
    }

    _resetAudioState() {
        this.fluxHistory = [];
        this.bpmSamples = [];
        this.lastBpm = null;
        this.lastBpmTs = 0;
        this.lastBpmCorrelation = 0;
        this._lastBpmEstimateRun = 0;
        this._bpmRequestId++;
        if (this.prevDb) this.prevDb.fill(-100);
    }

    _fillSilence() {
        this.floatSpectrum.fill(-100);
    }

    _readRealSpectrum() {
        if (typeof this.analyser.getFloatFrequencyData === 'function') {
            this.analyser.getFloatFrequencyData(this.floatSpectrum);
            return;
        }

        // Very old browsers: approximate dB from byte data.
        this.analyser.getByteFrequencyData(this.dataArray);
        for (let i = 0; i < this.binCount; i++) {
            this.floatSpectrum[i] = -100 + (this.dataArray[i] / 255) * 100;
        }
    }

    /**
     * Simulates a simple four-on-the-floor pattern at this.testBpm.
     * Returns the intended 0..100 band values so they can be exposed exactly.
     */
    _generateTestSpectrum(nowSec) {
        const bpm = this.testBpm;
        const beats = (nowSec * bpm) / 60;
        const beatIndex = Math.floor(beats);
        const beatPhase = beats - beatIndex;
        const barBeat = ((beatIndex % 8) + 8) % 8;

        const kick = Math.exp(-beatPhase * 8);
        const snare = barBeat % 4 === 1 || barBeat % 4 === 3 ? Math.exp(-beatPhase * 12) : 0;
        const eighthPhase = (beats * 2) % 1;
        const hat = Math.exp(-eighthPhase * 24);

        const low = 28 + 62 * kick + 6 * Math.sin(nowSec * 0.8);
        const mid = 34 + 22 * (0.5 + 0.5 * Math.sin(nowSec * 0.9 + 1.3)) + 14 * snare;
        const high = 16 + 52 * hat + 20 * snare + 8 * (0.5 + 0.5 * Math.sin(nowSec * 2.3));

        this._testLow = Math.max(0, Math.min(100, low));
        this._testMid = Math.max(0, Math.min(100, mid));
        this._testHigh = Math.max(0, Math.min(100, high));

        // Build a plausible spectrum so the debug visualizer has something to draw.
        // Static noise floor + a dB boost per band keeps flux tied to real onsets.
        const spec = this.floatSpectrum;
        for (let i = 0; i < this.binCount; i++) {
            spec[i] = -98 + this._testNoise[i] * 6;
        }
        this._boostBand('low', this._testLow);
        this._boostBand('mid', this._testMid);
        this._boostBand('high', this._testHigh);

        return { low: this._testLow, mid: this._testMid, high: this._testHigh };
    }

    _boostBand(name, value) {
        const band = this.bands[name];
        if (!band) return;
        for (let i = band.fromBin; i <= band.toBin; i++) {
            this.floatSpectrum[i] = Math.min(0, this.floatSpectrum[i] + value);
        }
    }

    _computeFeatures() {
        const len = this.binCount || (this.floatSpectrum ? this.floatSpectrum.length : 0);
        if (!len || !this.floatSpectrum) return null;

        let rms = 0;
        let magSum = 0;
        let magWeightedFreq = 0;
        let flux = 0;
        const sr = this.sampleRate || 44100;

        for (let i = 0; i < len; i++) {
            const raw = this.floatSpectrum[i];
            const db = isFinite(raw) ? raw : -100;
            this.floatSpectrum[i] = db;

            // Positive dB difference is a cheap, robust onset strength.
            const diff = db - this.prevDb[i];
            if (diff > 0) flux += diff;
            this.prevDb[i] = db;

            const mag = Math.pow(10, db / 20);
            this.magArray[i] = mag;
            rms += mag * mag;

            const freq = (i * sr) / this.fftSize;
            magWeightedFreq += mag * freq;
            magSum += mag;

            this.spectrumNorm[i] = Math.max(0, Math.min(100, (db + 100)));
        }

        rms = Math.sqrt(rms / len);
        const centroidHz = magSum > 0 ? magWeightedFreq / magSum : 0;
        flux /= len;

        const ts = Date.now();
        this.fluxHistory.push({ ts, flux });
        const cutoff = ts - this.maxFluxHistorySec * 1000;
        while (this.fluxHistory.length && this.fluxHistory[0].ts < cutoff) {
            this.fluxHistory.shift();
        }

        return { rms, centroidHz, spectralFlux: flux };
    }

    _computeBands() {
        const bandsOut = {};
        for (const name of Object.keys(this.bands)) {
            const band = this.bands[name];
            let sumDb = 0;
            let count = 0;
            for (let i = band.fromBin; i <= band.toBin; i++) {
                const db = this.floatSpectrum[i];
                if (db !== undefined && isFinite(db)) {
                    sumDb += db;
                    count++;
                }
            }
            const avgDb = count ? sumDb / count : -100;
            bandsOut[name] = Math.max(0, Math.min(100, Math.round(avgDb + 100)));
        }
        return bandsOut;
    }

    addBpmSample(value, confidence) {
        const ts = Date.now();
        if (!isFinite(value) || value <= 0 || confidence < this.bpmMinConfidence) return;

        // Fold obvious octave errors (60 <-> 120 <-> 240).
        if (this.lastBpm) {
            while (value > this.lastBpm * 1.7) value /= 2;
            while (value < this.lastBpm / 1.7) value *= 2;
        }

        this.bpmSamples.push({ value, confidence, ts });
        const cutoff = ts - this.bpmWindowSec * 1000;
        while (this.bpmSamples.length && this.bpmSamples[0].ts < cutoff) {
            this.bpmSamples.shift();
        }

        this.lastBpm = this.getRollingBpm();
        this.lastBpmTs = ts;
    }

    getRollingBpm() {
        if (!this.bpmSamples.length) return null;
        const now = Date.now();
        let weighted = 0;
        let weightSum = 0;
        for (const sample of this.bpmSamples) {
            const ageSec = Math.max(0, (now - sample.ts) / 1000);
            const recency = Math.max(0.25, 1 - ageSec / this.bpmWindowSec);
            const weight = sample.confidence * recency;
            weighted += sample.value * weight;
            weightSum += weight;
        }
        return weightSum ? weighted / weightSum : null;
    }

    getBpmInfo() {
        const rolling = this.getRollingBpm();
        const last = this.bpmSamples.length ? this.bpmSamples[this.bpmSamples.length - 1] : null;
        const recent = this.bpmSamples.slice(-5).map((sample) => sample.value);
        let stable = false;
        if (recent.length >= 3) {
            const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
            const spread = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);
            stable = spread <= 3;
        }

        return {
            value: rolling ? Math.round(rolling * 10) / 10 : null,
            rolling: rolling ? Math.round(rolling * 10) / 10 : null,
            confidence: last ? last.confidence : 0,
            correlation: this.lastBpmCorrelation,
            ageMs: this.lastBpmTs ? Date.now() - this.lastBpmTs : Infinity,
            samples: this.bpmSamples.length,
            stable,
        };
    }

    _buildBpmEnvelope() {
        if (this.fluxHistory.length < 2) return null;
        const cutoff = Date.now() - this.bpmWindowSec * 1000;
        let first = 0;
        while (first < this.fluxHistory.length && this.fluxHistory[first].ts < cutoff) first++;
        const samples = this.fluxHistory
            .slice(first)
            .map((entry) => ({ ts: entry.ts, value: entry.flux }));
        const envelope = resampleEnvelope(samples, this.bpmSampleRateHz);
        return envelope.length ? envelope : null;
    }

    _handleBpmResult(msg) {
        if (!msg || msg.type !== 'bpm') return;
        if (msg.requestId && msg.requestId !== this._bpmRequestId) return;
        this.lastBpmCorrelation = msg.correlation || 0;
        if (msg.value && msg.confidence >= this.bpmMinConfidence) {
            this.addBpmSample(msg.value, msg.confidence);
        }
    }

    _ensureBpmWorker() {
        if (this._bpmWorker) return this._bpmWorker;
        if (typeof Worker === 'undefined') return null;
        try {
            this._bpmWorker = new Worker(new URL('./bpm-worker.js', import.meta.url), { type: 'module' });
            this._bpmWorker.onmessage = (event) => this._handleBpmResult(event.data);
            this._bpmWorker.onerror = (event) => {
                console.warn('[AudioManager] BPM worker failed, using main-thread fallback', event.message || event);
                this._bpmWorker.terminate();
                this._bpmWorker = null;
            };
            return this._bpmWorker;
        } catch (err) {
            console.warn('[AudioManager] Could not create BPM worker, using main-thread fallback', err);
            this._bpmWorker = null;
            return null;
        }
    }

    _estimateBpmIfNeeded() {
        if (!this.isTestMode && !this.isLive) return;

        const now = Date.now();
        if (now - this._lastBpmEstimateRun < this.bpmUpdateIntervalSec * 1000) return;

        const envelope = this._buildBpmEnvelope();
        if (!envelope || envelope.length < this.bpmSampleRateHz * 4) return;

        this._lastBpmEstimateRun = now;
        this._bpmRequestId++;
        const requestId = this._bpmRequestId;

        const worker = this._ensureBpmWorker();
        if (worker) {
            try {
                worker.postMessage({
                    type: 'estimate',
                    requestId,
                    envelope,
                    rate: this.bpmSampleRateHz,
                    minBpm: DEFAULT_MIN_BPM,
                    maxBpm: DEFAULT_MAX_BPM,
                });
                return;
            } catch (err) {
                console.warn('[AudioManager] BPM worker postMessage failed', err);
            }
        }

        const result = estimateBpmFromEnvelope(envelope, this.bpmSampleRateHz, {
            minBpm: DEFAULT_MIN_BPM,
            maxBpm: DEFAULT_MAX_BPM,
        });
        if (result) {
            this.lastBpmCorrelation = result.correlation;
            this.addBpmSample(result.value, result.confidence);
        }
    }

    _emitPayload(payload) {
        for (const callback of this._listeners) {
            try {
                callback(payload);
            } catch (err) {
                console.error('[AudioManager] onUpdate callback error', err);
            }
        }
        if (this.onUpdateCallback && !this._listeners.has(this.onUpdateCallback)) {
            try {
                this.onUpdateCallback(payload);
            } catch (err) {
                console.error('[AudioManager] onUpdateCallback error', err);
            }
        }
    }

    startLoop() {
        if (this.running) return;
        this.running = true;

        const loop = () => {
            if (!this.running) return;
            this.rafId = requestAnimationFrame(loop);

            const nowSec = performance.now() / 1000;
            let testBands = null;

            if (this.isTestMode) {
                testBands = this._generateTestSpectrum(nowSec);
            } else if (this.isLive && this.analyser) {
                this._readRealSpectrum();
            } else {
                this._fillSilence();
            }

            const features = this._computeFeatures() || { rms: 0, centroidHz: 0, spectralFlux: 0 };
            const bandsOut = this._computeBands();

            // Exact values in test mode, so animations receive the intended pattern.
            if (testBands) {
                for (const name of Object.keys(bandsOut)) {
                    if (testBands[name] !== undefined) bandsOut[name] = Math.round(testBands[name]);
                }
            }

            this._estimateBpmIfNeeded();

            const payload = {
                timestamp: Date.now(),
                sampleRate: this.sampleRate,
                fftSize: this.fftSize,
                spectrumDb: this.floatSpectrum,
                spectrumNorm: this.spectrumNorm,
                bands: bandsOut,
                features,
                bpm: this.getBpmInfo(),
            };

            this._emitPayload(payload);

            const low = bandsOut.low || 0;
            const mid = bandsOut.mid || 0;
            const high = bandsOut.high || 0;

            if (typeof window !== 'undefined' && window.currentAnimation && typeof window.currentAnimation.updateFrequencies === 'function') {
                window.currentAnimation.updateFrequencies(low, mid, high);
            }
        };

        this.rafId = requestAnimationFrame(loop);
    }

    stopLoop() {
        this.running = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    dispose() {
        this.stopLoop();

        try {
            if (this._bpmWorker) {
                this._bpmWorker.terminate();
                this._bpmWorker = null;
            }
        } catch (err) {
            console.warn('[AudioManager] Error terminating BPM worker', err);
        }

        try {
            if (this.stream && this.stream.getTracks) {
                this.stream.getTracks().forEach((track) => track.stop());
                this.stream = null;
            }
        } catch (err) {
            console.warn('[AudioManager] Error stopping stream', err);
        }

        try {
            if (this.source && typeof this.source.disconnect === 'function') {
                try {
                    this.source.disconnect();
                } catch (err) {
                    /* ignore */
                }
                this.source = null;
            }
            if (this.analyser && typeof this.analyser.disconnect === 'function') {
                try {
                    this.analyser.disconnect();
                } catch (err) {
                    /* ignore */
                }
                this.analyser = null;
            }
        } catch (err) {
            console.warn('[AudioManager] Error disconnecting nodes', err);
        }

        try {
            if (this.audioCtx && typeof this.audioCtx.close === 'function') {
                this.audioCtx.close();
                this.audioCtx = null;
            }
        } catch (err) {
            console.warn('[AudioManager] Error closing audio context', err);
        }

        this._listeners.clear();
        this.onUpdateCallback = null;
        this.floatSpectrum = null;
        this.spectrumNorm = null;
        this.magArray = null;
        this.prevDb = null;
        this.dataArray = null;

        this.fluxHistory = [];
        this.bpmSamples = [];
        this.lastBpm = null;
        this.lastBpmTs = 0;
        this.lastBpmCorrelation = 0;

        this.isLive = false;
        this.isTestMode = true;

        console.log('[AudioManager] disposed');
    }
}
