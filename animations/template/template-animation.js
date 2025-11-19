/**
 * TemplateAnimation - Basic skeleton following the required module interface.
 * * NOTE: The class name (TemplateAnimation) must match the 'class_name' field
 * in the main manifest array in index.html.
 */
export class TemplateAnimation {
    // configurable defaults (top-of-file)
    BASE_SIZE = 30; // px
    SIZE_MULT = 40; // how much band value affects circle size
    DEFAULT_SENSITIVITY = 1.0;

    constructor(canvas, config) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.config = config || {}; // Holds name, creator, duration, slug, settings, etc.
        this.frameId = null;
        
        // --- Audio Data ---
        this.LOW = 0;
        this.MID = 0;
        this.HIGH = 0;

        // Sensitivity and overrides from manifest's `settings`
        this.sensitivity = (this.config.settings && Number(this.config.settings.sensitivity)) || this.DEFAULT_SENSITIVITY;

        // meta and debug label elements
        const slug = this.config.slug || (this.config.name && this.config.name.toLowerCase().replace(/\s+/g, '-')) || 'template';
        this.metaEl = document.getElementById(`meta-${slug}`) || document.getElementById('meta-template');
        this.labelEl = document.getElementById(`label-${slug}`) || document.getElementById('label-template');

        // sizing and retina support
        this.width = 0; this.height = 0; this.dpr = 1;
        this.initialized = false; // defer drawing until layout is valid

        this.resize();
        window.addEventListener('resize', () => {
            this.resize();
            // re-init only if layout becomes valid
            if (!this.initialized && this.width > 40 && this.height > 40) {
                this.initialized = true;
                console.log(`[Template] Layout ready after resize -> ${this.width}x${this.height}`);
            }
        });

        console.log(`[Template] Initialized: ${this.config.name || slug} (sensitivity=${this.sensitivity})`);
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.dpr = dpr;
        // Only accept layout if rect provides a useful size; otherwise we keep width/height as 0
        const rectW = Math.floor(rect.width);
        const rectH = Math.floor(rect.height);

        // If rect is too small (not laid out yet), don't set width/height to avoid bad initial geometry.
        if (rectW <= 2 || rectH <= 2) {
            // Keep width/height 0 and let initialization wait for a real layout
            // Debug hint:
            // console.log(`[Template] resize - layout not ready (${rectW}x${rectH}), waiting...`);
            return;
        }

        this.width = Math.max(1, rectW);
        this.height = Math.max(1, rectH);
        this.canvas.width = Math.max(1, Math.floor(this.width * dpr));
        this.canvas.height = Math.max(1, Math.floor(this.height * dpr));
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // read CSS color variables
        try {
            const cs = getComputedStyle(document.documentElement);
            this.bgColor = cs.getPropertyValue('--color-bg').trim() || '#000';
        } catch (e) {
            this.bgColor = '#000';
        }

        // mark initialized when we have usable dimensions
        if (!this.initialized && this.width > 40 && this.height > 40) {
            this.initialized = true;
            console.log(`[Template] Layout ready -> ${this.width}x${this.height}`);
        }
    }

    /**
     * MANDATORY: Receives normalized frequency data (0-100).
     * @param {number} low - Bass frequency power (0-100)
     * @param {number} mid - Mid-range frequency power (0-100)
     * @param {number} high - High-range frequency power (0-100)
     */
    updateFrequencies(low, mid, high) {
        // Update internal state
        this.LOW = low;
        this.MID = mid;
        this.HIGH = high;
    }

    // --- Core Animation Loop ---
    
    drawFrame = () => {
        // If layout is not ready, wait and try again later.
        if (!this.initialized) {
            // Try to detect a valid layout once per frame until we can draw
            this.resize();
            this.frameId = requestAnimationFrame(this.drawFrame);
            return;
        }

        // Clear canvas (solid clean black background)
        this.ctx.fillStyle = this.bgColor || '#000';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // compute center and spacing for 3 circles
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const spacing = Math.min(this.width / 6, 120);
        const positions = [centerX - spacing, centerX, centerX + spacing];

        // bands map: low, mid, high
        const bands = [this.LOW, this.MID, this.HIGH];
        const labels = ['LOW', 'MID', 'HIGH'];

        for (let i = 0; i < 3; i++) {
            const bandVal = bands[i];
            const size = this.BASE_SIZE + (bandVal / 100) * (this.SIZE_MULT * this.sensitivity);
            const alpha = 0.25 + (bandVal / 100) * 0.75; // alpha 0.25..1.0
            this.ctx.fillStyle = `rgba(51, 255, 0, ${alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(positions[i], centerY, size, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Update metadata display for debugging
        if (this.labelEl) {
            this.labelEl.textContent = `LOW: ${this.LOW}  MID: ${this.MID}  HIGH: ${this.HIGH}  sensitivity: ${this.sensitivity}`;
        }

        this.frameId = requestAnimationFrame(this.drawFrame);
    }
    
    /**
     * MANDATORY: Starts the animation loop when the view becomes active.
     */
    start() {
        if (!this.frameId) {
            console.log(`[${this.config.name || 'Template'}] Starting loop.`);
            // Ensure layout is initialized (if it's not, drawFrame will wait)
            this.resize();
            if (!this.initialized) {
                // schedule a check loop; drawFrame will bail until layout ready
                this.frameId = requestAnimationFrame(this.drawFrame);
            } else {
                this.frameId = requestAnimationFrame(this.drawFrame);
            }
        }
    }
    
    /**
     * MANDATORY: Stops the animation loop when the view switches away.
     */
    stop() {
        if (this.frameId) {
            console.log(`[${this.config.name}] Stopping loop.`);
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }
}