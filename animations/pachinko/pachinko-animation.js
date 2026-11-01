import * as THREE from 'three';

export class PachinkoAnimation {
  constructor(canvas, config) {
    console.log('[pachinko] Constructor called');
    this.canvas = canvas;
    this.config = config || {};
    this.frameId = null;

    // === CONFIGURATION VARIABLES ===

    // Ball Configuration
    this.ballRadius = this.config.settings?.ballRadius || 0.3;
    this.ballColors = this.config.settings?.ballColors || [0xff6b6d, 0x00ffff, 0x9932cc]; // Orange, Cyan, Indigo
    this.ballSpawnRate = this.config.settings?.ballSpawnRate || 2; // Balls per second
    this.maxBalls = this.config.settings?.maxBalls || 50;

    // Physics Configuration
    this.baseGravity = this.config.settings?.gravity ?? 0.5;
    this.baseDamping = this.config.settings?.dampingFactor ?? 0.8; // Energy loss on bounce
    this.gravity = this.baseGravity;
    this.dampingFactor = this.baseDamping;
    this.ballVelocity = { x: 0, y: 0 };

    // Board Configuration
    this.pegRows = this.config.settings?.pegRows || 10;
    this.pegColumns = this.config.settings?.pegColumns || 8;
    this.pegRadius = this.config.settings?.pegRadius || 0.2;
    this.boardWidth = this.config.settings?.boardWidth || 20;
    this.boardHeight = this.config.settings?.boardHeight || 30;

    // Audio Thresholds
    this.lowThreshold = this.config.settings?.lowThreshold || 70;  // Spawn red balls
    this.midThreshold = this.config.settings?.midThreshold || 70;  // Spawn green balls
    this.highThreshold = this.config.settings?.highThreshold || 70; // Spawn blue balls

    // Name Configuration
    this.nameLifetime = this.config.settings?.nameLifetime || 200; // Frames to display name
    this.nameFadeSpeed = this.config.settings?.nameFadeSpeed || 0.02;
    this.nameScale = this.config.settings?.nameScale || 3;

    // Particle Configuration
    this.particleCount = this.config.settings?.particleCount || 100;
    this.particleLifetime = this.config.settings?.particleLifetime || 50;
    this.particleSpeed = this.config.settings?.particleSpeed || 0.3;

    // Post-processing Configuration (Phase 4)
    this.bloomEnabled = this.config.settings?.bloomEnabled !== false; // Default to true
    this.bloomStrength = this.config.settings?.bloomStrength || 1.5;
    this.bloomRadius = this.config.settings?.bloomRadius || 0.4;
    this.bloomThreshold = this.config.settings?.bloomThreshold || 0.85;

    // Effects Configuration (Phase 4)
    this.glowEnabled = this.config.settings?.glowEnabled !== false; // Default to true
    this.trailEnabled = this.config.settings?.trailEnabled !== false; // Default to true
    this.comboEnabled = this.config.settings?.comboEnabled !== false; // Default to true
    this.screenShakeEnabled = this.config.settings?.screenShakeEnabled !== false; // Default to true

    // Audio frequency values
    this.LOW = 0;
    this.MID = 0;
    this.HIGH = 0;

    // Names for displays
    this.names = ["UNKNOWN", "BOGEY", "TARGET"]; // Fallbacks
    this.fetchNames();

    // Three.js components
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // Post-processing components (Phase 4)
    this.composer = null;
    this.renderPass = null;
    this.bloomPass = null;

    // Game components
    this.pegs = [];
    this.balls = [];
    this.scoringZones = [];
    this.displayedNames = [];

    // Particle system
    this.particles = null;
    this.particleData = [];

    // Effect components (Phase 4)
    this.comboTexts = [];
    this.screenOverlay = null;
    this.glowSprites = [];
    this.impactWaves = [];
    this._comboCooldowns = new Map();
    this._comboTimers = new Set();

    // Animation parameters
    this.time = 0;
    this.ballSpawnTimer = 0;
    this.screenShake = { x: 0, y: 0 };

    // Materials
    this.pegMaterial = null;
    this.ballMaterials = [];
    this.particleMaterial = null;

    // WebGL context check
    this.webglSupported = this.checkWebGLSupport();

    console.log('[pachinko] Constructor completed');
  }

  checkWebGLSupport() {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return !!context;
    } catch (e) {
      return false;
    }
  }

  async fetchNames() {
    console.log('[pachinko] Fetching names...');
    try {
      const res = await fetch('./names.json');
      const data = await res.json();
      if (data.names && Array.isArray(data.names)) {
        this.names = data.names;
        console.log('[pachinko] Names loaded successfully:', this.names.length, 'names');
      }
    } catch (e) {
      console.warn("[pachinko] Could not load names.json", e);
    }
  }

  init() {
    console.log('[pachinko] Initializing 3D scene...');

    if (this.scene) return; // start() can be called again after a pause
    if (!this.webglSupported) {
      console.error('[pachinko] WebGL is not supported in this browser');
      this.showWebGLError();
      return;
    }

    try {
      // Initialize Three.js scene
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x000000); // Black background

      // Setup camera. Fit the board without stretching it to the canvas aspect.
      const aspect = this.canvas.width / this.canvas.height || 1;
      const viewHeight = Math.max(this.boardHeight, this.boardWidth / aspect);
      const halfHeight = viewHeight / 2;
      const halfWidth = halfHeight * aspect;
      this.camera = new THREE.OrthographicCamera(
        -halfWidth, halfWidth,
        halfHeight, -halfHeight,
        1,
        1000
      );
      this.camera.position.z = 10;

      // Setup renderer
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true
      });

      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(this.canvas.width, this.canvas.height, false);

      // Try to setup post-processing (Phase 4)
      try {
        this.setupPostProcessing();
      } catch (e) {
        console.warn('[pachinko] Post-processing not available, using basic renderer:', e);
        this.bloomEnabled = false;
      }

      // Create materials
      this.createMaterials();

      // Create scene elements
      this.createBoard();
      this.createPegs();
      this.createScoringZones();
      this.initializeParticleSystem();

      // Create effect elements (Phase 4)
      this.createEffectElements();

      console.log('[pachinko] 3D scene initialized successfully');
    } catch (error) {
      console.error('[pachinko] Error initializing 3D scene:', error);
      this.showWebGLError();
    }
  }

  // Phase 4: Setup post-processing effects
  setupPostProcessing() {
    if (!this.bloomEnabled) return;

    // Simple post-processing without external dependencies
    this.composer = {
      render: () => {
        this.renderer.render(this.scene, this.camera);
      },
      setSize: (width, height) => {
        this.renderer.setSize(width, height);
      }
    };
  }

  // Phase 4: Create visual effect elements
  createEffectElements() {
    // Create screen overlay for effects
    const overlayGeometry = new THREE.PlaneGeometry(this.boardWidth, this.boardHeight);
    const overlayMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    });
    this.screenOverlay = new THREE.Mesh(overlayGeometry, overlayMaterial);
    this.screenOverlay.position.z = 5;
    this.scene.add(this.screenOverlay);

    // Create glow sprites around pegs
    for (let i = 0; i < 10; i++) {
      const glowGeometry = new THREE.RingGeometry(0.5, 0.1, 8, 2, Math.PI * 2);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      });
      const glowSprite = new THREE.Mesh(glowGeometry, glowMaterial);
      glowSprite.position.z = -1;
      this.glowSprites.push(glowSprite);
      this.scene.add(glowSprite);
    }
  }

  showWebGLError() {
    // start() is idempotent; never stack a second overlay on a repeated call.
    const viewContainer = this.canvas.closest('.animation-view');
    if (!viewContainer || viewContainer.querySelector('.webgl-error-overlay')) return;

    // Create error message as HTML overlay
    const errorDiv = document.createElement('div');
    errorDiv.className = 'webgl-error-overlay';
    errorDiv.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      font-family: monospace;
      color: #ff0066;
      font-size: 24px;
      background: rgba(0, 0, 0, 0.9);
      padding: 20px;
      border: 2px solid #00ffff;
      border-radius: 10px;
      z-index: 1000;
    `;
    errorDiv.innerHTML = `
      <div>WebGL not supported</div>
      <div style="color: #00ffff; font-size: 16px; margin-top: 10px;">Please try a different browser</div>
    `;

    viewContainer.appendChild(errorDiv);
  }

  createMaterials() {
    // Create enhanced peg material with glow
    this.pegMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8
    });

    // Create ball materials for each color with enhanced properties
    this.ballMaterials = this.ballColors.map(color =>
      new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.9
      })
    );

    // Create enhanced particle material
    this.particleMaterial = new THREE.PointsMaterial({
      size: 0.2,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
  }

  createBoard() {
    // Create enhanced board frame with gradient effect
    const frameGeometry = new THREE.BoxGeometry(this.boardWidth, this.boardHeight, 0.5);
    const frameMaterial = new THREE.MeshBasicMaterial({
      color: 0x333333,
      transparent: true,
      opacity: 0.5
    });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    frame.position.z = -1;
    this.scene.add(frame);

    // Create board background with subtle pattern
    const bgGeometry = new THREE.PlaneGeometry(this.boardWidth, this.boardHeight);
    const bgMaterial = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.8
    });
    const background = new THREE.Mesh(bgGeometry, bgMaterial);
    background.position.z = -0.5;
    this.scene.add(background);
  }

  createPegs() {
    // Calculate peg spacing
    const xSpacing = this.boardWidth / (this.pegColumns + 1);
    const ySpacing = this.boardHeight / (this.pegRows + 1);

    // Create pegs in triangular pattern
    for (let row = 0; row < this.pegRows; row++) {
      const pegsInRow = row % 2 === 0 ? this.pegColumns : this.pegColumns - 1;
      const xOffset = row % 2 === 0 ? 0 : xSpacing / 2;

      for (let col = 0; col < pegsInRow; col++) {
        const pegGeometry = new THREE.SphereGeometry(this.pegRadius, 12, 12);
        const peg = new THREE.Mesh(pegGeometry, this.pegMaterial.clone());

        // Position peg
        peg.position.x = -this.boardWidth / 2 + xOffset + (col + 1) * xSpacing;
        peg.position.y = this.boardHeight / 2 - (row + 1) * ySpacing;
        peg.position.z = 0;

        // Add peg data for effects
        peg.userData = {
          baseColor: 0xffffff,
          glowIntensity: 0,
          targetGlow: 0,
          glowColor: new THREE.Color(0xffffff),
          spriteIndex: this.pegs.length,
          rotationSpeed: 0.001 + Math.random() * 0.002
        };

        this.pegs.push(peg);
        this.scene.add(peg);
      }
    }

    console.log('[pachinko] Created', this.pegs.length, 'pegs');
  }

  createScoringZones() {
    // Create enhanced scoring zones with visual feedback
    const zoneWidth = this.boardWidth / 5;

    for (let i = 0; i < 5; i++) {
      const zoneGeometry = new THREE.PlaneGeometry(zoneWidth, 1);
      const zoneMaterial = new THREE.MeshBasicMaterial({
        color: 0x222222,
        transparent: true,
        opacity: 0.5
      });
      const zone = new THREE.Mesh(zoneGeometry, zoneMaterial);

      // Position zone
      zone.position.x = -this.boardWidth / 2 + i * zoneWidth + zoneWidth / 2;
      zone.position.y = -this.boardHeight / 2 + 0.5;
      zone.position.z = 0;

      this.scoringZones.push({
        mesh: zone,
        index: i,
        baseColor: 0x222222,
        glowIntensity: 0,
        pulsePhase: Math.random() * Math.PI * 2
      });

      this.scene.add(zone);
    }

    console.log('[pachinko] Created', this.scoringZones.length, 'scoring zones');
  }

  initializeParticleSystem() {
    // Create enhanced particle system
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const velocities = new Float32Array(this.particleCount * 3);
    const lifetimes = new Float32Array(this.particleCount);

    // Initialize particle data
    for (let i = 0; i < this.particleCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      velocities[i * 3] = 0;
      velocities[i * 3 + 1] = 0;
      velocities[i * 3 + 2] = 0;

      lifetimes[i] = 0;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    particleGeometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));

    this.particles = new THREE.Points(particleGeometry, this.particleMaterial);
    this.scene.add(this.particles);

    // Store particle data for updates
    this.particleData = {
      positions: positions,
      velocities: velocities,
      lifetimes: lifetimes
    };

    console.log('[pachinko] Initialized particle system with', this.particleCount, 'particles');
  }

  spawnBall(colorIndex) {
    if (this.balls.length >= this.maxBalls) return;

    // Create ball with enhanced material
    const ballGeometry = new THREE.SphereGeometry(this.ballRadius, 12, 12);
    const ball = new THREE.Mesh(ballGeometry, this.ballMaterials[colorIndex]);

    // Position ball at top with spawn effect
    const spawnX = (Math.random() - 0.5) * this.boardWidth * 0.8;
    const spawnY = this.boardHeight / 2 - 2;

    ball.position.set(spawnX, spawnY, 0);

    // Add velocity with initial drop
    ball.userData = {
      velocity: new THREE.Vector3(0, -2, 0),
      colorIndex: colorIndex,
      trail: null
    };

    // One reusable trail line per ball (no geometry/material churn in draw).
    if (this.trailEnabled) {
      const trailLength = 10;
      const trailPositions = new Float32Array(trailLength * 3);
      const trailGeometry = new THREE.BufferGeometry();
      trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
      const trailMaterial = new THREE.LineBasicMaterial({
        color: this.ballColors[colorIndex],
        transparent: true,
        opacity: 0.6
      });
      const trailLine = new THREE.Line(trailGeometry, trailMaterial);
      trailLine.frustumCulled = false;
      trailLine.visible = false;
      ball.userData.trail = { line: trailLine, positions: trailPositions, length: trailLength };
      this.scene.add(trailLine);
    }

    this.balls.push(ball);
    this.scene.add(ball);

    // Create enhanced spawn effect
    this.createSpawnEffect(this.ballColors[colorIndex]);

    // Create impact wave at spawn point
    this.createImpactWave(spawnX, spawnY, this.ballColors[colorIndex]);
  }

  // Replace the createNameSprite method:
  createNameSprite(name, x, y) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;

    // Clear canvas
    context.fillStyle = 'rgba(0, 0, 0, 0)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw text with enhanced effects
    context.font = 'bold 48px monospace';
    context.fillStyle = '#00ffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowBlur = 10;
    context.shadowColor = '#00ffff';

    // Add text outline for better visibility
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.strokeText(name.toUpperCase(), canvas.width / 2, canvas.height / 2);

    // Fill text
    context.fillText(name.toUpperCase(), canvas.width / 2, canvas.height / 2);

    // Create texture with proper settings
    const texture = new THREE.CanvasTexture(canvas, {
      generateMipmaps: false,  // Fix: Disable mipmaps for 2D textures
      minFilter: THREE.LinearFilter,  // Fix: Better filtering
      magFilter: THREE.LinearFilter
    });

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, 1);
    sprite.scale.set(this.nameScale, this.nameScale * 0.25, 1);

    return sprite;
  }

  createParticleExplosion(x, y, color, particleCount = 15) {
    // Find inactive particles
    const activeCount = Math.min(particleCount, this.particleCount);

    for (let i = 0; i < activeCount; i++) {
      if (this.particleData.lifetimes[i] <= 0) {
        // Set particle position
        this.particleData.positions[i * 3] = x;
        this.particleData.positions[i * 3 + 1] = y;
        this.particleData.positions[i * 3 + 2] = 0;

        // Create explosion pattern
        const angle = (Math.PI * 2 * i) / activeCount;
        const speed = this.particleSpeed * (0.5 + Math.random() * 0.5);
        const radius = 2 - (i / activeCount) * 2;

        this.particleData.velocities[i * 3] = Math.cos(angle) * speed;
        this.particleData.velocities[i * 3 + 1] = Math.sin(angle) * speed * 0.3;
        this.particleData.velocities[i * 3 + 2] = (Math.random() - 0.5) * speed * 0.5;

        // Set lifetime
        this.particleData.lifetimes[i] = this.particleLifetime;

        // Update particle color
        this.particles.material.color = new THREE.Color(color);
      }
    }
  }

  // Phase 4: Enhanced ball physics
  updateBalls() {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];
      const userData = ball.userData;

      // Apply gravity with audio reactivity
      const gravityModifier = 1 + (this.LOW / 100) * 0.3;
      userData.velocity.y -= this.gravity * gravityModifier * 0.016;

      // Apply air resistance
      userData.velocity.multiplyScalar(0.999);

      // Update position
      ball.position.addScaledVector(userData.velocity, 0.016);

      // Enhanced collision detection with pegs
      for (const peg of this.pegs) {
        const distance = ball.position.distanceTo(peg.position);
        if (distance < this.ballRadius + this.pegRadius) {
          // Calculate precise collision normal
          const collisionNormal = new THREE.Vector3()
            .subVectors(ball.position, peg.position)
            .normalize();

          // Calculate relative velocity
          const relativeVelocity = userData.velocity.clone();

          // Decompose velocity into normal and tangential components
          const velocityAlongNormal = collisionNormal.dot(relativeVelocity);
          const normalVelocity = collisionNormal.clone().multiplyScalar(velocityAlongNormal);
          const tangentialVelocity = relativeVelocity.clone().sub(normalVelocity);

          // Apply energy loss to normal component
          normalVelocity.multiplyScalar(-this.dampingFactor);

          // Combine components with slight randomness for natural feel
          userData.velocity.copy(tangentialVelocity.multiplyScalar(0.95)).add(normalVelocity);

          // Add small random perturbation
          userData.velocity.x += (Math.random() - 0.5) * 0.02;
          userData.velocity.y += (Math.random() - 0.5) * 0.01;

          // Push ball out of collision to prevent sticking
          const overlap = (this.ballRadius + this.pegRadius) - distance;
          ball.position.add(collisionNormal.clone().multiplyScalar(overlap * 1.1));

          // Add spin effect to ball
          ball.rotation.x += Math.random() * 0.1;
          ball.rotation.z += Math.random() * 0.1;

          // Create enhanced particle effect
          this.createParticleExplosion(
            peg.position.x,
            peg.position.y,
            this.ballColors[userData.colorIndex],
            20 // More particles for better visual
          );

          // Make peg react to collision
          peg.userData.targetGlow = 1;
          peg.userData.glowIntensity = 1;

          // Create impact wave
          this.createImpactWave(
            peg.position.x,
            peg.position.y,
            this.ballColors[userData.colorIndex]
          );
        }
      }

      // Enhanced ball-to-ball collision
      for (let j = 0; j < this.balls.length; j++) {
        if (i === j) continue;

        const otherBall = this.balls[j];
        const distance = ball.position.distanceTo(otherBall.position);

        if (distance < this.ballRadius * 2) {
          // Calculate collision normal
          const collisionNormal = new THREE.Vector3()
            .subVectors(ball.position, otherBall.position)
            .normalize();

          // Calculate relative velocity
          const relativeVelocity = userData.velocity.clone().sub(otherBall.userData.velocity);
          const velocityAlongNormal = collisionNormal.dot(relativeVelocity);

          // Only resolve if balls are moving toward each other
          if (velocityAlongNormal < 0) {
            // Calculate impulse
            const restitution = 0.8; // Bounciness
            const impulse = collisionNormal.multiplyScalar(velocityAlongNormal * (1 + restitution));

            // Apply impulse to both balls
            userData.velocity.sub(impulse);
            otherBall.userData.velocity.add(impulse);

            // Add spin effects
            ball.rotation.x += Math.random() * 0.2;
            ball.rotation.z += Math.random() * 0.2;
            otherBall.rotation.x += Math.random() * 0.2;
            otherBall.rotation.z += Math.random() * 0.2;

            // Create particle effect at collision point
            const collisionPoint = ball.position.clone().add(otherBall.position).multiplyScalar(0.5);
            this.createParticleExplosion(
              collisionPoint.x,
              collisionPoint.y,
              this.ballColors[userData.colorIndex],
              10
            );
          }
        }
      }

      // Enhanced bottom collision with scoring zones
      if (ball.position.y < -this.boardHeight / 2) {
        // Determine which scoring zone with more precision
        const zoneIndex = Math.floor((ball.position.x + this.boardWidth / 2) / (this.boardWidth / 5));
        const clampedZoneIndex = Math.max(0, Math.min(4, zoneIndex));

        // Calculate score based on zone position (center zones worth more)
        const zoneScore = 2 - Math.abs(2 - clampedZoneIndex);

        // Spawn name with enhanced effects
        const randomName = this.names[Math.floor(Math.random() * this.names.length)];
        const nameSprite = this.createNameSprite(
          randomName,
          -this.boardWidth / 2 + clampedZoneIndex * (this.boardWidth / 5) + (this.boardWidth / 10),
          -this.boardHeight / 2 - 2
        );

        // Add score-based scaling
        const scoreMultiplier = 1 + zoneScore * 0.2;
        nameSprite.scale.set(
          this.nameScale * scoreMultiplier,
          this.nameScale * 0.25 * scoreMultiplier,
          1
        );

        this.displayedNames.push({
          sprite: nameSprite,
          opacity: 0,
          targetOpacity: 1,
          lifetime: this.nameLifetime,
          age: 0,
          score: zoneScore,
          color: this.ballColors[userData.colorIndex]
        });

        this.scene.add(nameSprite);

        // Create celebration particle effect
        this.createCelebrationEffect(
          -this.boardWidth / 2 + clampedZoneIndex * (this.boardWidth / 5) + (this.boardWidth / 10),
          -this.boardHeight / 2 - 2,
          this.ballColors[userData.colorIndex],
          zoneScore
        );

        // Remove ball and its trail. The ball material is shared per color, so
        // only the per-ball geometry is disposed here.
        if (ball.userData.trail) {
          this.scene.remove(ball.userData.trail.line);
          ball.userData.trail.line.geometry.dispose();
          ball.userData.trail.line.material.dispose();
          ball.userData.trail = null;
        }
        ball.geometry.dispose();
        this.scene.remove(ball);
        this.balls.splice(i, 1);
      }

      // Enhanced out-of-bounds handling
      if (Math.abs(ball.position.x) > this.boardWidth / 2 + 5) {
        // Add wall bounce
        userData.velocity.x *= -0.8;
        ball.position.x = Math.sign(ball.position.x) * (this.boardWidth / 2 + 4.5);

        // Create small particle effect
        this.createParticleExplosion(
          ball.position.x,
          ball.position.y,
          this.ballColors[userData.colorIndex],
          5
        );
      }

      // Top boundary (shouldn't happen but safety check)
      if (ball.position.y > this.boardHeight / 2) {
        userData.velocity.y *= -0.5;
        ball.position.y = this.boardHeight / 2 - 0.1;
      }
    }
  }

  // Phase 4: Enhanced particle system
  updateParticles() {
    // Update particle positions
    for (let i = 0; i < this.particleCount; i++) {
      if (this.particleData.lifetimes[i] > 0) {
        // Update position
        this.particleData.positions[i * 3] += this.particleData.velocities[i * 3];
        this.particleData.positions[i * 3 + 1] += this.particleData.velocities[i * 3 + 1];
        this.particleData.positions[i * 3 + 2] += this.particleData.velocities[i * 3 + 2];

        // Apply gravity to particles
        this.particleData.velocities[i * 3 + 1] -= this.gravity * 0.01;

        // Update lifetime
        this.particleData.lifetimes[i]--;

        // Fade out based on lifetime
        const lifeRatio = this.particleData.lifetimes[i] / this.particleLifetime;
        if (lifeRatio <= 0) {
          // Reset particle
          this.particleData.positions[i * 3] = 0;
          this.particleData.positions[i * 3 + 1] = 0;
          this.particleData.positions[i * 3 + 2] = 0;
          this.particleData.velocities[i * 3] = 0;
          this.particleData.velocities[i * 3 + 1] = 0;
          this.particleData.velocities[i * 3 + 2] = 0;
          this.particleData.lifetimes[i] = 0;
        }
      }
    }

    // Update particle geometry
    this.particles.geometry.attributes.position.needsUpdate = true;

    // Update particle material opacity based on audio
    const audioOpacity = 0.5 + (this.HIGH / 100) * 0.5;
    this.particles.material.opacity = audioOpacity;
  }

  // Phase 4: Enhanced peg animations
  updatePegs() {
    for (const peg of this.pegs) {
      // Smoothly return peg to normal size
      if (peg.scale.x > 1) {
        peg.scale.x += (1 - peg.scale.x) * 0.1;
        peg.scale.y += (1 - peg.scale.y) * 0.1;
        peg.scale.z += (1 - peg.scale.z) * 0.1;
      }

      // Fade peg back to normal opacity
      if (peg.material.opacity > 0.8) {
        peg.material.opacity -= 0.02;
      }

      // Add subtle animation based on audio
      const audioScale = 1 + (this.MID / 100) * 0.1;
      peg.rotation.z += 0.001 * audioScale;

      // Update glow effect
      if (peg.userData.glowIntensity > peg.userData.targetGlow) {
        peg.userData.glowIntensity -= 0.05;
      } else if (peg.userData.glowIntensity < peg.userData.targetGlow) {
        peg.userData.glowIntensity += 0.05;
      }

      // Apply glow to peg material
      const glow = peg.userData.glowIntensity;
      peg.userData.glowColor.setRGB(
        Math.min(1, 1 + glow * 0.5),
        Math.min(1, 1 + glow * 0.5),
        Math.min(1, 1 + glow * 0.5)
      );
      peg.material.color.copy(peg.userData.glowColor);

      // Update glow sprite position
      const glowSprite = this.glowSprites[peg.userData.spriteIndex];
      if (glowSprite) {
        glowSprite.position.copy(peg.position);
        glowSprite.position.z = peg.position.z - 0.1;
        glowSprite.scale.setScalar(1 + peg.userData.glowIntensity);
        glowSprite.material.opacity = peg.userData.glowIntensity * 0.3;
      }
    }
  }

  // Phase 4: Enhanced scoring zone animations
  updateScoringZones() {
    for (let i = 0; i < this.scoringZones.length; i++) {
      const zone = this.scoringZones[i];

      // Pulsing based on audio and time
      const audioPulse = 1 + (this.MID / 100) * 0.5;
      const timePulse = Math.sin(this.time * 0.03 + zone.pulsePhase) * 0.2;
      const pulseScale = 1 + timePulse * audioPulse;

      zone.mesh.scale.set(1 + pulseScale * 0.1, 1, 1);
      zone.mesh.material.opacity = 0.3 + Math.abs(timePulse) * 0.3;

      // Color shifting for high scores
      if (this.HIGH > 70) {
        const hue = (this.time * 0.01 + i * 0.2) % 1;
        const color = new THREE.Color().setHSL(hue, 0.7, 0.9);
        zone.mesh.material.color = color;
      }
    }
  }

  // Phase 4: Enhanced name display system
  updateDisplayedNames() {
    for (let i = this.displayedNames.length - 1; i >= 0; i--) {
      const name = this.displayedNames[i];

      // Update age
      name.age++;

      // Enhanced fade in/out with score-based effects
      const fadeSpeed = this.nameFadeSpeed * (1 + name.score * 0.1);

      if (name.age < 30) {
        // Fade in with bounce effect
        const bounce = Math.sin(name.age * 0.2) * 0.1;
        name.opacity = Math.min(name.opacity + fadeSpeed, name.targetOpacity);

        name.sprite.scale.set(
          this.nameScale * (1 + bounce),
          this.nameScale * 0.25 * (1 + bounce),
          1
        );
      } else if (name.age > name.lifetime - 30) {
        // Fade out
        name.targetOpacity = 0;
        name.opacity = Math.max(name.opacity - fadeSpeed, 0);
      }

      // Update sprite opacity
      name.sprite.material.opacity = name.opacity;

      // Add subtle floating animation
      const float = Math.sin(this.time * 0.02 + i) * 0.05;
      name.sprite.position.y += float;

      // Add color pulsing based on audio
      if (this.HIGH > 70) {
        const hue = (this.time * 0.02 + name.age * 0.01) % 1;
        name.sprite.material.color.setHSL(hue, 0.8, 0.9);
      }

      // Remove faded names and release their canvas textures.
      if (name.age >= name.lifetime && name.opacity <= 0) {
        this.scene.remove(name.sprite);
        if (name.sprite.material) {
          if (name.sprite.material.map) name.sprite.material.map.dispose();
          name.sprite.material.dispose();
        }
        this.displayedNames.splice(i, 1);
      }
    }
  }

  // Phase 4: Audio-reactive board effects
  updateBoardEffects() {
    // Board glow based on low frequencies. Keep the background nearly black:
    // a large lightness offset turns the entire viewport gray and washes out
    // the board. Mutate the existing color instead of allocating per frame.
    const boardGlow = 0.008 + (this.LOW / 100) * 0.045;
    if (this.scene.background && this.scene.background.setHSL) {
      this.scene.background.setHSL(0.55, 0.55, boardGlow);
    }

    // Update screen overlay for effects
    if (this.screenOverlay) {
      const overlayOpacity = Math.min(0.2, (this.HIGH / 100) * 0.3);
      this.screenOverlay.material.opacity = overlayOpacity;

      // Add scanline effect
      const scanlineIntensity = Math.sin(this.time * 0.1) * 0.1 + 0.1;
      this.screenOverlay.material.color.setRGB(0, scanlineIntensity, scanlineIntensity);
    }
  }

  // Phase 4: Enhanced audio reactivity
  updateAudioReactivity() {
    // Dynamic spawn rates based on audio intensity
    const overallIntensity = (this.LOW + this.MID + this.HIGH) / 3;
    const spawnChance = 0.02 + (overallIntensity / 100) * 0.08;

    // Spawn balls with frequency-based colors
    if (this.LOW > this.lowThreshold && Math.random() < spawnChance) {
      this.spawnBall(0); // Red ball for bass
      this.createSpawnEffect(0xff0000); // Red spawn effect
    }

    if (this.MID > this.midThreshold && Math.random() < spawnChance) {
      this.spawnBall(1); // Green ball for mids
      this.createSpawnEffect(0x00ff00); // Green spawn effect
    }

    if (this.HIGH > this.highThreshold && Math.random() < spawnChance) {
      this.spawnBall(2); // Blue ball for treble
      this.createSpawnEffect(0x0000ff); // Blue spawn effect
    }

    // Enhanced screen shake on heavy bass
    if (this.screenShakeEnabled && this.LOW > 75) {
      const shakeIntensity = (this.LOW - 75) / 15 * 2;
      this.screenShake.x = (Math.random() - 0.5) * shakeIntensity;
      this.screenShake.y = (Math.random() - 0.5) * shakeIntensity * 0.5;
    } else {
      // Smooth camera return to center
      this.screenShake.x *= 0.9;
      this.screenShake.y *= 0.9;
    }

    // Audio-reactive gravity, relative to the configured base value
    this.gravity = this.baseGravity * (1 + (this.LOW / 100) * 0.3);

    // Dynamic damping based on audio
    this.dampingFactor = Math.max(0.4, this.baseDamping - (this.MID / 100) * 0.15);
  }

  // Phase 4: Enhanced spawn effect
  createSpawnEffect(color) {
    const spawnX = (Math.random() - 0.5) * this.boardWidth * 0.8;
    const spawnY = this.boardHeight / 2 - 1;

    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
      if (this.particleData.lifetimes[i] <= 0) {
        // Create inward spiral pattern
        const angle = (Math.PI * 2 * i) / particleCount + this.time * 0.1;
        const speed = this.particleSpeed * 0.5;
        const radius = 2 - (i / particleCount) * 2;

        this.particleData.positions[i * 3] = spawnX + Math.cos(angle) * radius;
        this.particleData.positions[i * 3 + 1] = spawnY + Math.sin(angle) * radius * 0.3;
        this.particleData.positions[i * 3 + 2] = 0;

        this.particleData.velocities[i * 3] = Math.cos(angle) * speed * radius;
        this.particleData.velocities[i * 3 + 1] = Math.sin(angle) * speed * radius * 0.3;
        this.particleData.velocities[i * 3 + 2] = (Math.random() - 0.5) * speed * 0.2;

        this.particleData.lifetimes[i] = 30;

        // Set particle color
        this.particles.material.color.setHex(color);
      }
    }
  }

  // Phase 4: Combo detection system
  checkCombos() {
    if (!this.comboEnabled) return;

    // Check for multiple names in same zone
    const zoneNames = {};

    for (const name of this.displayedNames) {
      if (name.opacity > 0.5) { // Only consider visible names
        const zoneKey = Math.floor((name.sprite.position.x + this.boardWidth / 2) / (this.boardWidth / 5));
        if (!zoneNames[zoneKey]) {
          zoneNames[zoneKey] = [];
        }
        zoneNames[zoneKey].push(name);
      }
    }

    // Create combo effects, but never more than once per second per zone.
    for (const zoneKey in zoneNames) {
      if (zoneNames[zoneKey].length >= 2) {
        const lastFired = this._comboCooldowns.get(zoneKey) || -Infinity;
        if (this.time - lastFired < 60) continue;
        this._comboCooldowns.set(zoneKey, this.time);

        // Create combo celebration
        const centerX = -this.boardWidth / 2 + parseInt(zoneKey) * (this.boardWidth / 5) + (this.boardWidth / 10);
        const centerY = -this.boardHeight / 2 - 2;

        // Create combo text
        this.createComboText(centerX, centerY, zoneNames[zoneKey].length);

        // Create combo particle burst
        this.createComboEffect(centerX, centerY, zoneNames[zoneKey].length);
      }
    }
  }

  // Phase 4: Combo text creation
  createComboText(x, y, count) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;

    context.fillStyle = 'rgba(0, 0, 0, 0)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.font = 'bold 24px monospace';
    context.fillStyle = '#ffff00';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowBlur = 15;
    context.shadowColor = '#ffff00';
    context.fillText(`${count}x COMBO!`, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, 3);
    sprite.scale.set(4, 1, 1);

    this.comboTexts.push(sprite);
    this.scene.add(sprite);

    // Auto-remove after animation
    const timerId = setTimeout(() => {
      this._comboTimers.delete(timerId);
      if (this.scene && this.scene.children.includes(sprite)) {
        this.scene.remove(sprite);
        if (sprite.material) {
          if (sprite.material.map) sprite.material.map.dispose();
          sprite.material.dispose();
        }
        const index = this.comboTexts.indexOf(sprite);
        if (index > -1) {
          this.comboTexts.splice(index, 1);
        }
      }
    }, 2000);
    this._comboTimers.add(timerId);
  }

  // Phase 4: Combo effect creation
  // Replace the createComboEffect method with this fully fixed version:
  // Replace the entire createComboEffect method with this fixed version:
  createComboEffect(x, y, count) {
    // Safety check for valid inputs
    if (typeof x !== 'number' || typeof y !== 'number' || typeof count !== 'number') {
      console.warn('[pachinko] Invalid inputs to createComboEffect');
      return;
    }

    const particleCount = 10 + count * 5;
    const activeCount = Math.min(particleCount, this.particleCount / 5);

    // Safety check for particle system
    if (!this.particleData || !this.particleData.lifetimes) {
      console.warn('[pachinko] Particle system not initialized');
      return;
    }

    for (let i = 0; i < activeCount; i++) {
      // Find an available particle index with safety checks
      let particleIndex = -1;
      for (let j = 0; j < this.particleCount; j++) {
        if (this.particleData.lifetimes[j] <= 0) {
          particleIndex = j;
          break;
        }
      }

      // Skip if no available particle or out of bounds
      if (particleIndex === -1 || particleIndex >= this.particleCount) {
        continue;
      }

      // Safely set particle data
      if (this.particleData.positions && this.particleData.velocities &&
        this.particleData.lifetimes) {

        // Create star burst pattern
        const angle = (Math.PI * 2 * i) / activeCount + this.time * 0.1;
        const speed = this.particleSpeed * (1 + count * 0.2);
        const radius = 1 + Math.random() * 2;

        // Safely set particle position
        this.particleData.positions[particleIndex * 3] = x;
        this.particleData.positions[particleIndex * 3 + 1] = y;
        this.particleData.positions[particleIndex * 3 + 2] = 0;

        // Safely set particle velocity
        this.particleData.velocities[particleIndex * 3] = Math.cos(angle) * speed;
        this.particleData.velocities[particleIndex * 3 + 1] = Math.sin(angle) * speed * radius * 0.3;
        this.particleData.velocities[particleIndex * 3 + 2] = (Math.random() - 0.5) * speed * 0.5;

        // Safely set lifetime
        this.particleData.lifetimes[particleIndex] = 40 + count * 5;

        // Safely set particle color
        if (this.particles && this.particles.material) {
          const color = new THREE.Color(0xffff00); // Golden color for combo
          this.particles.material.color = color;
        }
      }
    }
  }

  // Phase 4: Celebration effect creation
  createCelebrationEffect(x, y, color, score) {
    const particleCount = 10 + score * 5;
    const activeCount = Math.min(particleCount, this.particleCount);

    for (let i = 0; i < activeCount; i++) {
      const particleIndex = Math.floor(Math.random() * this.particleCount);
      if (this.particleData.lifetimes[particleIndex] <= 0) {
        // Set particle position
        this.particleData.positions[particleIndex * 3] = x;
        this.particleData.positions[particleIndex * 3 + 1] = y;
        this.particleData.positions[particleIndex * 3 + 2] = 0;

        // Create explosion pattern
        const angle = (Math.PI * 2 * i) / activeCount + this.time * 0.1;
        const speed = this.particleSpeed * (1 + score * 0.1);
        const radius = 1 + Math.random() * 2;

        this.particleData.velocities[particleIndex * 3] = Math.cos(angle) * speed * radius;
        this.particleData.velocities[particleIndex * 3 + 1] = Math.sin(angle) * speed * radius * 0.3;
        this.particleData.velocities[particleIndex * 3 + 2] = (Math.random() - 0.5) * speed * 0.5;

        this.particleData.lifetimes[particleIndex] = 40 + score * 10;

        // Set particle color
        this.particles.material.color.setHex(color);
      }
    }
  }

  // Add this method for creating energy trails
  createEnergyTrail(ball) {
    if (!this.trailEnabled || !ball.userData.trail) return;

    const { line, positions, length } = ball.userData.trail;
    const velocity = ball.userData.velocity;

    // Write positions in place; the BufferAttribute already exists.
    for (let i = 0; i < length; i++) {
      positions[i * 3] = ball.position.x - velocity.x * i * 0.1;
      positions[i * 3 + 1] = ball.position.y - velocity.y * i * 0.1;
      positions[i * 3 + 2] = ball.position.z - velocity.z * i * 0.1;
    }

    line.geometry.attributes.position.needsUpdate = true;
    line.visible = true;
  }

  // Add this method for creating impact waves
  createImpactWave(x, y, color) {
    // Create expanding ring effect; animated from the main draw loop so stop()
    // cannot leave an untracked requestAnimationFrame chain running.
    const ringGeometry = new THREE.RingGeometry(0.5, 1, 0.2, 20);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });

    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(x, y, 0);
    this.scene.add(ring);
    this.impactWaves.push({ mesh: ring, scale: 0.1, opacity: 0.8 });
  }

  updateImpactWaves() {
    for (let i = this.impactWaves.length - 1; i >= 0; i--) {
      const wave = this.impactWaves[i];
      wave.scale += 0.02;
      wave.opacity -= 0.02;
      wave.mesh.scale.set(wave.scale, wave.scale, wave.scale);
      wave.mesh.material.opacity = wave.opacity;

      if (wave.opacity <= 0) {
        this.scene.remove(wave.mesh);
        wave.mesh.geometry.dispose();
        wave.mesh.material.dispose();
        this.impactWaves.splice(i, 1);
      }
    }
  }

  // Add this method for creating floating particles
  createFloatingParticles(x, y, color, count = 20) {
    for (let i = 0; i < count; i++) {
      const particleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
      const particleMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.8
      });

      const particle = new THREE.Mesh(particleGeometry, particleMaterial);

      // Random position around center point
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 2;

      particle.position.set(
        x + Math.cos(angle) * distance,
        y + Math.sin(angle) * distance,
        Math.random() * 2
      );

      // Add velocity
      particle.userData = {
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          0
        ),
        lifetime: 100
      };

      this.scene.add(particle);
    }
  }

  draw = () => {
    if (!this.webglSupported || !this.renderer || !this.scene || !this.camera) {
      // Drop the stale frame id so a later start() does not think a loop is
      // already running while nothing is scheduled.
      this.frameId = null;
      return;
    }

    this.time++;

    // Update audio reactivity
    this.updateAudioReactivity();

    // Update all game elements
    this.updateBalls();
    this.updateParticles();
    this.updateDisplayedNames();
    this.updatePegs();
    this.updateScoringZones();
    this.updateBoardEffects();
    this.updateImpactWaves();
    this.checkCombos();

    // Update energy trails for balls
    for (const ball of this.balls) {
      if (Math.random() < 0.1) { // Occasionally create trails
        this.createEnergyTrail(ball);
      }
    }

    // Apply screen shake to camera
    this.camera.position.x = this.screenShake.x;
    this.camera.position.y = this.screenShake.y;

    // Render scene
    if (this.composer && this.bloomEnabled) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // Continue animation loop
    this.frameId = requestAnimationFrame(this.draw);
  }

  updateFrequencies(low, mid, high) {
    this.LOW = low;
    this.MID = mid;
    this.HIGH = high;
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    const aspect = rect.width / rect.height;
    const viewHeight = Math.max(this.boardHeight, this.boardWidth / aspect);
    const halfHeight = viewHeight / 2;
    const halfWidth = halfHeight * aspect;
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height, false);
  }

  start() {
    console.log('[pachinko] Starting animation...');

    // Handle resolution
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 2 && rect.height > 2) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }

    this.init();
    this.resize();

    if (!this._resizeHandler) {
      this._resizeHandler = () => this.resize();
      window.addEventListener('resize', this._resizeHandler);
    }

    if (!this.frameId && this.webglSupported && this.renderer) {
      this.frameId = requestAnimationFrame(this.draw);
    }
  }

  stop() {
    console.log('[pachinko] Stopping animation...');
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }

    for (const timerId of this._comboTimers) clearTimeout(timerId);
    this._comboTimers.clear();
    this._comboCooldowns.clear();

    // Clean up post-processing before the renderer/scene.
    try {
      if (this.bloomPass && this.bloomPass.dispose) this.bloomPass.dispose();
      if (this.renderPass && this.renderPass.dispose) this.renderPass.dispose();
      if (this.composer && this.composer.dispose) this.composer.dispose();
    } catch (err) {
      console.warn('[pachinko] Error disposing composer', err);
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    // Clear scene recursively (balls hold trail lines).
    if (this.scene) {
      this.scene.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) {
            if (material.map) material.map.dispose();
            material.dispose();
          }
        }
      });
      this.scene.clear();
    }

    // The base peg material is only a template for per-peg clones and the ball
    // materials may never have been attached to a ball, so scene traversal does
    // not necessarily release them. dispose() is safe to call twice.
    if (this.pegMaterial) this.pegMaterial.dispose();
    for (const material of this.ballMaterials) material.dispose();
    if (this.particleMaterial) this.particleMaterial.dispose();

    // Clear arrays and allow a clean restart.
    this.scene = null;
    this.camera = null;
    this.composer = null;
    this.renderPass = null;
    this.bloomPass = null;
    this.pegs = [];
    this.balls = [];
    this.scoringZones = [];
    this.displayedNames = [];
    this.comboTexts = [];
    this.glowSprites = [];
    this.impactWaves = [];
    this.screenOverlay = null;
    this.screenShake.x = 0;
    this.screenShake.y = 0;
    this.particles = null;
    this.particleData = [];
    this.pegMaterial = null;
    this.ballMaterials = [];
    this.particleMaterial = null;
    this.time = 0;
    this.ballSpawnTimer = 0;

    // Remove any error messages
    const viewContainer = this.canvas.closest('.animation-view');
    if (viewContainer) {
      viewContainer.querySelectorAll('.webgl-error-overlay').forEach((div) => div.remove());
    }
  }
}