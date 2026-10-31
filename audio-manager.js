// audio-manager.js
export class AudioManager {
    constructor() {
        this.audioCtx = null;
        this.analyser = null;
        this.source = null;
        this.stream = null; // Keep track of stream to stop it later
        this.dataArray = null; // Uint8 for legacy

        // Float spectrum and helper arrays
        this.floatSpectrum = null; // Float32 dB values
        this.magArray = null; // linear magnitudes
        this.prevMag = null; // previous magnitudes for spectral flux
        this.spectrumNorm = null; // 0-100 normalized

        this.sampleRate = 44100;
        this.fftSize = 2048;
        this.binCount = Math.floor(this.fftSize / 2);

        // allocate fallback arrays so test-mode works before mic is enabled
        this.dataArray = new Uint8Array(this.binCount);
        this.floatSpectrum = new Float32Array(this.binCount);
        this.magArray = new Float32Array(this.binCount);
        this.prevMag = new Float32Array(this.binCount);
        this.spectrumNorm = new Float32Array(this.binCount);

        this.isLive = false;
        this.isTestMode = true;
        this.rafId = null;

        // Default frequency bands (Hz) — can be overridden with setBands()
        this.bandDefs = [
            { name: 'low', from: 20, to: 250 },
            { name: 'mid', from: 250, to: 4000 },
            { name: 'high', from: 4000, to: 20000 },
        ];
        this.bands = {}; // computed bin ranges populated by _computeBandBins()

        // callback for rich updates
        this.onUpdateCallback = null;

        // spectral feature state
        this.fluxHistory = []; // {ts, flux}
        this.maxFluxHistorySec = 60;

        // BPM settings & state
        this.bpmWindowSec = 20;
        this.bpmUpdateIntervalSec = 3;
        this.bpmMinConfidence = 0.4;
        this.bpmSampleRateHz = 20; // decimated rate for BPM estimator

        this.bpmSamples = []; // {value, confidence, ts}
        this.lastBpm = null;
        this.lastBpmTs = 0;
        this._lastBpmEstimateRun = 0;

        // keep old index-based ranges for backwards compatibility
        this.bassRange = [0, 5];
        this.midRange = [15, 90];
        this.highRange = [120, 500];
    }

    setTestMode(enabled) {
        this.isTestMode = enabled;
        // Suspend context when testing to save CPU, resume when live
        if (this.audioCtx) {
            if (enabled && this.audioCtx.state === 'running') this.audioCtx.suspend();
            else if (!enabled && this.audioCtx.state === 'suspended') this.audioCtx.resume();
        }
    }

    /**
     * Returns a list of available audio input devices.
     * Note: Labels are empty strings until permission is granted.
     */
    async getAudioDevices() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(d => d.kind === 'audioinput');
    }

    /**
     * Starts audio input.
     * @param {string|null} deviceId - Optional specific device ID
     */
    async enableLiveInput(deviceId = null) {
        try {
            // 1. Setup Audio Context if missing
            if (!this.audioCtx) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.audioCtx = new AudioContext();
                this.analyser = this.audioCtx.createAnalyser();
                this.analyser.fftSize = this.fftSize;
                this.fftSize = this.analyser.fftSize;
                this.analyser.smoothingTimeConstant = 0.8;

                const bufferLength = this.analyser.frequencyBinCount;
                this.binCount = bufferLength;
                this.dataArray = new Uint8Array(bufferLength); // legacy byte array
                this.floatSpectrum = new Float32Array(bufferLength);
                this.magArray = new Float32Array(bufferLength);
                this.spectrumNorm = new Float32Array(bufferLength);
                this.prevMag = new Float32Array(bufferLength);
                this.sampleRate = this.audioCtx.sampleRate || 44100;

                // populate band bin ranges
                this._computeBandBins();
            }

            // 2. Stop existing stream if switching devices
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }
            if (this.source) {
                this.source.disconnect();
            }

            // 3. Constraints
            const constraints = {
                audio: deviceId ? { deviceId: { exact: deviceId } } : true
            };

            // 4. Get Stream
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);

            // 5. Connect Source -> Analyser
            this.source = this.audioCtx.createMediaStreamSource(this.stream);
            this.source.connect(this.analyser);

            this.isLive = true;
            this.isTestMode = false;

            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

            console.log(`[AudioManager] Connected to device: ${deviceId || 'Default'}`);
            return true;

        } catch (err) {
            console.error('[AudioManager] Access denied or error:', err);
            alert('Could not access microphone. Check permissions.');
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

    // --- New API helpers ---
    onUpdate(callback) {
        this.onUpdateCallback = callback;
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
        this.bandDefs = bandDefs;
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

    _computeFeatures() {
        // convert dB to linear magnitudes
        const len = this.binCount || (this.floatSpectrum ? this.floatSpectrum.length : 0);
        if (!len) return null;

        let rms = 0;
        let magSum = 0;
        let magWeightedFreq = 0;
        const sr = this.sampleRate || 44100;

        for (let i = 0; i < len; i++) {
            const db = this.floatSpectrum[i];
            // clamp -100..0
            const dbClamped = isFinite(db) ? db : -100;
            const mag = Math.pow(10, dbClamped / 20); // linear magnitude
            this.magArray[i] = mag;
            rms += mag * mag;

            const freq = (i * sr) / this.fftSize;
            magWeightedFreq += mag * freq;
            magSum += mag;
        }

        rms = Math.sqrt(rms / len);
        const centroidHz = magSum > 0 ? magWeightedFreq / magSum : 0;

        // spectral flux (positive difference between magnitudes)
        let flux = 0;
        if (this.prevMag) {
            for (let i = 0; i < len; i++) {
                const diff = this.magArray[i] - (this.prevMag[i] || 0);
                if (diff > 0) flux += diff;
            }
            // normalize
            flux = flux / len;
        }

        // copy magArray into prevMag
        this.prevMag.set(this.magArray);

        // normalized spectrum 0..100 based on dB range (-100..0)
        for (let i = 0; i < len; i++) {
            const db = this.floatSpectrum[i];
            const norm = Math.max(0, Math.min(1, (db + 100) / 100));
            this.spectrumNorm[i] = norm * 100;
        }

        const ts = Date.now();
        this.fluxHistory.push({ ts, flux });
        // purge old
        const cutoff = ts - this.maxFluxHistorySec * 1000;
        while (this.fluxHistory.length && this.fluxHistory[0].ts < cutoff) this.fluxHistory.shift();

        return { rms, centroidHz, spectralFlux: flux };
    }

    addBpmSample(value, confidence) {
        const ts = Date.now();
        if (!isFinite(value) || value <= 0 || confidence < this.bpmMinConfidence) return;
        this.bpmSamples.push({ value, confidence, ts });
        const cutoff = ts - this.bpmWindowSec * 1000;
        while (this.bpmSamples.length && this.bpmSamples[0].ts < cutoff) this.bpmSamples.shift();
        this.lastBpm = this.getRollingBpm();
        this.lastBpmTs = ts;
    }

    getRollingBpm() {
        if (!this.bpmSamples.length) return null;
        let weighted = 0, wsum = 0;
        for (const s of this.bpmSamples) {
            // weight by confidence (could add recency later)
            weighted += s.value * s.confidence;
            wsum += s.confidence;
        }
        return wsum ? weighted / wsum : null;
    }

    // Estimate BPM periodically (offload to worker when available)
    _estimateBpmIfNeeded() {
        const now = Date.now();
        if (now - this._lastBpmEstimateRun < this.bpmUpdateIntervalSec * 1000) return;
        this._lastBpmEstimateRun = now;

        // Copy flux history and send to worker
        const samples = this.fluxHistory.slice();

        if (this._bpmWorker) {
            try {
                this._bpmWorker.postMessage({ type: 'estimate', samples, targetRate: this.bpmSampleRateHz, minBpm: 40, maxBpm: 200 });
                return;
            } catch (e) {
                console.warn('[AudioManager] bpm worker postMessage failed, falling back', e);
            }
        }

        // Create worker lazily if available
        if (typeof Worker !== 'undefined') {
            try {
                this._bpmWorker = new Worker('./bpm-worker.js', { type: 'module' });
                this._bpmWorker.onmessage = (ev) => {
                    const msg = ev.data;
                    if (!msg || msg.type !== 'bpm') return;
                    if (msg.value && msg.confidence >= this.bpmMinConfidence) {
                        this.addBpmSample(msg.value, msg.confidence);
                    }
                };
                // send the samples for estimation
                this._bpmWorker.postMessage({ type: 'estimate', samples, targetRate: this.bpmSampleRateHz, minBpm: 40, maxBpm: 200 });
                return;
            } catch (e) {
                console.warn('[AudioManager] Could not create bpm worker, using local estimator', e);
            }
        }

        // Fallback: local synchronous estimator
        const estimate = this._estimateBpmFromFlux();
        if (estimate && estimate.confidence >= this.bpmMinConfidence) {
            this.addBpmSample(estimate.value, estimate.confidence);
        }
    }

    _estimateBpmFromFlux() {
        // collect last bpmWindowSec of flux at decimated rate
        const now = Date.now();
        const cutoff = now - this.bpmWindowSec * 1000;
        const samples = this.fluxHistory.filter(f => f.ts >= cutoff);
        if (samples.length < 4) return null;

        // decimate to target rate
        const targetRate = this.bpmSampleRateHz;
        const dt = 1000 / targetRate;
        const start = samples[0].ts;
        const dec = [];
        for (let t = start; t <= now; t += dt) {
            // find sample nearest to t
            let closest = null;
            // simple linear scan (samples not huge)
            for (let i = 0; i < samples.length; i++) {
                if (!closest || Math.abs(samples[i].ts - t) < Math.abs(closest.ts - t)) closest = samples[i];
            }
            dec.push(closest ? closest.flux : 0);
        }

        if (dec.length < 4) return null;

        // remove mean
        const mean = dec.reduce((a, b) => a + b, 0) / dec.length;
        for (let i = 0; i < dec.length; i++) dec[i] -= mean;

        // autocorrelation for lags that map to BPM 40..200
        const minBpm = 40, maxBpm = 200;
        const minLag = Math.floor((60 / maxBpm) * targetRate);
        const maxLag = Math.ceil((60 / minBpm) * targetRate);
        let bestLag = -1, bestVal = -Infinity;
        for (let lag = minLag; lag <= maxLag && lag < dec.length; lag++) {
            let val = 0;
            for (let i = 0; i < dec.length - lag; i++) val += dec[i] * dec[i + lag];
            if (val > bestVal) { bestVal = val; bestLag = lag; }
        }
        if (bestLag <= 0) return null;

        const bpm = 60 / (bestLag / targetRate);
        // confidence: normalized peak relative to average energy
        const energy = dec.reduce((a, b) => a + Math.abs(b), 0) / dec.length;
        const confidence = energy > 0 ? Math.min(1, bestVal / (energy * energy * (dec.length - bestLag))) : 0;
        return { value: Math.round(bpm * 10) / 10, confidence };
    }

    startLoop() {
        const loop = () => {
            this.rafId = requestAnimationFrame(loop);

            // Acquire spectrum
            if (this.isTestMode || !this.isLive) {
                // Synthetic, stronger test-mode spectrum so bands are meaningful
                // Random strengths for bands 0..100
                const rLow = Math.random() * 100;
                const rMid = Math.random() * 100;
                const rHigh = Math.random() * 100;

                // baseline dB noise
                for (let i = 0; i < this.binCount; i++) {
                    this.floatSpectrum[i] = -90 + (Math.random() * 20 - 10); // around -90..-70 dB
                }

                // apply band boosts (map 0..100 -> 0..50 dB boost)
                const applyBoost = (name, val) => {
                    const band = this.bands[name];
                    if (!band) return;
                    const boost = (val / 100) * 50; // up to +50 dB (clamped later)
                    for (let i = band.fromBin; i <= band.toBin; i++) {
                        this.floatSpectrum[i] = Math.min(0, this.floatSpectrum[i] + boost);
                    }
                };
                applyBoost('low', rLow);
                applyBoost('mid', rMid);
                applyBoost('high', rHigh);

                // keep simple numeric fallback values for legacy API
                var _testLow = Math.floor(rLow);
                var _testMid = Math.floor(rMid);
                var _testHigh = Math.floor(rHigh);

            } else {
                if (typeof this.analyser.getFloatFrequencyData === 'function') {
                    this.analyser.getFloatFrequencyData(this.floatSpectrum);
                } else {
                    // Fallback to byte data and convert to an approximate dB
                    this.analyser.getByteFrequencyData(this.dataArray);
                    for (let i = 0; i < this.binCount; i++) {
                        // byte 0..255 -> dB roughly -100..0
                        this.floatSpectrum[i] = (this.dataArray[i] / 255) * -100 + (this.dataArray[i] ? 0 : -100);
                    }
                }
            }

            // Compute features (fills magArray and spectrumNorm, pushes fluxHistory)
            const features = this._computeFeatures() || { rms: 0, centroidHz: 0, spectralFlux: 0 };

            // Compute band averages (0..100) using floatSpectrum dB averages (more perceptually stable)
            const bandsOut = {};
            for (const name of Object.keys(this.bands)) {
                const b = this.bands[name];
                let sumDb = 0, count = 0;
                for (let i = b.fromBin; i <= b.toBin; i++) {
                    const db = this.floatSpectrum[i];
                    if (db !== undefined && isFinite(db)) { sumDb += db; count++; }
                }
                const avgDb = count ? (sumDb / count) : -100; // default to very quiet
                // map dB (-100..0) -> 0..100
                const val = Math.min(100, Math.max(0, Math.round(avgDb + 100)));
                bandsOut[name] = val;
            }

            // If we're in test mode, prefer the generated random band values so legacy animations are lively
            if (this.isTestMode || !this.isLive) {
                if (typeof _testLow !== 'undefined') bandsOut.low = Math.floor(_testLow);
                if (typeof _testMid !== 'undefined') bandsOut.mid = Math.floor(_testMid);
                if (typeof _testHigh !== 'undefined') bandsOut.high = Math.floor(_testHigh);
            }

            // Backwards compatibility: compute low/mid/high from bandDefs if present
            const low = bandsOut.low || 0;
            const mid = bandsOut.mid || 0;
            const high = bandsOut.high || 0;

            // Estimate BPM periodically
            this._estimateBpmIfNeeded();

            const rolling = this.getRollingBpm();
            const lastSample = this.bpmSamples.length ? this.bpmSamples[this.bpmSamples.length - 1] : null;
            const bpmOut = {
                value: lastSample ? lastSample.value : null,
                rolling: rolling,
                confidence: lastSample ? lastSample.confidence : 0,
                ageMs: this.lastBpmTs ? (Date.now() - this.lastBpmTs) : Infinity,
                stable: !!rolling
            };

            const payload = {
                timestamp: Date.now(),
                sampleRate: this.sampleRate,
                fftSize: this.fftSize,
                spectrumDb: this.floatSpectrum,
                spectrumNorm: this.spectrumNorm,
                bands: bandsOut,
                features,
                bpm: bpmOut
            };

            // Callback for consumers wanting a richer payload
            if (this.onUpdateCallback && typeof this.onUpdateCallback === 'function') {
                try { this.onUpdateCallback(payload); } catch (e) { console.error('[AudioManager] onUpdate callback error', e); }
            }

            // Preserve legacy simple API
            if (window.currentAnimation && typeof window.currentAnimation.updateFrequencies === 'function') {
                window.currentAnimation.updateFrequencies(Math.floor(low), Math.floor(mid), Math.floor(high));
            }
        };
        loop();
    }

    dispose() {
        // Stop RAF loop
        try {
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
                this.rafId = null;
            }
        } catch (e) { /* ignore */ }

        // Terminate BPM worker
        try {
            if (this._bpmWorker) {
                this._bpmWorker.terminate();
                this._bpmWorker = null;
            }
        } catch (e) { console.warn('[AudioManager] Error terminating bpm worker', e); }

        // Stop live media stream
        try {
            if (this.stream && this.stream.getTracks) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
        } catch (e) { console.warn('[AudioManager] Error stopping stream', e); }

        // Disconnect audio nodes
        try {
            if (this.source && typeof this.source.disconnect === 'function') {
                try { this.source.disconnect(); } catch (e) { /* ignore */ }
                this.source = null;
            }
            if (this.analyser && typeof this.analyser.disconnect === 'function') {
                try { this.analyser.disconnect(); } catch (e) { /* ignore */ }
                this.analyser = null;
            }
        } catch (e) { console.warn('[AudioManager] Error disconnecting nodes', e); }

        // Close audio context (optional) — attempt it
        try {
            if (this.audioCtx && typeof this.audioCtx.close === 'function') {
                this.audioCtx.close();
                this.audioCtx = null;
            }
        } catch (e) { console.warn('[AudioManager] Error closing audio context', e); }

        // Clear buffers and callbacks
        this.onUpdateCallback = null;
        this.floatSpectrum = null;
        this.spectrumNorm = null;
        this.magArray = null;
        this.prevMag = null;
        this.dataArray = null;

        // Clear histories
        this.fluxHistory = [];
        this.bpmSamples = [];
        this.lastBpm = null;
        this.lastBpmTs = 0;

        this.isLive = false;
        this.isTestMode = true;

        console.log('[AudioManager] disposed');
    }
}