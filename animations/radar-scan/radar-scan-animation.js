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
    this.scanAngle = 45;
    this.scanDirection = 1;
    this.targets = [];
    this.names = ["MIG-29", "UFO-X", "DRONE", "SU-57", "F-22", "UNKNOWN"];
    this.logs = []; // Scrolling text log

    // Deterministic timing/counters (keeps Math.random() out of the draw path)
    this.spawnAccumulator = 0;
    this.spawnSeq = 0;
    this.logSeq = 0;

    // Visual Juice State
    this.hue = 180; // Start Cyan
    this.alertLevel = 0; // 0 = Calm, 1 = DANGER
    this.shake = 0;
    this.compassOffset = 0;

    // Config
    this.originX = 0;
    this.originY = 0;
    this.radius = 0;
    this.width = 0;
    this.height = 0;
    this.time = 0;
    this._resizeHandler = () => this.resize();

    this.fetchNames();

    // Fill initial logs
    for (let i = 0; i < 5; i++) this.addLog();
  }

  async fetchNames() {
    try {
      const res = await fetch('./names.json');
      const data = await res.json();
      if (data.names && Array.isArray(data.names)) {
        this.names = data.names;
      }
    } catch (e) { }
  }

  // Deterministic pseudo-random in [0, 1) from a seed. Same look as Math.random
  // but reproducible, so the draw path never touches the global RNG.
  _pseudo(seed) {
    const v = Math.sin(seed * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  }

  addLog() {
    const prefixes = ["SYS", "NET", "RAD", "WEP"];
    this.logSeq++;
    const hex = Math.floor(this._pseudo(this.logSeq * 1.37) * 16777215).toString(16).toUpperCase();
    const prefix = prefixes[Math.min(prefixes.length - 1, Math.floor(this._pseudo(this.logSeq * 2.11) * prefixes.length))];
    this.logs.push(`${prefix} :: ${hex} :: OK`);
    if (this.logs.length > 8) this.logs.shift();
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

    this.originX = width / 2;
    this.originY = height - 80; // Lifted up for bottom HUD
    this.radius = Math.min(width * 0.85, height * 0.85);
  }

  start() {
    this.resize();
    if (!this._resizeHandler) this._resizeHandler = () => this.resize();
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

  toRad(deg) { return -deg * (Math.PI / 180); }

  // --- LOGIC & DRAWING ---

  updateState() {
    // 1. Determine Alert Level (Based on Bass)
    if (this.low > 73) {
      this.alertLevel = Math.min(this.alertLevel + 0.1, 1); // Ramp up to red
    } else {
      this.alertLevel = Math.max(this.alertLevel - 0.05, 0); // Cool down
    }

    // 2. Set Main Color based on Alert
    // Alert 0 = Cyan (180), Alert 1 = Red (0)
    this.hue = 180 * (1 - this.alertLevel);

    // 3. Shake calculation
    this.shake = (this.low / 50) * this.alertLevel;

    // 4. Scan Movement
    const speed = 0.5 + (this.mid / 100);
    this.scanAngle += speed * this.scanDirection;

    // Bounce scan
    if (this.scanAngle >= 135) { this.scanAngle = 135; this.scanDirection = -1; }
    if (this.scanAngle <= 45) { this.scanAngle = 45; this.scanDirection = 1; }

    // 5. Log update (pseudo-random cadence driven by high freq)
    if (this._pseudo(this.time * 0.37 + 1.3) < (this.high / 5000)) this.addLog();

    // 6. Compass Movement
    this.compassOffset += this.scanDirection * speed;
  }

  draw = () => {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    this.time++;

    this.updateState();

    // Main Color Strings
    const mainColor = `hsl(${this.hue}, 100%, 50%)`;
    const dimColor = `hsl(${this.hue}, 100%, 20%)`;

    // Clear with slight fade for trails (this is motion blur, not CRT effect)
    ctx.fillStyle = 'rgba(5, 10, 15, 0.8)';
    ctx.fillRect(0, 0, w, h);

    ctx.save();

    // --- SCREEN SHAKE ---
    // Deterministic jitter: two offset sine waves per axis (same +/- range as
    // the old random jitter, no Math.random() in the draw loop).
    if (this.shake > 0) {
      const t = this.time;
      const amp = this.shake * 0.5;
      const dx = (Math.sin(t * 1.7) * 0.7 + Math.sin(t * 4.3 + 1.1) * 0.3) * amp;
      const dy = (Math.sin(t * 2.3 + 2.4) * 0.7 + Math.sin(t * 5.1 + 0.7) * 0.3) * amp;
      ctx.translate(dx, dy);
    }

    // --- 1. BACKGROUND GRID ---
    this.drawGrid(ctx, mainColor, dimColor);

    // --- 2. HUD ELEMENTS (The Juice) ---
    this.drawHUD(ctx, w, h, mainColor);

    // --- 3. SCAN LINE ---
    this.drawScanLine(ctx, mainColor);

    // --- 4. TARGETS ---
    this.manageTargets(ctx, mainColor);

    ctx.restore();
    this.frameId = requestAnimationFrame(this.draw);
  }

  drawHUD(ctx, w, h, color) {
    ctx.font = "bold 12px monospace";
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    // Top Compass Strip
    ctx.save();
    ctx.beginPath();
    ctx.rect(w / 2 - 150, 10, 300, 30);
    ctx.clip(); // Clip contents to box

    for (let i = -20; i < 20; i++) {
      const x = (w / 2) + (i * 40) - (this.compassOffset * 5);
      ctx.fillText("|", x, 35);
      if (i % 2 === 0) ctx.fillText(Math.abs(i * 10), x - 5, 25);
    }
    ctx.restore();

    // Draw Compass Box
    ctx.strokeRect(w / 2 - 150, 10, 300, 30);
    // Center Indicator
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.moveTo(w / 2, 45); ctx.lineTo(w / 2 - 5, 55); ctx.lineTo(w / 2 + 5, 55);
    ctx.fill();

    // Left Side: Altitude Bar (Reacts to Mid)
    const altH = 200;
    const altY = h / 2 - altH / 2;
    ctx.fillStyle = color;
    ctx.fillRect(20, altY, 2, altH);
    // Moving indicator
    const indY = altY + altH - (Math.max(0, Math.min(this.mid, 100)) / 100 * altH);
    ctx.fillRect(10, indY, 20, 4);
    ctx.fillText(`ALT: ${Math.floor(this.mid * 10)}`, 35, indY + 5);

    // Right Side: System Log
    const logX = w - 160;
    const logY = h / 2 - 100;
    ctx.textAlign = "left";
    ctx.fillStyle = color;
    ctx.fillText("--- SYSTEM LOG ---", logX, logY);

    this.logs.forEach((log, i) => {
      ctx.globalAlpha = 1 - (i / this.logs.length); // Fade out older logs
      ctx.fillText(log, logX, logY + 20 + (i * 15));
    });
    ctx.globalAlpha = 1;

    // Bottom: Status
    ctx.textAlign = "center";
    ctx.font = "bold 16px monospace";
    if (this.alertLevel > 0.8) {
      const flash = Math.sin(this.time * 0.5) > 0 ? 1 : 0.2;
      ctx.fillStyle = `rgba(255, 0, 0, ${flash})`;
      ctx.fillText("!!! WARNING: COMBAT IMMINENT !!!", w / 2, h - 20);
    } else {
      ctx.fillStyle = color;
      ctx.fillText(`MODE: SEARCH // FREQ: ${Math.floor(this.low)}Hz`, w / 2, h - 20);
    }
  }

  drawGrid(ctx, color, dimColor) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = dimColor;

    // V-Shape Frame
    const startRad = this.toRad(45);
    const endRad = this.toRad(135);

    ctx.beginPath();
    ctx.moveTo(this.originX, this.originY);
    ctx.lineTo(this.originX + Math.cos(startRad) * this.radius, this.originY + Math.sin(startRad) * this.radius);
    ctx.moveTo(this.originX, this.originY);
    ctx.lineTo(this.originX + Math.cos(endRad) * this.radius, this.originY + Math.sin(endRad) * this.radius);
    ctx.stroke();

    // Pulsing Arcs
    const pulse = (this.time / 60) % 1; // 0 to 1
    const rings = 5;
    for (let i = 1; i <= rings; i++) {
      ctx.beginPath();
      let r = (this.radius / rings) * i;

      // Visual flair: Rings expand slightly with bass
      r += (this.low / 10);

      ctx.arc(this.originX, this.originY, r, this.toRad(135), this.toRad(45));

      // Make one ring brighter ("scanning" outward)
      if (Math.abs((i / rings) - pulse) < 0.1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = dimColor;
        ctx.lineWidth = 1;
      }
      ctx.stroke();
    }

    // Angle degrees text
    ctx.fillStyle = color;
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    for (let a = 45; a <= 135; a += 15) {
      const rad = this.toRad(a);
      const textX = this.originX + Math.cos(rad) * (this.radius + 20);
      const textY = this.originY + Math.sin(rad) * (this.radius + 20);
      ctx.fillText(`${a}°`, textX, textY);
    }
  }

  manageTargets(ctx, color) {
    // Spawn logic (Music driven): accumulate timing instead of rolling a
    // per-frame random chance. 0.005/frame average is preserved.
    if (this.targets.length < 4) {
      this.spawnAccumulator += 0.005 + (this.high / 10000);
      if (this.spawnAccumulator >= 1) {
        this.spawnAccumulator = 0;
        this.spawnSeq++;
        const s = this.spawnSeq;
        const maxDist = Math.max(1, this.radius - 150);
        const angle = 50 + this._pseudo(s * 1.7) * 80;
        const dist = 100 + this._pseudo(s * 3.1 + 11.7) * maxDist;
        const nameIndex = Math.min(this.names.length - 1, Math.floor(this._pseudo(s * 5.3 + 7.9) * this.names.length));
        this.targets.push({
          angle,
          dist,
          name: this.names[nameIndex],
          opacity: 0,
          detected: false,
          lockRotation: 0
        });
      }
    } else {
      this.spawnAccumulator = 0;
    }

    // Update & Draw
    for (let i = this.targets.length - 1; i >= 0; i--) {
      let t = this.targets[i];

      // Check collision with scanline
      if (!t.detected && Math.abs(t.angle - this.scanAngle) < 2) {
        t.detected = true;
        t.opacity = 1.5; // Flash bright
      } else if (t.detected) {
        t.opacity -= 0.005; // Slow fade
      }

      if (t.opacity > 0) {
        const rad = this.toRad(t.angle);
        const tx = this.originX + Math.cos(rad) * t.dist;
        const ty = this.originY + Math.sin(rad) * t.dist;

        // --- DRAW TARGET JUICE ---
        ctx.save();
        ctx.translate(tx, ty);

        // 1. The Dot
        ctx.fillStyle = this.alertLevel > 0.5 ? "white" : color;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();

        // 2. Rotating Lock Brackets
        t.lockRotation += 0.05;
        ctx.rotate(t.lockRotation);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        const s = 15 + (t.opacity * 5); // Pulse size

        // Draw corners [ ]
        ctx.beginPath();
        ctx.moveTo(-s, -s / 2); ctx.lineTo(-s, -s); ctx.lineTo(-s / 2, -s); // Top Left
        ctx.moveTo(s, -s / 2); ctx.lineTo(s, -s); ctx.lineTo(s / 2, -s);   // Top Right
        ctx.moveTo(s, s / 2); ctx.lineTo(s, s); ctx.lineTo(s / 2, s);      // Bot Right
        ctx.moveTo(-s, s / 2); ctx.lineTo(-s, s); ctx.lineTo(-s / 2, s);   // Bot Left
        ctx.stroke();

        ctx.restore();

        // 3. Text Info (No rotation)
        if (t.opacity > 0.2) {
          ctx.fillStyle = color;
          ctx.textAlign = "left";
          ctx.font = "10px monospace";

          const xOff = 25;
          // Glitch the text position with High freq (deterministic per target)
          const glitchY = (this.high > 65)
            ? this._pseudo(this.time * 0.9 + i * 7.3 + t.angle) * 4
            : 0;

          ctx.fillText(t.name, tx + xOff, ty - 10 + glitchY);
          ctx.fillText(`DST: ${Math.floor(t.dist)}m`, tx + xOff, ty + glitchY);

          if (t.opacity > 1.0) {
            ctx.fillStyle = "white";
            ctx.fillText("⚠ LOCKING", tx + xOff, ty + 12 + glitchY);
          }

          // Connector line
          ctx.strokeStyle = color;
          ctx.beginPath();
          ctx.moveTo(tx + 10, ty);
          ctx.lineTo(tx + 22, ty);
          ctx.stroke();
        }
      }

      if (t.detected && t.opacity <= 0) this.targets.splice(i, 1);
    }
  }

  drawScanLine(ctx, color) {
    const rad = this.toRad(this.scanAngle);
    const tipX = this.originX + Math.cos(rad) * this.radius;
    const tipY = this.originY + Math.sin(rad) * this.radius;

    // 1. Thick Glow
    ctx.shadowBlur = 20;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(this.originX, this.originY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 2. Center Core (White hot)
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3. Trailing 'Cone' (The swipe effect)
    for (let i = 0; i < 20; i++) {
      const trailAng = this.scanAngle - (i * this.scanDirection * 0.5);
      if (trailAng < 45 || trailAng > 135) continue;

      const tRad = this.toRad(trailAng);
      const tx = this.originX + Math.cos(tRad) * this.radius;
      const ty = this.originY + Math.sin(tRad) * this.radius;

      ctx.beginPath();
      ctx.moveTo(this.originX, this.originY);
      ctx.lineTo(tx, ty);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.3 - (i * 0.015);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  }
}