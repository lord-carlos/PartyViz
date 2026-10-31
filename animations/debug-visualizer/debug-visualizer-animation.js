export class DebugVisualizerAnimation {
    constructor(canvas, config) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.config = config || {};
        this.frameId = null;

        this.latest = null; // latest rich payload from AudioManager

        // simple fallback band values to keep compatibility with updateFrequencies calls
        this.LOW = 0; this.MID = 0; this.HIGH = 0;

        // DOM hooks
        const slug = this.config.slug || 'debug-visualizer';
        this.metaEl = document.getElementById(`meta-${slug}`) || document.getElementById('meta-debug-visualizer');
        this.labelEl = document.getElementById(`label-${slug}`) || document.getElementById('label-debug-visualizer');

        // layout
        this.width = 0; this.height = 0; this.dpr = 1; this.initialized = false;
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Subscribe to AudioManager if available
        if (window.audioManager && typeof window.audioManager.onUpdate === 'function') {
            this._onUpdateBound = (p) => { this.latest = p; };
            window.audioManager.onUpdate(this._onUpdateBound);
        } else {
            // will still work via updateFrequencies fallback
            console.warn('[DebugVisualizer] audioManager not found; using legacy updateFrequencies');
        }

        // Colors
        this.fg = '#33ff66';
        this.bg = '#000';

        console.log('[DebugVisualizer] ready');
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.dpr = dpr;
        const rectW = Math.floor(rect.width);
        const rectH = Math.floor(rect.height);
        if (rectW <= 2 || rectH <= 2) return;
        this.width = rectW; this.height = rectH;
        this.canvas.width = Math.floor(this.width * dpr);
        this.canvas.height = Math.floor(this.height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.initialized = true;
    }

    updateFrequencies(low, mid, high) {
        // legacy small-band updates (0..100)
        this.LOW = low; this.MID = mid; this.HIGH = high;
    }

    drawBars(spectrumNorm) {
        const ctx = this.ctx;
        const w = this.width; const h = this.height;
        ctx.save();
        const padding = 10;
        const areaW = w - padding * 2;
        const areaH = h - padding * 2;
        const barCount = Math.min(128, spectrumNorm.length);
        const step = Math.floor(spectrumNorm.length / barCount) || 1;
        const barW = Math.max(1, (areaW - (barCount - 1) * 2) / barCount);

        for (let i = 0; i < barCount; i++) {
            const v = spectrumNorm[i * step] || 0; // 0..100
            const x = padding + i * (barW + 2);
            const barH = (v / 100) * (areaH);
            const y = padding + (areaH - barH);
            const hue = 140 - (v / 100) * 120; // green -> red
            ctx.fillStyle = `hsl(${hue}deg 100% 50% / 0.95)`;
            // glow
            ctx.shadowBlur = 14;
            ctx.shadowColor = this.fg;
            ctx.fillRect(x, y, barW, barH);
            ctx.shadowBlur = 0;
        }
        ctx.restore();
    }

    drawText(payload) {
        const lines = [];
        if (!payload) {
            lines.push(`LOW: ${this.LOW}   MID: ${this.MID}   HIGH: ${this.HIGH}`);
            this.labelEl && (this.labelEl.textContent = lines.join('\n'));
            return;
        }
        lines.push(`ts: ${payload.timestamp}`);
        lines.push(`sr: ${payload.sampleRate}  fft: ${payload.fftSize}`);
        lines.push(`bands: ${Object.entries(payload.bands || {}).map(([k,v]) => `${k}:${v}`).join('  ')}`);
        lines.push(`features: rms=${payload.features.rms.toFixed(3)}  centroid=${Math.round(payload.features.centroidHz)}Hz  flux=${payload.features.spectralFlux.toFixed(4)}`);
        const bpm = payload.bpm || {};
        lines.push(`bpm: ${bpm.value || '-'}  rolling:${bpm.rolling || '-'}  conf:${(bpm.confidence||0).toFixed(2)}  age:${(bpm.ageMs===Infinity?'-':Math.round(bpm.ageMs))}ms`);
        this.labelEl && (this.labelEl.textContent = lines.join('\n'));
    }

    drawFrame = () => {
        if (!this.initialized) { this.resize(); this.frameId = requestAnimationFrame(this.drawFrame); return; }
        const ctx = this.ctx;
        // clear
        ctx.fillStyle = this.bg; ctx.fillRect(0, 0, this.width, this.height);

        // draw spectrum bars (prefers spectrumNorm if available)
        const payload = this.latest;
        if (payload && payload.spectrumNorm) {
            this.drawBars(payload.spectrumNorm);
        } else {
            // draw simple reactive circles based on LOW/MID/HIGH
            const cx = this.width / 2; const cy = this.height / 2; const spacing = Math.min(120, this.width / 6);
            const vals = [this.LOW, this.MID, this.HIGH];
            for (let i = 0; i < 3; i++) {
                const val = vals[i] || 0;
                const size = 20 + (val / 100) * Math.min(this.width, this.height) * 0.35;
                ctx.beginPath(); ctx.fillStyle = `rgba(51,255,102,${0.06 + val/100*0.8})`;
                ctx.arc(cx + (i-1)*spacing, cy, size, 0, Math.PI*2); ctx.fill();
            }
        }

        // draw metadata text overlay in the top-left
        ctx.save();
        ctx.font = '12px "Courier New", monospace';
        ctx.fillStyle = this.fg; ctx.textAlign = 'left'; ctx.shadowBlur = 10; ctx.shadowColor = this.fg;
        if (payload) {
            const txt = `BPM: ${payload.bpm.value || '-'}  Rolling: ${payload.bpm.rolling || '-'}  Centroid: ${Math.round(payload.features.centroidHz)}Hz`;
            ctx.fillText(txt, 14, 18);
        } else {
            ctx.fillText('No audio payload', 14, 18);
        }
        ctx.restore();

        // update textual panel
        this.drawText(payload);

        this.frameId = requestAnimationFrame(this.drawFrame);
    }

    start() {
        if (!this.frameId) {
            this.resize();
            this.frameId = requestAnimationFrame(this.drawFrame);
        }
    }

    stop() {
        if (this.frameId) { cancelAnimationFrame(this.frameId); this.frameId = null; }
    }
}
