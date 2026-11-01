export class PongAnimation {
  constructor(canvas, config) {
    console.log('[pong] Constructor called (Juicy Version)');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = config || {};
    this.frameId = null;

    // Per-animation settings from animations.yml
    const settings = this.config.settings || {};
    this.basePaddleSpeed = Number(settings.paddleSpeed) || 5;
    this.baseBallSpeed = Number(settings.ballSpeed) || 5;
    this.particleLimit = Number(settings.particleCount) || 50;
    this.width = 0;
    this.height = 0;
    this._resizeHandler = () => {
      this.resize();
      this.init();
    };
    
    // Audio frequency values
    this.LOW = 0;
    this.MID = 0;
    this.HIGH = 0;
    
    this.names = ["UNKNOWN", "BOGEY", "TARGET"]; 
    this.fetchNames();
    
    // Visual "Juice" State
    this.shakeIntensity = 0;
    this.hue = 120; // Base green hue
    
    // Game elements
    this.ball = {
      x: 0, y: 0, radius: 8,
      speedX: 5, speedY: 3,
      trail: [],
      trailIndex: 0,
      trailCount: 0
    };
    for (let i = 0; i < 20; i++) this.ball.trail.push({ x: 0, y: 0 });
    
    this.leftPaddle = { x: 30, y: 0, width: 15, height: 80, speed: 0, targetY: 0 };
    this.rightPaddle = { x: 0, y: 0, width: 15, height: 80, speed: 0, targetY: 0 };
    
    // Particle Systems
    this.particles = [];
    this.shockwaves = []; // Expanding rings
    this.floatingNames = []; // Names that float and explode
    this.gridOffset = 0;  // For background movement
    
    console.log('[pong] Constructor completed');
  }
  
  async fetchNames() {
    try {
      const res = await fetch('./names.json');
      const data = await res.json();
      if (data.names && Array.isArray(data.names)) {
        this.names = data.names;
      }
    } catch (e) {
      // Silent fail, use defaults
    }
  }
  
  init() {
    this.resetBall();
    
    // Initialize paddle positions
    this.leftPaddle.y = this.height / 2 - 40;
    this.leftPaddle.targetY = this.leftPaddle.y;
    this.rightPaddle.x = this.width - 45;
    this.rightPaddle.y = this.height / 2 - 40;
    this.rightPaddle.targetY = this.rightPaddle.y;
  }
  
  resetBall() {
    this.ball.x = this.width / 2;
    this.ball.y = this.height / 2;
    // Start faster for more excitement
    this.ball.speedX = (Math.random() > 0.5 ? 1 : -1) * (this.baseBallSpeed + 2);
    this.ball.speedY = (Math.random() - 0.5) * 8;
    this.ball.trailCount = 0;
    this.ball.trailIndex = 0;
  }
  
  // --- CORE MECHANICS ---
  
  createImpact(x, y, direction) {
    // 1. Screen Shake
    this.shakeIntensity = 10 + (this.LOW / 5); // Bass makes it shake harder

    // 2. Shockwave
    this.shockwaves.push({
      x: x, y: y, radius: 1, alpha: 1, width: 5
    });

    // 3. Floating Name (The "Pop out" effect)
    const randomName = this.names[Math.floor(Math.random() * this.names.length)];
    
    // Calculate velocity to throw name towards center of screen
    const throwDir = direction === 'left' ? 1 : -1;
    
    this.floatingNames.push({
      text: randomName,
      x: x + (throwDir * 20), // Start slightly offset
      y: y,
      vx: throwDir * (3 + Math.random() * 3), // Fly towards center
      vy: (Math.random() - 0.5) * 4,          // Slight up/down drift
      life: 120, // Frames to live (approx 2 seconds)
      scale: 0.5,
      maxScale: 1.5,
      color: `hsl(${this.hue + 60}, 100%, 70%)` // Complementary color
    });

    // 4. Explosion Particles (Sparks)
    const particleCount = Math.min(this.particleLimit, Math.round(20 + (this.HIGH / 5)));
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const speed = Math.random() * 5 + 2;
      this.particles.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed + (direction === 'left' ? 2 : -2), // Add momentum
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: Math.random() * 0.03 + 0.01,
        color: 'white'
      });
    }
  }

  // When a name dies, it explodes into text particles
  explodeName(nameObj) {
    for (let i = 0; i < 15; i++) {
      this.particles.push({
        x: nameObj.x + (Math.random() - 0.5) * 60, // Spread across text width
        y: nameObj.y,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        life: 1,
        decay: 0.02,
        color: nameObj.color,
        size: Math.random() * 3 + 1
      });
    }
  }

  updatePaddles() {
    // Audio reactivity: Paddles pulse in size with Bass
    const sizeMod = (this.LOW / 100) * 40;
    this.leftPaddle.height = 80 + sizeMod;
    this.rightPaddle.height = 80 + sizeMod;
    
    // AI Logic
    const predictionNoise = 50 - (this.HIGH / 5); // High freq makes AI more accurate (less noise)
    
    this.leftPaddle.targetY = this.ball.y - this.leftPaddle.height / 2 + (Math.random() * predictionNoise - predictionNoise/2);
    this.rightPaddle.targetY = this.ball.y - this.rightPaddle.height / 2;
    
    // Smooth movement (Lerp)
    const paddleLerp = Math.min(0.35, this.basePaddleSpeed / 50);
    this.leftPaddle.y += (this.leftPaddle.targetY - this.leftPaddle.y) * paddleLerp;
    this.rightPaddle.y += (this.rightPaddle.targetY - this.rightPaddle.y) * paddleLerp;
    
    // Constraints
    const maxY = this.height - this.leftPaddle.height;
    this.leftPaddle.y = Math.max(0, Math.min(maxY, this.leftPaddle.y));
    this.rightPaddle.y = Math.max(0, Math.min(maxY, this.rightPaddle.y));
  }
  
  updateBall() {
    const speedMod = 1;
    
    const trail = this.ball.trail;
    const point = trail[this.ball.trailIndex];
    point.x = this.ball.x;
    point.y = this.ball.y;
    this.ball.trailIndex = (this.ball.trailIndex + 1) % trail.length;
    if (this.ball.trailCount < trail.length) this.ball.trailCount++;
    
    this.ball.x += this.ball.speedX * speedMod;
    this.ball.y += this.ball.speedY * speedMod;
    
    // Wall collisions
    if (this.ball.y < 0 || this.ball.y > this.height) {
      this.ball.speedY *= -1;
      this.ball.y = Math.max(0, Math.min(this.height, this.ball.y));
      // Small wall bump sound effect visual
      this.shakeIntensity = 2;
    }
    
    // Paddle Collisions
    // Check Left
    if (this.ball.x - this.ball.radius < this.leftPaddle.x + this.leftPaddle.width &&
        this.ball.x > this.leftPaddle.x &&
        this.ball.y > this.leftPaddle.y && 
        this.ball.y < this.leftPaddle.y + this.leftPaddle.height) {
          if (this.ball.speedX < 0) {
             this.ball.speedX *= -1.05; // Speed up on hit
             this.createImpact(this.leftPaddle.x + this.leftPaddle.width, this.ball.y, 'left');
          }
    }
    
    // Check Right
    if (this.ball.x + this.ball.radius > this.rightPaddle.x &&
        this.ball.x < this.rightPaddle.x + this.rightPaddle.width &&
        this.ball.y > this.rightPaddle.y && 
        this.ball.y < this.rightPaddle.y + this.rightPaddle.height) {
          if (this.ball.speedX > 0) {
             this.ball.speedX *= -1.05; // Speed up on hit
             this.createImpact(this.rightPaddle.x, this.ball.y, 'right');
          }
    }
    
    // Score / Reset
    if (this.ball.x < 0 || this.ball.x > this.width) {
      this.shakeIntensity = 20; // Big shake on score
      this.resetBall();
    }
  }
  
  updateVisuals() {
    // Update Shake
    if (this.shakeIntensity > 0) this.shakeIntensity *= 0.9;
    if (this.shakeIntensity < 0.5) this.shakeIntensity = 0;
    
    // Update Color Hue based on music
    this.hue = (this.hue + (this.HIGH / 100)) % 360;
    
    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    
    // Update Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.radius += 5 + (this.HIGH / 10); // High freq makes waves fast
      s.alpha -= 0.05;
      if (s.alpha <= 0) this.shockwaves.splice(i, 1);
    }
    
    // Update Floating Names
    for (let i = this.floatingNames.length - 1; i >= 0; i--) {
      const n = this.floatingNames[i];
      
      // Physics: Move, but apply friction to stop them in center
      n.x += n.vx;
      n.y += n.vy;
      n.vx *= 0.92; // Friction
      n.vy *= 0.92;
      
      // Grow in size
      if (n.scale < n.maxScale) n.scale += 0.05;
      
      n.life--;
      
      // Death condition
      if (n.life <= 0) {
        this.explodeName(n);
        this.floatingNames.splice(i, 1);
      }
    }
    
    // Update Grid (Parallax effect)
    this.gridOffset = (this.gridOffset + 1 + (this.LOW / 80)) % 40;
  }
  
  // --- DRAWING ---
  
  drawGrid(ctx, color) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.1 + (this.LOW / 300); // Bass controls grid brightness
    ctx.lineWidth = 1;
    
    const gridSize = 40;
    ctx.beginPath();
    
    // Vertical lines
    for (let x = 0; x <= this.width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
    }
    
    // Horizontal lines (moving)
    for (let y = this.gridOffset; y <= this.height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  
  draw = () => {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    
    this.updatePaddles();
    this.updateBall();
    this.updateVisuals();
    
    // Base colors from CSS or dynamic Hue
    const mainColor = `hsl(${this.hue}, 80%, 50%)`;
    const glowColor = `hsl(${this.hue}, 80%, 70%)`;
    
    // CLEAR + TRAIL EFFECT (Use minimal opacity black for trails)
    ctx.fillStyle = 'rgba(5, 5, 16, 0.3)'; // Creates trails for everything
    ctx.fillRect(0, 0, w, h);
    
    ctx.save();
    
    // APPLY SCREEN SHAKE
    if (this.shakeIntensity > 0) {
      const dx = (Math.random() - 0.5) * this.shakeIntensity;
      const dy = (Math.random() - 0.5) * this.shakeIntensity;
      ctx.translate(dx, dy);
    }
    
    // Draw Grid Background
    this.drawGrid(ctx, mainColor);
    
    // Draw Paddles (With Glow)
    ctx.shadowBlur = 15;
    ctx.shadowColor = mainColor;
    ctx.fillStyle = 'white';
    ctx.fillRect(this.leftPaddle.x, this.leftPaddle.y, this.leftPaddle.width, this.leftPaddle.height);
    ctx.fillRect(this.rightPaddle.x, this.rightPaddle.y, this.rightPaddle.width, this.rightPaddle.height);
    ctx.shadowBlur = 0;
    
    // Draw Shockwaves
    ctx.lineWidth = 3;
    for (const s of this.shockwaves) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${s.alpha})`;
      ctx.stroke();
    }
    
    // Draw Ball Trail (ring buffer, oldest -> newest)
    const trail = this.ball.trail;
    const count = this.ball.trailCount;
    for (let i = 0; i < count; i++) {
      const index = (this.ball.trailIndex - count + i + trail.length) % trail.length;
      const t = trail[index];
      const size = (i / trail.length) * this.ball.radius;
      ctx.fillStyle = mainColor;
      ctx.globalAlpha = i / trail.length;
      ctx.beginPath();
      ctx.arc(t.x, t.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    
    // Draw Ball
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw Floating Names
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of this.floatingNames) {
      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.scale(n.scale, n.scale);
      
      // Glitch effect for text
      const glitchX = (Math.random() - 0.5) * (this.HIGH / 20);
      
      ctx.fillStyle = n.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = n.color;
      ctx.fillText(n.text, glitchX, 0);
      
      ctx.restore();
    }
    
    // Draw Particles
    for (const p of this.particles) {
      ctx.fillStyle = p.color || mainColor;
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size || 2, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
    this.frameId = requestAnimationFrame(this.draw);
  }
  
  updateFrequencies(low, mid, high) {
    this.LOW = low;
    this.MID = mid;
    this.HIGH = high;
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
    this.init();
    window.addEventListener('resize', this._resizeHandler);
    if (!this.frameId) this.frameId = requestAnimationFrame(this.draw);
  }
  
  stop() {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    window.removeEventListener('resize', this._resizeHandler);
  }
}