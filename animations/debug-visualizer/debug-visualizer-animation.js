export class DebugVisualizerAnimation {
    constructor(canvas, config) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.config = config || {};
        this.frameId = null;

        this.latest = null; // latest rich payload from AudioManager
        this._unsubscribe = null;
        this._lastTextUpdate = 0;

        // Fallback band values for the legacy updateFrequencies contract.
        this.LOW = 0;
        this.MID = 0;
        this.HIGH = 0;

        // DOM hooks
        const slug = this.config.slug || 'debug-visualizer';
        this.metaEl = document.getElementById(`meta-${slug}`) || document.getElementById('meta-debug-visualizer');
        this.labelEl = document.getElementById(`label-${slug}`) || document.getElementById('label-debug-visualizer');

        // Layout
        this.width = 0;
        this.height = 0;
        this.dpr = 1;
        this.initialized = false;

        // Colors (read once; CSS variables are not cheap to query every frame)
        let style;
        try {
            style = getComputedStyle(this.canvas);
        } catch (err) {
            style = null;
        }
        this.fg = (style && style.getPropertyValue('--color-primary').trim()) || '#33ff66';
        this.bg = (style && style.getPropertyValue('--color-bg').trim()) || '#000';

        this._resizeHandler = () => this.resize();
        this.resize();

        console.log('[DebugVisualizer] ready');
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.dpr = dpr;
        const rectW = Math.floor(rect.width);
        const rectH = Math.floor(rect.height);
        if (rectW <= 2 || rectH <= 2) return;
        this.width = rectW;
        this.height = rectH;
        this.canvas.width = Math.floor(this.width * dpr);
        this.canvas.height = Math.floor(this.height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.initialized = true;
    }

    updateFrequencies(low, mid, high) {
        this.LOW = low;
        this.MID = mid;
        this.HIGH = high;
    }

    drawBars(spectrumNorm) {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const padding = 10;
        const areaW = w - padding * 2;
        const areaH = h - padding * 2;
        const barCount = Math.min(128, spectrumNorm.length);
        const step = Math.floor(spectrumNorm.length / barCount) || 1;
        const barW = Math.max(1, (areaW - (barCount - 1) * 2) / barCount);

        // One shadow setup for the whole batch instead of 128 per-bar changes.
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.fg;

        for (let i = 0; i < barCount; i++) {
            const value = spectrumNorm[i * step] || 0; // 0..100
            const x = padding + i * (barW + 2);
            const barH = (value / 100) * areaH;
            const y = padding + (areaH - barH);
            const hue = 140 - (value / 100) * 120; // green -> red
            ctx.fillStyle = `hsl(${hue}deg 100% 50% / 0.95)`;
            ctx.fillRect(x, y, barW, barH);
        }
        ctx.restore();
    }

    drawText(payload) {
        if (!this.labelEl) return;
        const lines = [];
        if (!payload) {
            lines.push(`LOW: ${this.LOW}   MID: ${this.MID}   HIGH: ${this.HIGH}`);
            this.labelEl.textContent = lines.join('\n');
            return;
        }
        lines.push(`ts: ${payload.timestamp}`);
        lines.push(`sr: ${payload.sampleRate}  fft: ${payload.fftSize}`);
        lines.push(`bands: ${Object.entries(payload.bands || {}).map(([k, v]) => `${k}:${v}`).join('  ')}`);
        lines.push(`features: rms=${payload.features.rms.toFixed(3)}  centroid=${Math.round(payload.features.centroidHz)}Hz  flux=${payload.features.spectralFlux.toFixed(4)}`);
        const bpm = payload.bpm || {};
        lines.push(`bpm: ${bpm.value ?? '-'}  rolling:${bpm.rolling ?? '-'}  conf:${(bpm.confidence || 0).toFixed(2)}  age:${bpm.ageMs === Infinity ? '-' : Math.round(bpm.ageMs)}ms  stable:${bpm.stable ? 'yes' : 'no'}`);
        this.labelEl.textContent = lines.join('\n');
    }

    drawFrame = (now) => {
        if (!this.initialized) {
            this.resize();
            this.frameId = requestAnimationFrame(this.drawFrame);
            return;
        }
        const ctx = this.ctx;
        ctx.fillStyle = this.bg;
        ctx.fillRect(0, 0, this.width, this.height);

        const payload = this.latest;
        if (payload && payload.spectrumNorm) {
            this.drawBars(payload.spectrumNorm);
        } else {
            const cx = this.width / 2;
            const cy = this.height / 2;
            const spacing = Math.min(120, this.width / 6);
            const vals = [this.LOW, this.MID, this.HIGH];
            for (let i = 0; i < 3; i++) {
                const value = vals[i] || 0;
                const size = 20 + (value / 100) * Math.min(this.width, this.height) * 0.35;
                ctx.beginPath();
                ctx.fillStyle = `rgba(51,255,102,${0.06 + (value / 100) * 0.8})`;
                ctx.arc(cx + (i - 1) * spacing, cy, size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Text is expensive to lay out; 5 Hz is plenty for a debug readout.
        if (now - this._lastTextUpdate > 200) {
            this._lastTextUpdate = now;
            this.drawText(payload);

            ctx.save();
            ctx.font = '12px "Courier New", monospace';
            ctx.fillStyle = this.fg;
            ctx.textAlign = 'left';
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.fg;
            if (payload) {
                const text = `BPM: ${payload.bpm.value ?? '-'}  Rolling: ${payload.bpm.rolling ?? '-'}  Centroid: ${Math.round(payload.features.centroidHz)}Hz`;
                ctx.fillText(text, 14, 18);
            } else {
                ctx.fillText('No audio payload', 14, 18);
            }
            ctx.restore();
        }

        this.frameId = requestAnimationFrame(this.drawFrame);
    }

    start() {
        this.resize();
        window.addEventListener('resize', this._resizeHandler);

        if (window.audioManager && typeof window.audioManager.onUpdate === 'function') {
            this._unsubscribe = window.audioManager.onUpdate((payload) => {
                this.latest = payload;
            });
        }

        if (!this.frameId) {
            this.frameId = requestAnimationFrame(this.drawFrame);
        }
    }

    stop() {
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        window.removeEventListener('resize', this._resizeHandler);
    }
}
