/**
 * TemplateAnimation - Basic skeleton following the required module interface.
 * * NOTE: The class name (TemplateAnimation) must match the 'class_name' field
 * in the main manifest array in index.html.
 */
export class TemplateAnimation {
    
    constructor(canvas, config) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.config = config; // Holds name, creator, duration, etc.
        this.frameId = null;
        
        // --- Audio Data ---
        this.LOW = 0;
        this.MID = 0;
        this.HIGH = 0;
        
        console.log(`[${config.name}] Initialized.`);
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
        // Clear canvas
        this.ctx.fillStyle = `rgba(0, 0, 0, 0.2)`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 1. Map LOW to size
        const size = 50 + this.LOW * 1.5;
        
        // 2. Map MID to position/color
        const colorIntensity = this.MID / 100;
        this.ctx.fillStyle = `rgba(51, 255, 0, ${colorIntensity})`;
        
        // 3. Map HIGH to glow
        this.ctx.shadowBlur = this.HIGH / 5;
        this.ctx.shadowColor = 'var(--color-primary)';

        // Draw a pulsing circle
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Reset shadow
        this.ctx.shadowBlur = 0;

        this.frameId = requestAnimationFrame(this.drawFrame);
    }
    
    /**
     * MANDATORY: Starts the animation loop when the view becomes active.
     */
    start() {
        if (!this.frameId) {
            console.log(`[${this.config.name}] Starting loop.`);
            this.drawFrame();
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