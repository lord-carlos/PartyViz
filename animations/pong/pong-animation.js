export class PongAnimation {
  constructor(canvas, config) {
    console.log('[pong] Constructor called');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = config || {};
    this.frameId = null;
    
    // Audio frequency values
    this.LOW = 0;
    this.MID = 0;
    this.HIGH = 0;
    
    // Names for explosions
    this.names = ["UNKNOWN", "BOGEY", "TARGET"]; // Fallbacks
    this.fetchNames();
    
    // Game elements
    this.ball = {
      x: 0,
      y: 0,
      radius: 10,
      speedX: 5,
      speedY: 3,
      trail: []
    };
    
    this.leftPaddle = {
      x: 30,
      y: 0,
      width: 15,
      height: 80,
      speed: 0,
      targetY: 0
    };
    
    this.rightPaddle = {
      x: 0,
      y: 0,
      width: 15,
      height: 80,
      speed: 0,
      targetY: 0
    };
    
    // Explosion particles
    this.particles = [];
    this.maxParticles = 50;
    
    // Background stars
    this.stars = [];
    this.maxStars = 50;
    
    // Name display
    this.nameDisplay = {
      text: '',
      x: 0,
      y: 0,
      opacity: 0,
      scale: 0
    };
    
    console.log('[pong] Constructor completed');
  }
  
  async fetchNames() {
    console.log('[pong] Fetching names...');
    try {
      const res = await fetch('./names.json');
      const data = await res.json();
      if (data.names && Array.isArray(data.names)) {
        this.names = data.names;
        console.log('[pong] Names loaded successfully:', this.names.length, 'names');
      }
    } catch (e) {
      console.warn("[pong] Could not load names.json", e);
    }
  }
  
  init() {
    console.log('[pong] Initializing game...');
    
    // Initialize ball position
    this.resetBall();
    
    // Initialize paddle positions
    this.leftPaddle.y = this.canvas.height / 2 - this.leftPaddle.height / 2;
    this.leftPaddle.targetY = this.leftPaddle.y;
    this.rightPaddle.x = this.canvas.width - 30 - this.rightPaddle.width;
    this.rightPaddle.y = this.canvas.height / 2 - this.rightPaddle.height / 2;
    this.rightPaddle.targetY = this.rightPaddle.y;
    
    // Initialize background stars
    this.stars = [];
    for (let i = 0; i < this.maxStars; i++) {
      this.stars.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        radius: Math.random() * 1.5,
        speed: Math.random() * 0.5 + 0.1,
        opacity: Math.random() * 0.5 + 0.2
      });
    }
    
    console.log('[pong] Game initialized, canvas size:', this.canvas.width, 'x', this.canvas.height);
  }
  
  resetBall() {
    this.ball.x = this.canvas.width / 2;
    this.ball.y = this.canvas.height / 2;
    this.ball.speedX = (Math.random() > 0.5 ? 1 : -1) * 5;
    this.ball.speedY = (Math.random() - 0.5) * 6;
    this.ball.trail = [];
  }
  
  createExplosion(x, y) {
    // Ensure y is within canvas bounds
    y = Math.max(50, Math.min(this.canvas.height - 50, y));
    
    console.log('[pong] Creating explosion at', x, ',', y);
    
    // Get a random name
    const randomName = this.names[Math.floor(Math.random() * this.names.length)];
    console.log('[pong] Displaying name:', randomName);
    
    // Set name display
    this.nameDisplay.text = randomName;
    this.nameDisplay.x = x;
    this.nameDisplay.y = y;
    this.nameDisplay.opacity = 1;
    this.nameDisplay.scale = 0.1;
    
    // Create particles
    for (let i = 0; i < this.maxParticles; i++) {
      const angle = (Math.PI * 2 * i) / this.maxParticles;
      const speed = Math.random() * 5 + 2;
      
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Math.random() * 3 + 1,
        life: 1,
        decay: Math.random() * 0.02 + 0.01
      });
    }
  }
  
  updatePaddles() {
    // Apply audio reactivity to paddle size
    const paddleHeightModifier = 1 + (this.LOW / 100) * 0.5;
    this.leftPaddle.height = 80 * paddleHeightModifier;
    this.rightPaddle.height = 80 * paddleHeightModifier;
    
    // Left paddle AI - less perfect than right paddle
    // Predict where ball will be with some error margin
    const predictionError = (Math.random() - 0.5) * 100; // Add some randomness
    const ballPredictedY = this.ball.y + this.ball.speedY * 10 + predictionError;
    this.leftPaddle.targetY = ballPredictedY - this.leftPaddle.height / 2;
    
    // Right paddle AI - more accurate
    this.rightPaddle.targetY = this.ball.y - this.rightPaddle.height / 2;
    
    // Calculate speeds with smoothing
    const leftDiff = this.leftPaddle.targetY - this.leftPaddle.y;
    const rightDiff = this.rightPaddle.targetY - this.rightPaddle.y;
    
    // Left paddle is slightly slower (more challenging)
    this.leftPaddle.speed = leftDiff * 0.08;
    // Right paddle is faster
    this.rightPaddle.speed = rightDiff * 0.12;
    
    // Update positions
    this.leftPaddle.y += this.leftPaddle.speed;
    this.rightPaddle.y += this.rightPaddle.speed;
    
    // Keep paddles in bounds
    this.leftPaddle.y = Math.max(0, Math.min(this.canvas.height - this.leftPaddle.height, this.leftPaddle.y));
    this.rightPaddle.y = Math.max(0, Math.min(this.canvas.height - this.rightPaddle.height, this.rightPaddle.y));
  }
  
  updateBall() {
    // Apply audio reactivity to ball speed
    const speedModifier = 1 + (this.MID / 100) * 0.5;
    
    // Update trail
    this.ball.trail.push({ x: this.ball.x, y: this.ball.y });
    if (this.ball.trail.length > 10) {
      this.ball.trail.shift();
    }
    
    // Update position
    this.ball.x += this.ball.speedX * speedModifier;
    this.ball.y += this.ball.speedY * speedModifier;
    
    // Top and bottom collision
    if (this.ball.y - this.ball.radius < 0) {
      this.ball.speedY = Math.abs(this.ball.speedY);
      this.ball.y = this.ball.radius;
    } else if (this.ball.y + this.ball.radius > this.canvas.height) {
      this.ball.speedY = -Math.abs(this.ball.speedY);
      this.ball.y = this.canvas.height - this.ball.radius;
    }
    
    // Left paddle collision
    if (
      this.ball.x - this.ball.radius < this.leftPaddle.x + this.leftPaddle.width &&
      this.ball.x + this.ball.radius > this.leftPaddle.x &&
      this.ball.y - this.ball.radius < this.leftPaddle.y + this.leftPaddle.height &&
      this.ball.y + this.ball.radius > this.leftPaddle.y
    ) {
      this.ball.speedX = Math.abs(this.ball.speedX);
      this.createExplosion(this.leftPaddle.x + this.leftPaddle.width, this.ball.y);
    }
    
    // Right paddle collision
    if (
      this.ball.x - this.ball.radius < this.rightPaddle.x + this.rightPaddle.width &&
      this.ball.x + this.ball.radius > this.rightPaddle.x &&
      this.ball.y - this.ball.radius < this.rightPaddle.y + this.rightPaddle.height &&
      this.ball.y + this.ball.radius > this.rightPaddle.y
    ) {
      this.ball.speedX = -Math.abs(this.ball.speedX);
      this.createExplosion(this.rightPaddle.x, this.ball.y);
    }
    
    // Score - ball out of bounds
    if (this.ball.x < 0 || this.ball.x > this.canvas.width) {
      this.resetBall();
    }
  }
  
  updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      
      // Apply audio reactivity to particles
      if (this.HIGH > 50) {
        p.vx *= 1.02;
        p.vy *= 1.02;
      }
      
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }
  
  updateStars() {
    for (const star of this.stars) {
      star.x -= star.speed;
      
      if (star.x < 0) {
        star.x = this.canvas.width;
        star.y = Math.random() * this.canvas.height;
      }
    }
  }
  
  updateNameDisplay() {
    if (this.nameDisplay.opacity > 0) {
      this.nameDisplay.opacity -= 0.01;
      this.nameDisplay.scale = Math.min(1, this.nameDisplay.scale + 0.05);
    }
  }
  
  drawBackground(ctx, colorBg, colorPrimary) {
    // Clear canvas
    ctx.fillStyle = colorBg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw stars
    ctx.fillStyle = colorPrimary;
    for (const star of this.stars) {
      ctx.globalAlpha = star.opacity;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    
    // Draw center line
    ctx.strokeStyle = colorPrimary;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(this.canvas.width / 2, 0);
    ctx.lineTo(this.canvas.width / 2, this.canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  
  drawPaddles(ctx, colorPrimary) {
    ctx.fillStyle = colorPrimary;
    
    // Left paddle
    ctx.fillRect(
      this.leftPaddle.x,
      this.leftPaddle.y,
      this.leftPaddle.width,
      this.leftPaddle.height
    );
    
    // Right paddle
    ctx.fillRect(
      this.rightPaddle.x,
      this.rightPaddle.y,
      this.rightPaddle.width,
      this.rightPaddle.height
    );
  }
  
  drawBall(ctx, colorPrimary) {
    // Draw trail
    ctx.strokeStyle = colorPrimary;
    for (let i = 0; i < this.ball.trail.length; i++) {
      const point = this.ball.trail[i];
      ctx.globalAlpha = i / this.ball.trail.length * 0.5;
      ctx.beginPath();
      ctx.arc(point.x, point.y, this.ball.radius * (i / this.ball.trail.length), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    
    // Draw ball with glow effect based on high frequencies
    if (this.HIGH > 70) {
      ctx.shadowBlur = 20;
      ctx.shadowColor = colorPrimary;
    }
    
    ctx.fillStyle = colorPrimary;
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowBlur = 0;
  }
  
  drawParticles(ctx, colorPrimary) {
    for (const p of this.particles) {
      ctx.fillStyle = colorPrimary;
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  
  drawNameDisplay(ctx, colorPrimary) {
    if (this.nameDisplay.opacity > 0) {
      ctx.save();
      ctx.globalAlpha = this.nameDisplay.opacity;
      ctx.fillStyle = colorPrimary;
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      ctx.translate(this.nameDisplay.x, this.nameDisplay.y);
      ctx.scale(this.nameDisplay.scale, this.nameDisplay.scale);
      
      ctx.fillText(this.nameDisplay.text, 0, 0);
      
      ctx.restore();
    }
  }
  
  draw = () => {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    // Get CSS colors
    const style = getComputedStyle(this.canvas);
    const colorPrimary = style.getPropertyValue('--color-primary').trim() || '#0f0';
    const colorBg = style.getPropertyValue('--color-bg').trim() || '#000';
    
    // Update game state
    this.updatePaddles();
    this.updateBall();
    this.updateParticles();
    this.updateStars();
    this.updateNameDisplay();
    
    // Draw everything
    this.drawBackground(ctx, colorBg, colorPrimary);
    this.drawPaddles(ctx, colorPrimary);
    this.drawBall(ctx, colorPrimary);
    this.drawParticles(ctx, colorPrimary);
    this.drawNameDisplay(ctx, colorPrimary);
    
    // Continue animation loop
    this.frameId = requestAnimationFrame(this.draw);
  }
  
  updateFrequencies(low, mid, high) {
    this.LOW = low;
    this.MID = mid;
    this.HIGH = high;
  }
  
  start() {
    console.log('[pong] Starting animation...');
    
    // Handle Resolution
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    
    console.log('[pong] Canvas size set to:', this.canvas.width, 'x', this.canvas.height);
    
    // Initialize game state
    this.init();
    
    if (!this.frameId) {
      console.log('[pong] Starting animation frame loop');
      this.frameId = requestAnimationFrame(this.draw);
    } else {
      console.log('[pong] Animation already running');
    }
  }
  
  stop() {
    console.log('[pong] Stopping animation...');
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    window.removeEventListener('resize', this.resizeCanvas);
  }
}