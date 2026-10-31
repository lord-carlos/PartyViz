// bpm-worker.js
// Lightweight BPM estimator that receives spectral flux history and returns BPM estimates.

self.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || !msg.type) return;

    if (msg.type === 'estimate') {
        const samples = msg.samples || [];
        const targetRate = msg.targetRate || 20;
        const minBpm = msg.minBpm || 40;
        const maxBpm = msg.maxBpm || 200;
        const res = estimateBpmFromFlux(samples, targetRate, minBpm, maxBpm);
        if (res) {
            self.postMessage({ type: 'bpm', value: res.value, confidence: res.confidence, ts: Date.now() });
        } else {
            self.postMessage({ type: 'bpm', value: null, confidence: 0, ts: Date.now() });
        }
    }
};

function estimateBpmFromFlux(samples, targetRate, minBpm, maxBpm) {
    if (!samples || samples.length < 4) return null;
    // Sort samples by timestamp
    samples = samples.slice().sort((a, b) => a.ts - b.ts);
    const now = samples[samples.length - 1].ts;
    const start = samples[0].ts;

    // Build decimated sequence at targetRate (samples per second)
    const dt = 1000 / targetRate;
    const dec = [];
    for (let t = start; t <= now; t += dt) {
        // find nearest sample
        let closest = null;
        for (let i = 0; i < samples.length; i++) {
            if (!closest || Math.abs(samples[i].ts - t) < Math.abs(closest.ts - t)) closest = samples[i];
        }
        dec.push(closest ? closest.flux : 0);
    }

    if (dec.length < 4) return null;

    // remove mean
    const mean = dec.reduce((a, b) => a + b, 0) / dec.length;
    for (let i = 0; i < dec.length; i++) dec[i] -= mean;

    // autocorrelation search for best lag
    const minLag = Math.floor((60 / maxBpm) * targetRate);
    const maxLag = Math.ceil((60 / minBpm) * targetRate);
    let bestLag = -1; let bestVal = -Infinity;
    for (let lag = minLag; lag <= maxLag && lag < dec.length; lag++) {
        let val = 0;
        for (let i = 0; i < dec.length - lag; i++) val += dec[i] * dec[i + lag];
        if (val > bestVal) { bestVal = val; bestLag = lag; }
    }
    if (bestLag <= 0) return null;

    const bpm = 60 / (bestLag / targetRate);
    const energy = dec.reduce((a, b) => a + Math.abs(b), 0) / dec.length;
    const confidence = energy > 0 ? Math.min(1, bestVal / (energy * energy * (dec.length - bestLag))) : 0;
    return { value: Math.round(bpm * 10) / 10, confidence };
}
