/*
 * AsteroidsAnimation - small canvas animation of drifting asteroids that react to audio.
 * Exports: AsteroidsAnimation
 * Contract: constructor(canvas, config), updateFrequencies(low, mid, high), start(), stop()
 */
export class AsteroidsAnimation {
    // --- Configurable parameters (top-of-file) ---
    // Customize: amount, base speed, sensitivity.
    // ASTEROID_COUNT: number of asteroids in the scene (int)
    // BASE_SPEED: base drift speed multiplier (small values for slow float)
    // SENSITIVITY: controls how strongly an asteroid responds to audio
    // Per-asteroid: each asteroid picks a random `reactBand` in ['low', 'mid', 'high'] and a local sensitivity.
    ASTEROID_COUNT = 40;          // number of asteroids
    BASE_SPEED = 0.03;           // base movement multiplier (very slow drift)
    SENSITIVITY = 0.8;           // how strongly asteroids respond to an audio band (0..2)
    // no global react band - asteroids pick a band individually

    constructor(canvas, config) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.config = config || {};
        this.frameId = null;

        // audio values
        this.LOW = 0;
        this.MID = 0;
        this.HIGH = 0;

        // internal state
        this.asteroids = [];
        this.lastTime = null;
        this.initialized = false;

        // Offscreen cache for the static starfield (rebuilt only on resize)
        this._starCanvas = null;
        this._starWidth = 0;
        this._starHeight = 0;
        this._starDpr = 0;

        // allow config overrides
        if (config && config.settings) {
            const s = config.settings;
            this.ASTEROID_COUNT = s.count ?? this.ASTEROID_COUNT;
            this.BASE_SPEED = s.base_speed ?? this.BASE_SPEED;
            this.SENSITIVITY = s.sensitivity ?? this.SENSITIVITY;
            // per-asteroid band randomized; no global react band
        }

        console.log(`[Asteroids] Initialized. Count=${this.ASTEROID_COUNT} sensitivity=${this.SENSITIVITY} + per-asteroid bands`);

        // Prepare asteroids (will use canvas size to place them)
        this.resize();
        if (this.width && this.height) {
            this._initAsteroids();
            this.initialized = true;
        }
        this._resizeHandler = () => {
            this.resize();
            if (!this.initialized) {
                this._initAsteroids();
                this.initialized = true;
            } else {
                this._packAsteroids();
            }
        };
    }

    // Mandatory hook: (low, mid, high) values are 0..100
    updateFrequencies(low, mid, high) {
        this.LOW = low;
        this.MID = mid;
        this.HIGH = high;
        // optionally use smoothing in the animation itself
    }

    // --- Helpers ---
    resize() {
        const rect = this.canvas.getBoundingClientRect();
        // support high DPI rendering
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.width = rect.width;
        this.height = rect.height;

        // Rebuild the cached starfield only when the backing size actually changes.
        const cssW = Math.max(1, Math.floor(this.width));
        const cssH = Math.max(1, Math.floor(this.height));
        if (!this._starCanvas || cssW !== this._starWidth || cssH !== this._starHeight || dpr !== this._starDpr) {
            this._buildStarfield(cssW, cssH, dpr);
        }
    }

    _buildStarfield(cssW, cssH, dpr) {
        // Draw the faint dots once into an offscreen canvas; the frame loop then
        // blits it with a single drawImage instead of clearing + 50 arcs.
        if (!this._starCanvas) this._starCanvas = document.createElement('canvas');
        const sc = this._starCanvas;
        sc.width = Math.max(1, Math.floor(cssW * dpr));
        sc.height = Math.max(1, Math.floor(cssH * dpr));
        const sctx = sc.getContext('2d');
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        sctx.fillStyle = '#000';
        sctx.fillRect(0, 0, cssW, cssH);
        sctx.globalCompositeOperation = 'lighter';
        sctx.fillStyle = 'rgba(51, 255, 0, 0.02)';
        for (let i = 0; i < 50; i++) {
            // same reproducible star positions/sizes as before
            const x = (i * 67) % cssW;
            const y = (i * 43) % cssH;
            const r = (i % 3) + 0.5;
            sctx.beginPath(); sctx.arc(x, y, r, 0, Math.PI * 2); sctx.fill();
        }
        this._starWidth = cssW;
        this._starHeight = cssH;
        this._starDpr = dpr;
    }

    _initAsteroids() {
        // If canvas has no size yet, delay initialization
        // if (!this.width || !this.height) {
        //     console.log('[Asteroids] Canvas has no size yet, delaying _initAsteroids');
        //     requestAnimationFrame(() => {
        //         this.resize();
        //         this._initAsteroids();
        //     });
        //     return;
        // }

        this.asteroids = [];
        for (let i = 0; i < this.ASTEROID_COUNT; i++) {
            this.asteroids.push(this._createAsteroid(i));
        }
        // log band distribution for debugging
        const counts = this.asteroids.reduce((acc, a) => { acc[a.reactBand] = (acc[a.reactBand] || 0) + 1; return acc; }, {});
        console.log('[Asteroids] band distribution:', counts);
    }

    _packAsteroids() {
        // Keep asteroids within the new size; reposition if necessary
        for (let a of this.asteroids) {
            a.x = Math.max(0, Math.min(this.width, a.x));
            a.y = Math.max(0, Math.min(this.height, a.y));
        }
    }

    _createAsteroid(i) {
        const size = 8 + Math.random() * 36; // px
        const angle = Math.random() * Math.PI * 2;
        const speed = (0.02 + Math.random() * 0.06) * this.BASE_SPEED; // pixels / ms (very slow drift)
        const x = Math.random() * this.width || Math.random() * 800;
        const y = Math.random() * this.height || Math.random() * 600;
        const rotation = Math.random() * Math.PI * 2;
        const rotationSpeed = (Math.random() - 0.5) * 0.001; // subtle spin
        // use a green monochrome palette for an 80s terminal vibe
        const color = `rgba(51, 255, 0, ${0.75 + Math.random() * 0.25})`;
        // pick a band at random and a per-asteroid sensitivity
        const bands = ['low', 'mid', 'high'];
        const reactBand = bands[Math.floor(Math.random() * bands.length)];
        const localSens = this.SENSITIVITY * (0.6 + Math.random() * 0.8);
        // compute polygon offsets once per asteroid so shape is stable across frames
        const spikes = 6;
        const offsets = Array.from({ length: spikes }, () => 0.6 + Math.random() * 0.4);
        return {
            id: i,
            size,
            sizeCurrent: size,
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            rotation,
            rotationSpeed,
            color,
            reactBand,
            sensitivity: localSens,
            spikes,
            offsets
        };
    }

    // --- Render Loop ---
    drawFrame = (timestamp) => {
        if (!this.lastTime) this.lastTime = timestamp;
        const dt = Math.min(50, timestamp - this.lastTime); // avoid large dt
        this.lastTime = timestamp;

        if (!this.width || !this.height) {
            // Wait for a valid size before drawing
            this.resize();
            this.frameId = requestAnimationFrame(this.drawFrame);
            return;
        }

        // clear
        this.ctx.clearRect(0, 0, this.width, this.height);
        // faint background starfield
        this._drawStars();

        // per-asteroid reaction: each asteroid has its reactBand & sensitivity

        // update and draw asteroids
        for (let a of this.asteroids) {
            // drift slowly (no major movement change with audio)
            a.x += a.vx * dt;
            a.y += a.vy * dt;
            // subtle constant rotation (very small)
            a.rotation += a.rotationSpeed * dt;

            // compute band-specific react value (0..1+) and scale size
            const bandVal = a.reactBand === 'low' ? this.LOW : (a.reactBand === 'mid' ? this.MID : this.HIGH);
            const react = (bandVal / 100) * a.sensitivity; // 0..sensitivity
            // Smooth size changes: interpolate sizeCurrent towards target size to avoid jitter
            const sizeTarget = a.size * (1 + 0.4 * react);
            a.sizeCurrent = a.sizeCurrent + (sizeTarget - a.sizeCurrent) * 0.08; // smoothing factor
            const sizeMod = a.sizeCurrent;

            // wrap around screen edges
            if (a.x < -sizeMod) a.x = this.width + sizeMod;
            if (a.x > this.width + sizeMod) a.x = -sizeMod;
            if (a.y < -sizeMod) a.y = this.height + sizeMod;
            if (a.y > this.height + sizeMod) a.y = -sizeMod;

            // draw; pass computed react for glow/overlay
            this._drawAsteroid(a, sizeMod, react);
        }

        this.frameId = requestAnimationFrame(this.drawFrame);
    }

    _drawStars() {
        // Opaque cached starfield (black + faint dots): one blit per frame.
        if (!this._starCanvas) return;
        this.ctx.drawImage(this._starCanvas, 0, 0, this.width, this.height);
    }

    _drawAsteroid(a, s, react) {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rotation);
        // give a subtle glow based on react
        const glow = Math.max(0, Math.min(20, react * 30));
        ctx.shadowBlur = glow;
        ctx.shadowColor = 'rgba(255,255,255,0.5)';

        // main body
        ctx.fillStyle = a.color;
        ctx.beginPath();
        // draw polygonal rock using precomputed offsets to avoid jitter
        const spikes = a.spikes || 6;
        for (let i = 0; i < spikes; i++) {
            const ang = (i / spikes) * Math.PI * 2;
            const radFactor = (a.offsets && a.offsets[i]) || 1;
            const rad = s * radFactor;
            const px = Math.cos(ang) * rad;
            const py = Math.sin(ang) * rad;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        // brightness overlay for high frequencies
        if (react > 0.15) {
            ctx.fillStyle = `rgba(255,255,255, ${Math.min(0.25, react * 0.35)})`;
            ctx.fill();
        }

        ctx.restore();
    }

    // Mandatory: start animation loop
    start() {
        if (!this.frameId) {
            console.log('[Asteroids] Starting loop');
            this.lastTime = null;
            // Ensure we have initialized asteroids (in case constructor deferred it)
            if (!this.initialized) {
                this.resize();
                this._initAsteroids();
                this.initialized = true;
            }
            window.addEventListener('resize', this._resizeHandler);
            this.frameId = requestAnimationFrame(this.drawFrame);
        }
    }

    // Mandatory: stop animation loop and clean up
    stop() {
        if (this.frameId) {
            console.log('[Asteroids] Stopping loop');
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
        window.removeEventListener('resize', this._resizeHandler);
    }
}
