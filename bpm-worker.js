// bpm-worker.js
// Runs the shared tempo estimator off the main thread.
import { estimateBpmFromEnvelope } from './bpm-estimator.js';

self.onmessage = (event) => {
    const msg = event.data;
    if (!msg || msg.type !== 'estimate') return;

    const envelope = msg.envelope;
    const rate = msg.rate || 50;
    const result = estimateBpmFromEnvelope(envelope, rate, {
        minBpm: msg.minBpm || 60,
        maxBpm: msg.maxBpm || 200,
    });

    self.postMessage({
        type: 'bpm',
        requestId: msg.requestId || 0,
        value: result ? result.value : null,
        confidence: result ? result.confidence : 0,
        correlation: result ? result.correlation : 0,
        seconds: result ? result.seconds : 0,
        ts: Date.now(),
    });
};
