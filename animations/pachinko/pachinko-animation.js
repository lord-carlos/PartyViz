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
    this.gravity = this.config.settings?.gravity || 0.5;
    this.dampingFactor = this.config.settings?.dampingFactor || 0.8; // Energy loss on bounce
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

    if (!this.webglSupported) {
      console.error('[pachinko] WebGL is not supported in this browser');
      this.showWebGLError();
      return;
    }

    try {
      // Initialize Three.js scene
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x000000); // Black background

      // Setup camera
      const aspect = this.canvas.width / this.canvas.height;
      this.camera = new THREE.OrthographicCamera(
        -this.boardWidth / 2, this.boardWidth / 2,  // Fix: use same aspect for both dimensions
        this.boardHeight / 2, -this.boardHeight / 2,   // Fix: use same aspect for both dimensions
        1,                                    // Near plane
        1000                                   // Far plane
      );
      this.camera.position.z = 10;

      // Setup renderer
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true
      });

      this.renderer.setSize(this.canvas.width, this.canvas.height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

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
    // Create error message as HTML overlay
    const errorDiv = document.createElement('div');
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

    const viewContainer = this.canvas.closest('.animation-view');
    if (viewContainer) {
      viewContainer.appendChild(errorDiv);
    }
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
        const peg = new THREE.Mesh(pegGeometry, this.pegMaterial);

        // Position peg
        peg.position.x = -this.boardWidth / 2 + xOffset + (col + 1) * xSpacing;
        peg.position.y = this.boardHeight / 2 - (row + 1) * ySpacing;
        peg.position.z = 0;

        // Add peg data for effects
        peg.userData = {
          baseColor: 0xffffff,
          glowIntensity: 0,
          targetGlow: 0,
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
      trail: [] // Phase 4: Trail data
    };

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
      ball.position.add(userData.velocity.clone().multiplyScalar(0.016));

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

        // Remove ball
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
      const glowColor = new THREE.Color(peg.userData.baseColor);
      glowColor.r += peg.userData.glowIntensity * 0.5;
      glowColor.g += peg.userData.glowIntensity * 0.5;
      glowColor.b += peg.userData.glowIntensity * 0.5;
      peg.material.color = glowColor;

      // Update glow sprite position
      if (this.glowSprites[this.pegs.indexOf(peg)]) {
        this.glowSprites[this.pegs.indexOf(peg)].position.copy(peg.position);
        this.glowSprites[this.pegs.indexOf(peg)].position.z = peg.position.z - 0.1;
        this.glowSprites[this.pegs.indexOf(peg)].scale.setScalar(1 + peg.userData.glowIntensity);
        this.glowSprites[this.pegs.indexOf(peg)].material.opacity = peg.userData.glowIntensity * 0.3;
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
        name.rotation += 0.05;

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
        const color = new THREE.Color().setHSL(hue, 0.8, 0.9);
        name.sprite.material.color = color;
      }

      // Remove faded names
      if (name.age >= name.lifetime && name.opacity <= 0) {
        this.scene.remove(name.sprite);
        this.displayedNames.splice(i, 1);
      }
    }
  }

  // Phase 4: Audio-reactive board effects
  updateBoardEffects() {
    // Board glow based on low frequencies
    const boardGlow = 0.1 + (this.LOW / 100) * 0.3;
    this.scene.background = new THREE.Color(0x000000).offsetHSL(0, 0, boardGlow);

    // Update screen overlay for effects
    if (this.screenOverlay) {
      const overlayOpacity = Math.min(0.2, (this.HIGH / 100) * 0.3);
      this.screenOverlay.material.opacity = overlayOpacity;

      // Add scanline effect
      const scanlineIntensity = Math.sin(this.time * 0.1) * 0.1 + 0.1;
      this.screenOverlay.material.color = new THREE.Color(0x00ffff).multiplyScalar(scanlineIntensity);
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
    if (this.screenShakeEnabled && this.LOW > 85) {
      const shakeIntensity = (this.LOW - 85) / 15 * 2;
      this.screenShake.x = (Math.random() - 0.5) * shakeIntensity;
      this.screenShake.y = (Math.random() - 0.5) * shakeIntensity * 0.5;
    } else {
      // Smooth camera return to center
      this.screenShake.x *= 0.9;
      this.screenShake.y *= 0.9;
    }

    // Audio-reactive gravity
    this.gravity = 0.5 + (this.LOW / 100) * 0.3;

    // Dynamic damping based on audio
    this.dampingFactor = 0.8 - (this.MID / 100) * 0.2;
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
        this.particles.material.color = new THREE.Color(color);
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

    // Create combo effects
    for (const zoneKey in zoneNames) {
      if (zoneNames[zoneKey].length >= 2) {
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
    setTimeout(() => {
      if (this.scene.children.includes(sprite)) {
        this.scene.remove(sprite);
        const index = this.comboTexts.indexOf(sprite);
        if (index > -1) {
          this.comboTexts.splice(index, 1);
        }
      }
    }, 2000);
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
        this.particleData.lifetimes && this.particleData.colors) {

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
        this.particles.material.color = new THREE.Color(color);
      }
    }
  }

  // Add this method for creating energy trails
  createEnergyTrail(ball) {
    if (!this.trailEnabled || !ball.userData.trail) return;

    // Create trail points behind ball
    const trailLength = 10;
    const trailPoints = [];

    for (let i = 0; i < trailLength; i++) {
      // Calculate trail position
      const trailPos = ball.position.clone().add(
        ball.userData.velocity.clone().multiplyScalar(-i * 0.1)
      );
      trailPoints.push(trailPos);
    }

    // Create trail geometry
    const trailGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(trailLength * 3);

    for (let i = 0; i < trailLength; i++) {
      positions[i * 3] = trailPoints[i].x;
      positions[i * 3 + 1] = trailPoints[i].y;
      positions[i * 3 + 2] = trailPoints[i].z;
    }

    trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Create trail material with ball color
    const trailMaterial = new THREE.LineBasicMaterial({
      color: this.ballColors[ball.userData.colorIndex],
      transparent: true,
      opacity: 0.6
    });

    // Create trail line
    const trail = new THREE.Line(trailGeometry, trailMaterial);
    this.scene.add(trail);

    // Add to ball's trail array for cleanup
    ball.userData.trail.push(trail);

    // Limit trail length
    if (ball.userData.trail.length > 5) {
      const oldTrail = ball.userData.trail.shift();
      this.scene.remove(oldTrail);
    }
  }

  // Add this method for creating impact waves
  createImpactWave(x, y, color) {
    // Create expanding ring effect
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

    // Animate and remove ring
    let scale = 0.1;
    let opacity = 0.8;

    const animateRing = () => {
      scale += 0.02;
      opacity -= 0.02;

      ring.scale.set(scale, scale, scale);
      ring.material.opacity = opacity;

      if (opacity > 0) {
        requestAnimationFrame(animateRing);
      } else {
        this.scene.remove(ring);
      }
    };

    animateRing();
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
    if (!this.webglSupported || !this.renderer) {
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

  start() {
    console.log('[pachinko] Starting animation...');

    // Handle Resolution
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;

    console.log('[pachinko] Canvas size set to:', this.canvas.width, 'x', this.canvas.height);

    // Initialize 3D scene
    this.init();

    if (!this.frameId && this.webglSupported) {
      console.log('[pachinko] Starting animation frame loop');
      this.frameId = requestAnimationFrame(this.draw);
    } else {
      console.log('[pachinko] Animation already running or WebGL not supported');
    }
  }

  stop() {
    console.log('[pachinko] Stopping animation...');
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    // Clean up Three.js resources
    if (this.renderer) {
      this.renderer.dispose();
    }

    // Clear scene
    if (this.scene) {
      while (this.scene.children.length > 0) {
        const child = this.scene.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(material => material.dispose());
          } else {
            child.material.dispose();
          }
        }
        this.scene.remove(child);
      }
    }

    // Clear arrays
    this.pegs = [];
    this.balls = [];
    this.scoringZones = [];
    this.displayedNames = [];
    this.comboTexts = [];
    this.glowSprites = [];

    // Remove any error messages
    const viewContainer = this.canvas.closest('.animation-view');
    if (viewContainer) {
      const errorDivs = viewContainer.querySelectorAll('div[style*="WebGL not supported"]');
      errorDivs.forEach(div => div.remove());
    }
  }
}