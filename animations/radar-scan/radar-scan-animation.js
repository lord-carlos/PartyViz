export class RadarScanAnimation {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = config || {};
    this.frameId = null;

    // Audio State
    this.low = 0;
    this.mid = 0;
    this.high = 0;

    // Radar State
    this.scanAngle = 45; // Start at 45 degrees (left side of V)
    this.scanDirection = 1;
    this.targets = [];
    this.names = ["UNKNOWN", "BOGEY", "TARGET"]; // Fallbacks

    // Config
    this.scanSpeedBase = 0.2;
    this.maxTargets = 4;
    
    // Geometry (Calculated in start/resize)
    this.originX = 0;
    this.originY = 0;
    this.radius = 0;

    this.fetchNames();
  }

  async fetchNames() {
    try {
      const res = await fetch('./names.json');
      const data = await res.json();
      if (data.names && Array.isArray(data.names)) {
        this.names = data.names;
      }
    } catch (e) {
      console.warn("Radar: Could not load names.json", e);
    }
  }

  updateFrequencies(low, mid, high) {
    this.low = low;
    this.mid = mid;
    this.high = high;
  }

  start() {
    // Handle Resolution
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    
    // Calculate Geometry: Center Bottom
    this.originX = this.canvas.width / 2;
    this.originY = this.canvas.height - 40;
    // Radius should fit within the screen height mainly
    this.radius = Math.min(this.canvas.width * 0.8, this.canvas.height * 0.9);

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

  // Helper: Degrees to Radians
  toRad(deg) {
    // Canvas Y is inverted, and 0 is right. 
    // We want -deg to rotate counter-clockwise visually
    return -deg * (Math.PI / 180);
  }

  draw = () => {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // CSS Colors
    const style = getComputedStyle(this.canvas);
    const colorPrimary = style.getPropertyValue('--color-primary').trim() || '#0f0';
    const colorBg = style.getPropertyValue('--color-bg').trim() || '#000';
    const colorTarget = '#ff3333'; // Hardcoded alert color or read from CSS

    // Audio Modifiers
    // Mid freq speeds up the sweep
    const currentSpeed = this.scanSpeedBase + (this.mid * 0.02); 
    
    // Bass shakes the screen slightly (Grid offset)
    const shake = this.low > 80 ? (Math.random() * 4 - 2) : 0;
    
    // Clear
    ctx.fillStyle = colorBg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(shake, shake); // Apply shake

    // --- 1. DRAW GRID ---
    this.drawGrid(ctx, colorPrimary);

    // --- 2. UPDATE & DRAW SCANLINE ---
    // Move Scan Line
    this.scanAngle += currentSpeed * this.scanDirection;
    if (this.scanAngle >= 135) {
        this.scanAngle = 135;
        this.scanDirection = -1;
    } else if (this.scanAngle <= 45) {
        this.scanAngle = 45;
        this.scanDirection = 1;
    }
    
    this.drawScanLine(ctx, colorPrimary);

    // --- 3. MANAGE TARGETS ---
    
    // Spawn Logic: High freq increases spawn rate
    const spawnChance = 0.01 + (this.high * 0.0005);
    if (this.targets.length < this.maxTargets && Math.random() < spawnChance) {
        this.spawnTarget();
    }

    // Update & Draw Targets
    for (let i = this.targets.length - 1; i >= 0; i--) {
        let t = this.targets[i];
        
        // Detection Logic
        if (!t.isDetected) {
            const diff = Math.abs(t.angle - this.scanAngle);
            // If scanline hits target angle
            if (diff < 1.5) {
                t.isDetected = true;
                t.opacity = 1.0;
                // Play "sound" effect visually?
            }
        } else {
            // Fade out
            t.opacity -= 0.002;
        }

        // Draw
        if (t.opacity > 0) {
            const rads = this.toRad(t.angle);
            const tx = this.originX + Math.cos(rads) * t.dist;
            const ty = this.originY + Math.sin(rads) * t.dist;
            
            ctx.globalAlpha = t.opacity;
            
            // Blip
            ctx.fillStyle = colorTarget;
            ctx.beginPath();
            ctx.arc(tx, ty, 4, 0, Math.PI*2);
            ctx.fill();
            
            // Ring
            ctx.strokeStyle = colorTarget;
            ctx.beginPath();
            ctx.arc(tx, ty, 8, 0, Math.PI*2);
            ctx.stroke();
            
            // Text Label
            // Only draw text if fairly visible
            if (t.opacity > 0.4) {
                ctx.fillStyle = colorPrimary;
                ctx.font = "12px monospace";
                ctx.fillText(t.name, tx + 12, ty - 5);
                
                // Connector
                ctx.strokeStyle = colorPrimary;
                ctx.beginPath();
                ctx.moveTo(tx, ty);
                ctx.lineTo(tx + 10, ty - 5);
                ctx.stroke();
            }
            
            ctx.globalAlpha = 1.0;
        }

        // Cleanup
        if (t.isDetected && t.opacity <= 0) {
            this.targets.splice(i, 1);
        }
    }

    ctx.restore();
    this.frameId = requestAnimationFrame(this.draw);
  }

  spawnTarget() {
    const angle = 45 + (Math.random() * 90); // Anywhere in V sector
    const dist = 100 + Math.random() * (this.radius - 120);
    const name = this.names[Math.floor(Math.random() * this.names.length)];
    
    this.targets.push({
        angle: angle,
        dist: dist,
        name: name.toUpperCase(),
        isDetected: false,
        opacity: 0 // Invisible until scanned
    });
  }

  drawGrid(ctx, color) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;

    // V-Shape Borders
    ctx.beginPath();
    const startRad = this.toRad(45);
    const endRad = this.toRad(135);
    
    ctx.moveTo(this.originX, this.originY);
    ctx.lineTo(this.originX + Math.cos(startRad) * this.radius, this.originY + Math.sin(startRad) * this.radius);
    
    ctx.moveTo(this.originX, this.originY);
    ctx.lineTo(this.originX + Math.cos(endRad) * this.radius, this.originY + Math.sin(endRad) * this.radius);
    ctx.stroke();

    // Range Rings
    const rings = 4;
    for (let i = 1; i <= rings; i++) {
        ctx.beginPath();
        const r = (this.radius / rings) * i;
        // Draw arc from 45 to 135
        ctx.arc(this.originX, this.originY, r, this.toRad(135), this.toRad(45));
        ctx.stroke();
    }
    
    // Angle Lines (every 15 deg)
    ctx.globalAlpha = 0.2;
    for (let a = 45; a <= 135; a += 15) {
        const rad = this.toRad(a);
        ctx.beginPath();
        ctx.moveTo(this.originX, this.originY);
        ctx.lineTo(this.originX + Math.cos(rad) * this.radius, this.originY + Math.sin(rad) * this.radius);
        ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  }

  drawScanLine(ctx, color) {
    const rad = this.toRad(this.scanAngle);
    const tipX = this.originX + Math.cos(rad) * this.radius;
    const tipY = this.originY + Math.sin(rad) * this.radius;

    // Main Beam
    ctx.beginPath();
    ctx.moveTo(this.originX, this.originY);
    ctx.lineTo(tipX, tipY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 15;
    ctx.shadowColor = color;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Trail (After-image fading)
    const trailLen = 15;
    for(let i = 0; i < trailLen; i++) {
        // Calculate trailing angle based on direction
        // If moving +1 (Left), trail is scanAngle - i
        const trailAngle = this.scanAngle - (i * this.scanDirection * 0.8);
        
        if (trailAngle < 45 || trailAngle > 135) continue;

        const tRad = this.toRad(trailAngle);
        const tx = this.originX + Math.cos(tRad) * this.radius;
        const ty = this.originY + Math.sin(tRad) * this.radius;

        ctx.beginPath();
        ctx.moveTo(this.originX, this.originY);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.2 - (i * 0.015);
        ctx.lineWidth = 4; 
        ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  }
}