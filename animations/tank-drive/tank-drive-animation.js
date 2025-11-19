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

    // Settings
    this.settings = this.config.settings || {};
    this.speed = this.settings.speed || 1.0; // Pixels per frame (Lower = Slower)

    this.segmentWidth = 20; // Smoothness of terrain
    this.bgSegmentWidth = 50; // Smoothness of mountains

    // State
    this.terrainPoints = [];
    this.scrollOffset = 0;

    this.bgPoints = [];
    this.bgScrollOffset = 0;

    this.clouds = [];

    // Tank dimensions
    this.tankWidth = 80;
    this.tankHeight = 40;
    this.treadOffset = 0;
  }

  init() {
    const rect = this.canvas.getBoundingClientRect();

    // Safety check: If canvas has no size yet, don't init (wait for next frame)
    if (rect.width === 0 || rect.height === 0) return;

    this.canvas.width = rect.width;
    this.canvas.height = rect.height;

    // 1. Init Foreground Terrain
    // Add extra points for buffer
    const count = Math.ceil(this.canvas.width / this.segmentWidth) + 5;
    this.terrainPoints = new Array(count).fill(this.canvas.height * 0.75);

    // Pre-seed roughness
    for (let i = 1; i < count; i++) {
      this.terrainPoints[i] = this.generateNextPoint(this.terrainPoints[i - 1]);
    }

    // 2. Init Background Mountains
    const bgCount = Math.ceil(this.canvas.width / this.bgSegmentWidth) + 5;
    this.bgPoints = []; // Reset
    let bgY = this.canvas.height * 0.6;
    for (let i = 0; i < bgCount; i++) {
      bgY += (Math.random() * 40 - 20);
      if (bgY < this.canvas.height * 0.3) bgY = this.canvas.height * 0.3;
      if (bgY > this.canvas.height * 0.8) bgY = this.canvas.height * 0.8;
      this.bgPoints.push(bgY);
    }

    // 3. Init Clouds
    this.clouds = [];
    const cloudCount = 6;
    for (let i = 0; i < cloudCount; i++) {
      this.clouds.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * (this.canvas.height * 0.4),
        size: 30 + Math.random() * 30,
        speedFactor: 0.2 + Math.random() * 0.3
      });
    }
  }

  generateNextPoint(prevHeight, roughnessOverride = null) {
    const h = this.canvas.height;
    const baseHeight = h * 0.75;

    // Audio reactivity: Low freq = rougher terrain
    const roughness = roughnessOverride !== null ? roughnessOverride : (5 + (this.smoothedLow * 0.2));

    let next = prevHeight + (Math.random() * roughness * 2 - roughness);

    // Clamp to keep on screen
    if (next > h - 20) next = h - 20;
    if (next < h * 0.5) next = h * 0.5;

    // Gravity: Return to baseline
    next = next + (baseHeight - next) * 0.05;

    return next;
  }

  updateFrequencies(low, mid, high) {
    this.low = low;
    this.mid = mid;
    this.high = high;
  }

  start() {
    // Call init here to ensure canvas has dimensions
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

  lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
  }

  draw = () => {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // If init failed (width=0), try again
    if (width === 0 || this.terrainPoints.length === 0) {
      this.init();
      this.frameId = requestAnimationFrame(this.draw);
      return;
    }

    // Colors
    const style = getComputedStyle(this.canvas);
    const primaryColor = style.getPropertyValue('--color-primary').trim() || '#0f0';
    const bgColor = style.getPropertyValue('--color-bg').trim() || '#000';

    // Smooth Audio
    this.smoothedLow = this.lerp(this.smoothedLow, this.low, 0.1);
    this.smoothedMid = this.lerp(this.smoothedMid, this.mid, 0.1);
    this.smoothedHigh = this.lerp(this.smoothedHigh, this.high, 0.1);

    // 1. SCROLL UPDATES

    // Foreground
    this.scrollOffset += this.speed;
    while (this.scrollOffset >= this.segmentWidth) {
      this.scrollOffset -= this.segmentWidth;
      // Remove first
      this.terrainPoints.shift();
      // Add new at end
      const last = this.terrainPoints[this.terrainPoints.length - 1];
      this.terrainPoints.push(this.generateNextPoint(last));
    }

    // Background
    this.bgScrollOffset += (this.speed * 0.2); // 20% speed
    while (this.bgScrollOffset >= this.bgSegmentWidth) {
      this.bgScrollOffset -= this.bgSegmentWidth;
      this.bgPoints.shift();
      const lastBg = this.bgPoints[this.bgPoints.length - 1];
      let nextBg = lastBg + (Math.random() * 30 - 15);
      if (nextBg < height * 0.3) nextBg = height * 0.3;
      if (nextBg > height * 0.8) nextBg = height * 0.8;
      this.bgPoints.push(nextBg);
    }


    // 2. DRAWING
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Draw Clouds
    const cloudSpeed = 0.2 + (this.smoothedMid / 50);
    const cloudPulse = 1 + (this.smoothedHigh / 150);
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 1;

    for (let c of this.clouds) {
      c.x -= (c.speedFactor * cloudSpeed);
      if (c.x + c.size * 2 < 0) {
        c.x = width + c.size;
        c.y = Math.random() * (height * 0.5);
      }
      const size = c.size * cloudPulse;
      ctx.beginPath();
      ctx.arc(c.x, c.y, size * 0.6, 0, Math.PI * 2);
      ctx.arc(c.x + size * 0.5, c.y - size * 0.2, size * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw Mountains (Background)
    ctx.fillStyle = primaryColor;
    ctx.globalAlpha = 0.2; // Faint
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let i = 0; i < this.bgPoints.length; i++) {
      const x = (i * this.bgSegmentWidth) - this.bgScrollOffset - this.bgSegmentWidth;
      ctx.lineTo(x, this.bgPoints[i]);
    }
    ctx.lineTo(width, height);
    ctx.fill();
    ctx.globalAlpha = 1.0;


    // Draw Terrain (Foreground)
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < this.terrainPoints.length; i++) {
      const x = (i * this.segmentWidth) - this.scrollOffset - this.segmentWidth;
      if (i === 0) ctx.moveTo(x, this.terrainPoints[i]);
      else ctx.lineTo(x, this.terrainPoints[i]);
    }
    ctx.stroke();

    // Mask under terrain
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.fillStyle = bgColor;
    ctx.fill();


    // Draw Tank
    const cx = width / 2;

    // Calculate Tank Y and Slope
    const relativeX = cx + this.scrollOffset + this.segmentWidth;
    const index = Math.floor(relativeX / this.segmentWidth);
    const remainder = (relativeX % this.segmentWidth) / this.segmentWidth;

    // Interpolate Y
    const p1 = this.terrainPoints[index] || height * 0.75;
    const p2 = this.terrainPoints[index + 1] || p1;
    const tankY = this.lerp(p1, p2, remainder);

    // Calculate Slope
    const pPrev = this.terrainPoints[index - 1] || p1;
    const pNext = this.terrainPoints[index + 2] || p2;
    const slope = Math.atan2(pNext - pPrev, this.segmentWidth * 3);

    ctx.save();
    ctx.translate(cx, tankY - 12);
    ctx.rotate(slope);

    // Treads
    this.treadOffset -= (this.speed * 0.8);
    if (this.treadOffset < -10) this.treadOffset = 0;

    ctx.strokeStyle = primaryColor;
    ctx.fillStyle = bgColor;

    ctx.setLineDash([3, 3]);
    ctx.lineDashOffset = this.treadOffset;
    ctx.strokeRect(-this.tankWidth / 2, -8, this.tankWidth, 16);
    ctx.setLineDash([]);

    // Hull
    ctx.fillStyle = bgColor;
    ctx.fillRect(-this.tankWidth / 2 + 5, -22, this.tankWidth - 10, 14);
    ctx.strokeRect(-this.tankWidth / 2 + 5, -22, this.tankWidth - 10, 14);

    // Turret
    ctx.fillRect(-15, -36, 30, 14);
    ctx.strokeRect(-15, -36, 30, 14);

    // Barrel
    const recoil = this.smoothedLow > 60 ? (this.smoothedLow - 60) * 0.2 : 0;
    ctx.beginPath();
    ctx.moveTo(15, -30);
    ctx.lineTo(55 - recoil, -30);
    ctx.stroke();

    // Kick
    if (this.smoothedLow > 80) {
      ctx.fillStyle = primaryColor;
      ctx.beginPath();
      ctx.arc(60 - recoil, -30, Math.random() * 8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    this.frameId = requestAnimationFrame(this.draw);
  }
}