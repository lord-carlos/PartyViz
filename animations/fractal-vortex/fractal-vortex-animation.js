export class FractalVortexAnimation {
    constructor(canvas, config) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.config = config || {};
        this.frameId = null;

        // Audio Vars
        this.low = 0;
        this.mid = 0;
        this.high = 0;

        // Visual State
        this.time = 0;
        this.hue = 0;
        this.rotation = 0;
        this.zoom = 1;

        // Names Logic
        this.names = ["VOID", "ECHO", "PULSE"];
        this.activeNames = []; // { text, r (radius), theta (angle), size, color }
        this.nameCooldown = 0;
        this.width = 0;
        this.height = 0;
        this._resizeHandler = () => this.resize();

        this.fetchNames();
    }

    async fetchNames() {
        try {
            const res = await fetch('./names.json');
            const data = await res.json();
            if (data.names) this.names = data.names;
        } catch (e) { console.warn(e); }
    }

    updateFrequencies(low, mid, high) {
        this.low = low;
        this.mid = mid;
        this.high = high;
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        const dpr = window.devicePixelRatio || 1;
        this.width = width;
        this.height = height;
        this.canvas.width = Math.floor(width * dpr);
        this.canvas.height = Math.floor(height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    start() {
        this.resize();
        window.addEventListener('resize', this._resizeHandler);

        if (!this.frameId) {
            this.frameId = requestAnimationFrame(this.draw);
        }
    }

    stop() {
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
        window.removeEventListener('resize', this._resizeHandler);
    }

    spawnName() {
        if (this.nameCooldown > 0) {
            this.nameCooldown--;
            return;
        }

        // Spawn on Bass Beat
        if (this.low > 60) {
            const text = this.names[Math.floor(Math.random() * this.names.length)];
            this.activeNames.push({
                text: text,
                r: 0, // Start at center
                theta: this.rotation + (Math.random() * Math.PI), // Current swirl angle
                alpha: 0,
                color: `hsl(${this.hue + 180}, 100%, 70%)` // Complementary color to current background
            });
            this.nameCooldown = 600; // limit spawn rate
        }
    }

    draw = () => {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const cx = w / 2;
        const cy = h / 2;

        // 1. TRAIL EFFECT
        // Instead of clearing, draw a semi-transparent rectangle.
        // This creates the "trippy" smear effect.
        // Alpha depends on 'High' freq: more treble = sharper visuals, less smear
        const trailAlpha = 0.05 + (this.high * 0.001);
        ctx.fillStyle = `rgba(0, 0, 0, ${trailAlpha})`;
        ctx.fillRect(0, 0, w, h);

        // 2. UPDATE PHYSICS
        // Global Time moves faster with Mid frequencies
        this.time += 0.02 + (this.mid * 0.001);

        // Cycle Colors
        this.hue = (this.time * 20) % 360;

        // Rotation of the vortex
        this.rotation += 0.0 + (this.low * 0.0001);

        // 3. DRAW FRACTAL GEOMETRY
        ctx.save();
        ctx.translate(cx, cy);

        // Number of recursion layers
        const layers = 20;

        ctx.lineWidth = 2;
        // High freq makes lines glitch/shake
        const jitter = (this.high * 0.05);

        for (let i = 0; i < layers; i++) {
            ctx.save();

            // Each layer rotates slightly relative to the last
            // Creates the spiral tunnel
            const layerAngle = (i * 0.02) * this.rotation;
            ctx.rotate(layerAngle);

            // Determine Color for this layer
            const layerHue = (this.hue + (i * 10)) % 360;
            const lightness = 50 + (this.low * 0.2); // Bass lights it up
            ctx.strokeStyle = `hsl(${layerHue}, 100%, ${lightness}%)`;

            // Draw a shape (Triangle/Hexagon hybrid)
            // Radius expands with loop index
            const r = (i * 20) + (this.mid * 0.5) + jitter;

            ctx.beginPath();
            // Draw 3-sided symmetry (triangle) rotating
            for (let j = 0; j < 3; j++) {
                const theta = (j / 3) * Math.PI * 2;
                const px = Math.cos(theta) * r;
                const py = Math.sin(theta) * r;
                if (j === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();

            // Optional: Connect corners to center for "spiderweb" look
            if (i % 2 === 0) {
                ctx.globalAlpha = 0.2;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(r, 0);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }

            ctx.restore();
        }
        ctx.restore();

        // 4. DRAW NAMES (Spiraling out)
        this.spawnName();

        ctx.save();
        ctx.translate(cx, cy);

        // These are constant for the whole batch: set them once, not per name.
        ctx.shadowBlur = 10;
        ctx.textAlign = "center";
        // Font size depends on radius, but only quantized integer sizes are
        // worth a re-parse; track the last size actually applied.
        let lastFontPx = -1;

        for (let i = this.activeNames.length - 1; i >= 0; i--) {
            let n = this.activeNames[i];

            // Move outwards
            n.r += 0.03 + (this.low * 0.04); // Bass boosts speed
            // Rotate with the vortex
            n.theta += 0.01;
            // Fade in based on distance from center

            // Remove if off screen
            if (n.r > Math.max(w, h)) {
                this.activeNames.splice(i, 1);
                continue;
            }

            const nx = Math.cos(n.theta) * n.r;
            const ny = Math.sin(n.theta) * n.r;

            // Font is transform-independent: set it before save() so the
            // per-name save/restore doesn't roll the face back each time.
            const fontPx = Math.round(10 + (n.r / 10)); // Grow as they get closer
            if (fontPx !== lastFontPx) {
                ctx.font = `bold ${fontPx}px monospace`;
                lastFontPx = fontPx;
            }

            ctx.save();
            ctx.translate(nx, ny);
            ctx.rotate(n.theta + Math.PI / 2); // Align text tangentially

            ctx.fillStyle = n.color;
            ctx.shadowColor = n.color; // per-name color; blur/align set once above

            ctx.fillText(n.text, 0, 0);

            ctx.restore();
        }
        ctx.restore();

        this.frameId = requestAnimationFrame(this.draw);
    }
}