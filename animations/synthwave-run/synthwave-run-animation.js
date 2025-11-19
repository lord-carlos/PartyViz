export class SynthwaveRunAnimation {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = config || {};
    this.frameId = null;

    // Audio State
    this.low = 0;
    this.mid = 0;
    this.high = 0;

    // Game State
    this.state = 'BOOT'; // BOOT or RUN
    this.bootTimer = 0;
    this.score = 0;
    this.speed = 0;

    // Data
    this.names = ["NEO", "TRINITY", "MORPHEUS", "CYPHER"]; // Default
    this.entities = []; // Floating objects
    this.stars = [];
    this.mountainPoints = [];

    // 3D Camera Settings
    this.camHeight = 100;
    this.horizonY = 0; // Set in init
    this.fov = 250;

    // Colors
    this.colorGrid = '#ff00ff'; // Magenta
    this.colorSun = '#ffcc00';  // Sunset Yellow

    // DOM Elements
    this.elSpeed = canvas.parentElement.querySelector('#synth-speed');
    this.elScore = canvas.parentElement.querySelector('#synth-score-val');
    this.elSys = canvas.parentElement.querySelector('#synth-sys');

    this.fetchNames();
  }

  async fetchNames() {
    try {
      const res = await fetch('./names.json');
      const data = await res.json();
      if (data.names) this.names = data.names;
    } catch (e) { console.log('Using default names'); }
  }

  init() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.horizonY = h * 0.45; // Horizon line height

    // Generate Stars
    this.stars = [];
    for (let i = 0; i < 100; i++) {
      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * this.horizonY,
        size: Math.random() * 2
      });
    }

    // Generate Mountain Range (simple jagged line)
    this.mountainPoints = [];
    let mx = 0;
    let my = this.horizonY;
    while (mx < w) {
      this.mountainPoints.push({ x: mx, y: my });
      mx += 20 + Math.random() * 50;
      my = this.horizonY - (Math.random() * 100); // Peak height
    }
    this.mountainPoints.push({ x: w, y: this.horizonY });
  }

  updateFrequencies(low, mid, high) {
    this.low = low;
    this.mid = mid;
    this.high = high;
  }

  start() {
    // Resize handling
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    
    this.init();
    if (!this.frameId) this.frameId = requestAnimationFrame(this.draw);
  }

  stop() {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  // --- Helpers ---
  
  // Project 3D World (x, y, z) to 2D Screen (sx, sy)
  // Z goes into screen (positive). Y is up (negative in canvas usually, but we handle offsets).
  project(x, y, z) {
    if (z <= 0) return { x: x, y: y, scale: 1 }; // Clip
    const scale = this.fov / (this.fov + z);
    const cx = this.canvas.width / 2;
    const cy = this.horizonY; // Vanishing point
    return {
      x: cx + (x * scale),
      y: cy + (y * scale),
      scale: scale
    };
  }

  draw = () => {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear
    // We use a slight trail effect for motion blur feeling
    ctx.fillStyle = 'rgba(10, 0, 20, 0.6)'; 
    ctx.fillRect(0, 0, w, h);

    if (this.state === 'BOOT') {
      this.drawLoading(ctx, w, h);
    } else {
      this.drawGame(ctx, w, h);
    }

    this.frameId = requestAnimationFrame(this.draw);
  }

  drawLoading(ctx, w, h) {
    this.bootTimer++;
    
    ctx.fillStyle = '#0f0';
    ctx.font = '20px monospace';
    ctx.textAlign = 'center';

    // Retro loading bars
    const progress = Math.min(1, this.bootTimer / 120); // 2 seconds boot
    const barWidth = 300;
    
    ctx.fillText("INITIALIZING DRIVER...", w/2, h/2 - 40);
    
    ctx.strokeStyle = '#0f0';
    ctx.strokeRect(w/2 - barWidth/2, h/2, barWidth, 20);
    ctx.fillRect(w/2 - barWidth/2 + 4, h/2 + 4, (barWidth - 8) * progress, 12);

    if (this.bootTimer > 120) {
      this.state = 'RUN';
    }
  }

  drawGame(ctx, w, h) {
    // --- 1. UPDATE LOGIC ---
    // Speed based on Mid + constant forward motion
    const moveSpeed = 5 + (this.mid * 0.2); 
    this.speed = Math.floor(moveSpeed * 20);
    
    // HUD Update
    if (this.elSpeed) this.elSpeed.textContent = this.speed;
    if (this.elSys) this.elSys.style.color = this.high > 80 ? '#f00' : '#0ff'; // Glitch warning

    // Spawn Objects (Names)
    if (Math.random() < 0.01 + (this.mid * 0.0005)) {
      const name = this.names[Math.floor(Math.random() * this.names.length)];
      this.entities.push({
        text: name,
        x: (Math.random() * 1000) - 500, // Spread left/right
        y: 20, // Height off ground
        z: 2000, // Far away
        color: Math.random() > 0.5 ? '#0ff' : '#ff00ff'
      });
    }

    // --- 2. BACKGROUND & SKY ---
    
    // Draw Stars (Twinkle with High freq)
    ctx.fillStyle = '#fff';
    this.stars.forEach(star => {
      const twinkle = Math.random() * (this.high * 0.02);
      ctx.globalAlpha = 0.5 + Math.random() * 0.5;
      ctx.beginPath();
      ctx.arc(star.x, star.y, Math.max(0.5, star.size + twinkle), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Draw Sun (Pulse with Low freq)
    const sunRadius = 60 + (this.low * 0.5);
    const sunX = w / 2;
    const sunY = this.horizonY - 50;
    
    const sunGrad = ctx.createLinearGradient(sunX, sunY - sunRadius, sunX, sunY + sunRadius);
    sunGrad.addColorStop(0, '#ffff00');
    sunGrad.addColorStop(1, '#ff00cc');
    
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    ctx.fill();

    // Sun "Blinds" (Horizontal cuts)
    ctx.fillStyle = 'rgba(10, 0, 20, 0.8)'; // Match bg color roughly
    for(let i=0; i<10; i++) {
        const y = sunY - sunRadius + (i * (sunRadius/4)) + (Date.now() / 50 % 20); 
        const hCut = 2 + i; // cuts get thicker towards bottom
        ctx.fillRect(sunX - sunRadius, y, sunRadius*2, hCut);
    }

    // Draw Mountains (Dark silhouette against sun)
    ctx.fillStyle = '#050010';
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h); // Bottom left
    ctx.lineTo(0, this.horizonY);
    this.mountainPoints.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(w, this.horizonY);
    ctx.lineTo(w, h);
    ctx.fill();
    // Glow on mountain tops
    ctx.stroke();

    // --- 3. 3D GRID FLOOR ---
    
    ctx.save();
    // Clip to bottom half
    ctx.beginPath();
    ctx.rect(0, this.horizonY, w, h - this.horizonY);
    ctx.clip();

    // Grid Movement
    // We simulate movement by offsetting the Z of horizontal lines
    const timeZ = (Date.now() * (moveSpeed/10)) % 200;

    ctx.strokeStyle = 'rgba(255, 0, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10 + (this.low * 0.2);
    ctx.shadowColor = '#ff00ff';

    // Vertical Lines (Converging)
    for (let x = -1000; x <= 1000; x += 100) {
      const p1 = this.project(x, 100, 1); // Near
      const p2 = this.project(x, 100, 2000); // Far
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // Horizontal Lines (Moving towards camera)
    for (let z = 0; z < 2000; z += 100) {
      // Apply offset for movement
      let currentZ = z - timeZ;
      if (currentZ < 10) currentZ += 2000; // Wrap around

      const p1 = this.project(-1000, 100, currentZ);
      const p2 = this.project(1000, 100, currentZ);
      
      // Distance fade
      ctx.globalAlpha = 1 - (currentZ / 2000);
      
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();

    // --- 4. ENTITIES (Names) ---
    
    // Sort by Z (Painter's algo) - draw far ones first
    this.entities.sort((a, b) => b.z - a.z);

    ctx.font = 'bold 40px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      
      // Move Object
      ent.z -= moveSpeed;

      // Remove if behind camera
      if (ent.z < 10) {
        this.entities.splice(i, 1);
        // "Collect" score
        this.score += 100;
        if(this.elScore) this.elScore.textContent = this.score.toString().padStart(6, '0');
        continue;
      }

      // Draw
      const p = this.project(ent.x, ent.y, ent.z);
      
      // Scale font by distance
      const fontSize = Math.max(1, 40 * p.scale);
      ctx.font = `bold ${fontSize}px "Courier New"`;
      
      // Text Glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = ent.color;
      ctx.fillStyle = ent.color;
      
      // Simple wireframe box around text
      const boxW = ctx.measureText(ent.text).width + 10;
      const boxH = fontSize;
      
      ctx.fillText(ent.text, p.x, p.y);
      ctx.strokeStyle = ent.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - boxW/2, p.y - boxH/2, boxW, boxH);
      
      ctx.shadowBlur = 0;
    }

    // --- 5. PLAYER (Bottom Center) ---
    // It's a cool vector triangle
    const px = w / 2;
    const py = h - 40;
    
    // Car bounce based on Bass
    const bounce = this.low * 0.1;

    ctx.shadowBlur = 20;
    ctx.shadowColor = '#0ff';
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 3;
    
    ctx.beginPath();
    ctx.moveTo(px, py - 30 - bounce); // Nose
    ctx.lineTo(px - 40, py + 20); // Back Left
    ctx.lineTo(px + 40, py + 20); // Back Right
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Engine glow
    ctx.fillStyle = '#0ff';
    ctx.fillRect(px - 30, py + 20, 15, 5);
    ctx.fillRect(px + 15, py + 20, 15, 5);
    
    // "Laser" grid lines from car
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(px, py - 30);
    ctx.lineTo(px, this.horizonY);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}