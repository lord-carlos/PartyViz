export class HackerTerminalAnimation {
    constructor(canvas, config) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.config = config || {};
        this.frameId = null;

        // Audio State
        this.low = 0;
        this.mid = 0;
        this.high = 0;

        // -- State: Names --
        this.names = ["INITIALIZING...", "CONNECTING...", "DECRYPTING..."]; // Fallback
        this.nameLog = [];
        this.lastUrlFetch = 0;
        this.nameTimer = 0;

        // -- State: Matrix --
        this.matrixColumns = [];
        this.matrixFontSize = 14;

        // -- State: Globe --
        this.spherePoints = [];
        this.cities = [];
        this.rotation = 0;

        // Precompute 3D Globe Geometry
        this.initGlobe();

        // Start fetching names immediately
        this.fetchNames();
    }

    async fetchNames() {
        try {
            const res = await fetch('./names.json');
            if (res.ok) {
                const data = await res.json();
                if (data.names && Array.isArray(data.names)) {
                    this.names = data.names;
                    // Shuffle slightly
                    this.names.sort(() => Math.random() - 0.5);
                }
            }
        } catch (e) {
            console.warn("Could not load names.json", e);
        }
    }

    initGlobe() {
        const radius = 200;
        // Create Latitude/Longitude lines
        for (let lat = -80; lat <= 80; lat += 20) {
            const phi = (90 - lat) * (Math.PI / 180);
            for (let lon = 0; lon < 360; lon += 10) {
                const theta = lon * (Math.PI / 180);
                this.spherePoints.push(this.getSpherePoint(radius, phi, theta));
            }
        }
        // Create Random Cities
        for (let i = 0; i < 40; i++) {
            const lat = (Math.random() * 160) - 80;
            const lon = Math.random() * 360;
            const phi = (90 - lat) * (Math.PI / 180);
            const theta = lon * (Math.PI / 180);
            this.cities.push({
                ...this.getSpherePoint(radius, phi, theta),
                label: Math.floor(Math.random() * 9999).toString(16).toUpperCase()
            });
        }
    }

    getSpherePoint(r, phi, theta) {
        // Spherical to Cartesian
        return {
            x: r * Math.sin(phi) * Math.cos(theta),
            y: r * Math.cos(phi),
            z: r * Math.sin(phi) * Math.sin(theta)
        };
    }

    updateFrequencies(low, mid, high) {
        this.low = low;
        this.mid = mid;
        this.high = high;
    }

    initMatrix(height) {
        const cols = Math.floor((this.canvas.width * 0.33) / this.matrixFontSize);
        this.matrixColumns = Array(cols).fill(0).map(() => Math.random() * height);
    }

    start() {
        // Handle resolution
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

        this.initMatrix(this.canvas.height / 2);

        if (!this.frameId) {
            this.frameId = requestAnimationFrame(this.draw);
        }
    }

    stop() {
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }

    // --- 3D Projection Logic ---
    project(x, y, z, cx, cy, scale) {
        // Simple perspective
        const fov = 400 + (this.low * 2); // Bass zooms in slightly
        const scaleProj = fov / (fov + z);
        return {
            x: cx + x * scaleProj,
            y: cy + y * scaleProj,
            s: scaleProj
        };
    }

    draw = () => {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Fetch colors from CSS (fallback to #0f0)
        const primaryColor = getComputedStyle(this.canvas).getPropertyValue('--color-primary').trim() || '#0f0';

        // Clear Screen
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        // --- LAYOUT DEFINITION ---
        // Panel 1: Matrix (Top Left, 30% width, 50% height)
        // Panel 2: Names (Bottom Left, 30% width, 50% height)
        // Panel 3: Globe (Right, 70% width, 100% height)

        const splitX = Math.floor(w * 0.3);
        const splitY = Math.floor(h * 0.5);

        // Draw Borders
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, splitX - 4, splitY - 4); // Top Left
        ctx.strokeRect(2, splitY + 2, splitX - 4, h - splitY - 4); // Bot Left
        ctx.strokeRect(splitX + 2, 2, w - splitX - 4, h - 4); // Main Right

        // --- RENDER 1: MATRIX ---
        this.renderMatrix(ctx, 2, 2, splitX - 4, splitY - 4, primaryColor);

        // --- RENDER 2: NAME DECRYPTOR ---
        this.renderNames(ctx, 2, splitY + 2, splitX - 4, h - splitY - 4, primaryColor);

        // --- RENDER 3: VECTOR GLOBE ---
        this.renderGlobe(ctx, splitX + 2, 2, w - splitX - 4, h - 4, primaryColor);

        this.frameId = requestAnimationFrame(this.draw);
    }

    renderMatrix(ctx, x, y, w, h, color) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip(); // Clip to this box

        ctx.fillStyle = color;
        ctx.font = `${this.matrixFontSize}px monospace`;

        // Speed depends on Low/Bass
        const speed = 0.14 + (this.low * 0.02);

        for (let i = 0; i < this.matrixColumns.length; i++) {
            // Random char
            const char = String.fromCharCode(0x30A0 + Math.random() * 96);

            // Draw trail
            const px = x + (i * this.matrixFontSize);
            const py = y + this.matrixColumns[i];

            // Vary opacity based on Mid frequency
            ctx.globalAlpha = 0.5 + (Math.random() * 0.5);
            ctx.fillText(char, px, py);

            // Reset drop
            if (py > y + h && Math.random() > 0.975) {
                this.matrixColumns[i] = 0;
            }
            this.matrixColumns[i] += this.matrixFontSize * (Math.random() * 0.5 + 0.5) * (speed / 4);
        }

        // Header
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, w, 20);
        ctx.fillStyle = color;
        ctx.fillText("SYS.MATRIX_STREAM // " + Math.floor(this.low), x + 5, y + 15);

        ctx.restore();
    }

    renderNames(ctx, x, y, w, h, color) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        // Logic to add names to log based on beat (Mid frequency)
        // Threshold logic: if MID is high enough, add a name
        this.nameTimer++;
        if (this.mid > 50 && this.nameTimer > 5) {
            const name = this.names[Math.floor(Math.random() * this.names.length)];
            // Add fake hash
            const hash = Math.floor(Math.random() * 999999);
            this.nameLog.unshift(`[${hash}] TARGET: ${name.toUpperCase()}`);
            this.nameTimer = 0;
        }

        // Trim log
        if (this.nameLog.length > 20) this.nameLog.pop();

        ctx.font = "12px monospace";
        ctx.textAlign = "left";

        const lineHeight = 15;
        const startY = y + 30;

        this.nameLog.forEach((line, i) => {
            const alpha = 1 - (i / 18);
            if (alpha < 0) return;

            // Highlight first item if HIGH frequency is hitting
            if (i === 0 && this.high > 60) {
                ctx.fillStyle = color; // Solid background
                ctx.fillRect(x + 5, startY + (i * lineHeight) - 10, w - 10, lineHeight);
                ctx.fillStyle = '#000'; // Inverted text
            } else {
                ctx.fillStyle = color;
                ctx.globalAlpha = alpha;
            }

            ctx.fillText(line, x + 10, startY + (i * lineHeight));
            ctx.globalAlpha = 1.0;
        });

        // Header
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, w, 20);
        ctx.fillStyle = color;
        ctx.fillText(`TARGET_LIST // HITS: ${this.nameLog.length}`, x + 5, y + 15);

        ctx.restore();
    }

    renderGlobe(ctx, x, y, w, h, color) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        const cx = x + w / 2;
        const cy = y + h / 2;

        // Rotation speed
        this.rotation += 0.0005 + (this.mid * 0.0001);

        // Header
        ctx.textAlign = "left";
        ctx.font = "14px monospace";
        ctx.fillText("GLOBAL_SURVEILLANCE // VECTOR_MODE", x + 10, y + 20);
        ctx.textAlign = "right";
        ctx.fillText(`SEC_LEVEL: ${this.high > 80 ? 'CRITICAL' : 'NORMAL'}`, x + w - 10, y + 20);


        // Draw Globe Lines (Back of sphere first, usually hidden but wireframe sees all)
        // Actually, let's just draw all dots/lines. 
        // We rotate coordinates around Y axis.

        ctx.lineWidth = 2;
        const cosR = Math.cos(this.rotation);
        const sinR = Math.sin(this.rotation);

        // Draw Points/Grid
        // Performance optimization: Don't stroke() every line. Batch them.
        ctx.beginPath();

        for (let p of this.spherePoints) {
            // Rotate Y
            const rx = p.x * cosR - p.z * sinR;
            const rz = p.x * sinR + p.z * cosR;

            // Project
            const proj = this.project(rx, p.y, rz, cx, cy, 1);

            // Draw small dot
            ctx.moveTo(proj.x, proj.y);
            ctx.rect(proj.x, proj.y, 1, 1);
        }

        // Make the grid faint
        ctx.globalAlpha = 0.3;
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Draw "Cities" (Bright flashing targets)
        for (let c of this.cities) {
            const rx = c.x * cosR - c.z * sinR;
            const rz = c.x * sinR + c.z * cosR;

            // Only draw if on front side of sphere (simple Z check)
            if (rz < 0) continue;

            const proj = this.project(rx, c.y, rz, cx, cy, 1);

            // Audio reactive size
            const pulse = (this.high * 0.1) * Math.random();
            const size = 4 + pulse;

            ctx.beginPath();
            ctx.moveTo(proj.x + 5, proj.y);
            ctx.arc(proj.x, proj.y, size, 0, Math.PI * 2);

            // Draw connection line to center? No, looks messy.
            // Draw label
            if (this.high > 50 && Math.random() > 0.8) {
                ctx.font = "10px monospace";
                ctx.fillText(c.label, proj.x + 10, proj.y);
            }

            ctx.stroke();
        }

        // Big Crosshair overlay
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.moveTo(cx, y); ctx.lineTo(cx, y + h);
        ctx.moveTo(x, cy); ctx.lineTo(x + w, cy);
        ctx.stroke();

        ctx.restore();
    }
}