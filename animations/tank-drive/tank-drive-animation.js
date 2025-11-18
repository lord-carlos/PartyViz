export class TankDriveAnimation {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = config || {};
    this.frameId = null;

    // Audio state
    this.low = 0;
    this.mid = 0;
    this.high = 0;
    this.smoothedLow = 0;
    this.smoothedMid = 0;
    this.smoothedHigh = 0;

    // Configuration / Settings
    this.settings = this.config.settings || {};
    this.speed = this.settings.speed || 4;
    this.segmentWidth = 10;
    
    // State
    this.terrainPoints = [];
    this.clouds = [];
    this.treadOffset = 0;
    
    // Tank dimensions
    this.tankWidth = 80;
    this.tankHeight = 40;

    // Pre-allocate reusable objects to avoid GC
    this.color = 'rgb(0, 255, 0)'; // Default, updated in draw
  }

  init() {
    // Set resolution
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;

    // Init terrain (flat line initially)
    const pointsNeeded = Math.ceil(this.canvas.width / this.segmentWidth) + 2;
    this.terrainPoints = new Array(pointsNeeded).fill(this.canvas.height * 0.75);

    // Init clouds
    this.clouds = [];
    const cloudCount = 5;
    for (let i = 0; i < cloudCount; i++) {
      this.clouds.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * (this.canvas.height * 0.5),
        size: 20 + Math.random() * 30,
        speedFactor: 0.5 + Math.random() * 0.5
      });
    }
  }

  updateFrequencies(low, mid, high) {
    this.low = low;
    this.mid = mid;
    this.high = high;
  }

  start() {
    this.init();
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

  // Helper for linear interpolation
  lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
  }

  draw = () => {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Read CSS variable for color
    const style = getComputedStyle(this.canvas);
    const primaryColor = style.getPropertyValue('--color-primary').trim() || '#0f0';
    const bgColor = style.getPropertyValue('--color-bg').trim() || '#000';
    
    // Smooth audio values
    this.smoothedLow = this.lerp(this.smoothedLow, this.low, 0.1);
    this.smoothedMid = this.lerp(this.smoothedMid, this.mid, 0.1);
    this.smoothedHigh = this.lerp(this.smoothedHigh, this.high, 0.1);

    // Clear
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2;

    // --- 1. Update & Draw Terrain ---
    
    // Scroll terrain logic: shift points left
    // The "roughness" of new terrain depends on LOW frequency
    const baseHeight = height * 0.75;
    const roughness = 5 + (this.smoothedLow * 1.2); // More bass = rockier
    
    // Remove first point, add new point at end
    this.terrainPoints.shift();
    
    // Generate new height with some Perlin-ish smooth noise logic (simplified)
    const lastPoint = this.terrainPoints[this.terrainPoints.length - 1] || baseHeight;
    let nextHeight = lastPoint + (Math.random() * roughness * 2 - roughness);
    
    // Clamp to keep on screen
    if (nextHeight > height - 10) nextHeight = height - 10;
    if (nextHeight < height * 0.5) nextHeight = height * 0.5;
    
    // Tendency to return to baseline to prevent wandering off screen
    nextHeight = this.lerp(nextHeight, baseHeight, 0.05);
    
    this.terrainPoints.push(nextHeight);

    // Draw Terrain Path
    ctx.beginPath();
    ctx.moveTo(0, this.terrainPoints[0]);
    for (let i = 1; i < this.terrainPoints.length; i++) {
      // Draw slightly jagged lines for retro feel
      ctx.lineTo(i * this.segmentWidth, this.terrainPoints[i]);
    }
    ctx.stroke();

    // --- 2. Calculate Tank Position ---
    
    const centerX = width / 2;
    const centerIndex = Math.floor(centerX / this.segmentWidth);
    
    // Average height under tank to avoid jitter
    let avgHeight = 0;
    const sampleWidth = Math.floor(this.tankWidth / this.segmentWidth);
    let samples = 0;
    for(let i = -sampleWidth/2; i < sampleWidth/2; i++) {
        const idx = centerIndex + i;
        if(idx >= 0 && idx < this.terrainPoints.length) {
            avgHeight += this.terrainPoints[idx];
            samples++;
        }
    }
    const tankY = (samples > 0) ? avgHeight / samples : baseHeight;

    // Determine angle (slope) of tank based on terrain
    const prevH = this.terrainPoints[centerIndex - 3] || tankY;
    const nextH = this.terrainPoints[centerIndex + 3] || tankY;
    const slope = Math.atan2(nextH - prevH, this.segmentWidth * 6);

    // --- 3. Draw Tank ---
    
    ctx.save();
    ctx.translate(centerX, tankY - 10); // -10 to sit on top of line
    ctx.rotate(slope);

    // Draw Treads (animated dashed line)
    this.treadOffset -= (this.speed * 0.5); 
    if(this.treadOffset < -20) this.treadOffset = 0;

    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = this.treadOffset;
    ctx.strokeRect(-this.tankWidth/2, -10, this.tankWidth, 20); // Treads rect
    ctx.setLineDash([]); // Reset

    // Tank Body
    ctx.fillStyle = bgColor;
    ctx.fillRect(-this.tankWidth/2 + 5, -25, this.tankWidth - 10, 15);
    ctx.strokeRect(-this.tankWidth/2 + 5, -25, this.tankWidth - 10, 15);

    // Turret
    ctx.fillRect(-15, -40, 30, 15);
    ctx.strokeRect(-15, -40, 30, 15);

    // Barrel (Recoil based on Low/Kick)
    const recoil = this.smoothedLow > 80 ? 5 : 0;
    ctx.beginPath();
    ctx.moveTo(15, -32);
    ctx.lineTo(50 - recoil, -32);
    ctx.stroke();

    ctx.restore();

    // --- 4. Draw Clouds (Background) ---
    // MID determines speed, HIGH determines Glow/Size
    
    const cloudSpeed = 0.5 + (this.smoothedMid / 20); // Mid makes clouds faster
    const cloudPulse = 1 + (this.smoothedHigh / 100); // High makes them bigger
    
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 1;
    
    for (let c of this.clouds) {
      // Move
      c.x -= (c.speedFactor * cloudSpeed);
      if (c.x + c.size * 2 < 0) {
        c.x = width + c.size;
        c.y = Math.random() * (height * 0.4);
      }

      // Draw Cloud (simple ellipses)
      const size = c.size * cloudPulse;
      ctx.beginPath();
      ctx.arc(c.x, c.y, size * 0.6, 0, Math.PI * 2);
      ctx.arc(c.x + size*0.5, c.y - size*0.2, size * 0.7, 0, Math.PI * 2);
      ctx.arc(c.x - size*0.5, c.y - size*0.2, size * 0.7, 0, Math.PI * 2);
      // Simple dithering effect for retro look? Just outline for now.
      ctx.stroke();
    }

    this.frameId = requestAnimationFrame(this.draw);
  }
}