import * as THREE from 'three';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';


export class WireframePlanetAnimation {
  constructor(canvas, config) {
    console.log('[wireframe-planet] Constructor called');
    this.canvas = canvas;
    this.config = config || {};
    this.frameId = null;
    
    // === CONFIGURATION VARIABLES ===
    
    // Planet Configuration
    this.planetRadius = 10;
    this.planetSegments = 32;
    this.planetColor = 0x00ffff; // Cyan
    this.planetGlowColor = 0x00ffff;
    this.planetRotationSpeed = 0.001;
    
    // Name Configuration
    this.nameCount = 20;
    this.nameOrbitRadius = { min: 15, max: 30 };
    this.nameRotationSpeed = { min: 0.002, max: 0.01 };
    this.nameColor = 0xff00ff; // Magenta
    this.nameSize = 5;
    this.nameFadeSpeed = 0.02;
    this.nameLifetime = 500;
    
    // Audio Sensitivity
    this.bassSensitivity = 0.5; // Low frequency effect strength
    this.midSensitivity = 0.7; // Mid frequency effect strength
    this.trebleSensitivity = 0.9; // High frequency effect strength
    
    // Camera Configuration
    this.cameraDistance = 40;
    this.cameraRotationSpeed = 0.001;
    this.cameraHeight = 10;
    
    // Effects Configuration
    this.particleCount = 100;
    this.particleColor = 0xffff00; // Yellow
    this.glowIntensity = 1.5;
    this.connectionLineOpacity = 0.3;
    
    // Post-processing Configuration (Phase 4)
    this.bloomEnabled = true;
    this.bloomStrength = 1.5;
    this.bloomRadius = 0.4;
    this.bloomThreshold = 0.85;
    
    // Audio frequency values
    this.LOW = 0;
    this.MID = 0;
    this.HIGH = 0;
    
    // Audio reactivity state
    this.planetPulse = 0;
    this.nameGlow = 0;
    this.cameraShake = { x: 0, y: 0, z: 0 };
    this.speedMultiplier = 1;
    
    // Names for floating displays
    this.names = ["UNKNOWN", "BOGEY", "TARGET"]; // Fallbacks
    this.fetchNames();
    
    // Three.js components
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.planet = null;
    this.starfield = null;
    
    // Post-processing components (Phase 4)
    this.composer = null;
    this.renderPass = null;
    this.bloomPass = null;
    
    // Name system components
    this.floatingNames = [];
    this.nameSprites = [];
    this.connectionLines = [];
    
    // Particle system
    this.particles = null;
    this.particleSystem = [];
    
    // Particle trails (Phase 4)
    this.particleTrails = [];
    this.trailGeometry = null;
    this.trailMaterial = null;
    this.trailPoints = [];
    
    // Animation parameters
    this.time = 0;
    this.cameraAngle = 0;
    this.nameSpawnTimer = 0;
    
    // Materials
    this.planetMaterial = null;
    
    // WebGL context check
    this.webglSupported = this.checkWebGLSupport();
    
    // Mouse interaction (Phase 4)
    this.mouse = { x: 0, y: 0 };
    this.raycaster = new THREE.Raycaster();
    this.hoveredName = null;
    
    console.log('[wireframe-planet] Constructor completed');
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
    console.log('[wireframe-planet] Fetching names...');
    try {
      const res = await fetch('./names.json');
      const data = await res.json();
      if (data.names && Array.isArray(data.names)) {
        this.names = data.names;
        console.log('[wireframe-planet] Names loaded successfully:', this.names.length, 'names');
      }
    } catch (e) {
      console.warn("[wireframe-planet] Could not load names.json", e);
    }
  }
  
  init() {
    console.log('[wireframe-planet] Initializing 3D scene...');
    
    if (!this.webglSupported) {
      console.error('[wireframe-planet] WebGL is not supported in this browser');
      this.showWebGLError();
      return;
    }
    
    try {
      // Initialize Three.js scene
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x000000); // Black space background
      
      // Setup camera
      const aspect = this.canvas.width / this.canvas.height;
      this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
      this.camera.position.set(this.cameraDistance, this.cameraHeight, 0);
      this.camera.lookAt(0, 0, 0);
      
      // Setup renderer with error handling
      this.renderer = new THREE.WebGLRenderer({ 
        canvas: this.canvas, 
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true
      });
      
      this.renderer.setSize(this.canvas.width, this.canvas.height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setClearColor(0x000000, 1);
      
      // Try to setup post-processing (Phase 4)
      try {
        this.setupPostProcessing();
      } catch (e) {
        console.warn('[wireframe-planet] Post-processing not available, using basic renderer:', e);
        this.bloomEnabled = false;
      }
      
      // Create materials
      this.createMaterials();
      
      // Create scene elements
      this.createStarfield();
      this.createPlanet();
      this.createLighting();
      
      // Initialize systems
      this.initializeNameSystem();
      this.initializeParticleSystem();
      this.initializeParticleTrails(); // Phase 4
      
      // Setup mouse interaction (Phase 4)
      this.setupMouseInteraction();
      
      console.log('[wireframe-planet] 3D scene initialized successfully');
    } catch (error) {
      console.error('[wireframe-planet] Error initializing 3D scene:', error);
      this.showWebGLError();
    }
  }
  
  // Phase 4: Setup post-processing effects
  setupPostProcessing() {
    // Create composer
    this.composer = new EffectComposer(this.renderer);
    
    // Add render pass
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    
    // Add bloom pass
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.canvas.width, this.canvas.height),
      this.bloomStrength,
      this.bloomRadius,
      this.bloomThreshold
    );
    this.bloomPass.renderToScreen = true;
    this.composer.addPass(this.bloomPass);
  }
  
  // Phase 4: Setup mouse interaction
  setupMouseInteraction() {
    this.canvas.addEventListener('mousemove', (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    });
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
    // Create wireframe material for planet
    this.planetMaterial = new THREE.MeshBasicMaterial({
      color: this.planetColor,
      wireframe: true,
      transparent: true,
      opacity: 0.8
    });
  }
  
  createStarfield() {
    // Create starfield background
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 2000;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount; i++) {
      // Random positions in sphere
      const radius = 100 + Math.random() * 200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      
      // Random star colors (white, blue, yellow tints)
      const colorChoice = Math.random();
      if (colorChoice < 0.33) {
        colors[i * 3] = 1.0;     // R
        colors[i * 3 + 1] = 1.0; // G
        colors[i * 3 + 2] = 1.0; // B (white)
      } else if (colorChoice < 0.66) {
        colors[i * 3] = 0.7;     // R
        colors[i * 3 + 1] = 0.8; // G
        colors[i * 3 + 2] = 1.0; // B (blue-white)
      } else {
        colors[i * 3] = 1.0;     // R
        colors[i * 3 + 1] = 0.9; // G
        colors[i * 3 + 2] = 0.7; // B (yellow-white)
      }
    }
    
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const starMaterial = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.8
    });
    
    this.starfield = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(this.starfield);
  }
  
  createPlanet() {
    // Create wireframe sphere geometry
    const planetGeometry = new THREE.SphereGeometry(
      this.planetRadius, 
      this.planetSegments, 
      this.planetSegments
    );
    
    // Create mesh with wireframe material
    this.planet = new THREE.Mesh(planetGeometry, this.planetMaterial);
    this.scene.add(this.planet);
    
    console.log('[wireframe-planet] Wireframe planet created with radius:', this.planetRadius);
  }
  
  createLighting() {
    // Add ambient light for subtle illumination
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    this.scene.add(ambientLight);
    
    // Add point light at planet center for glow effect
    const planetLight = new THREE.PointLight(
      this.planetGlowColor, 
      this.glowIntensity, 
      50
    );
    planetLight.position.set(0, 0, 0);
    this.scene.add(planetLight);
    
    // Add additional colored lights for atmosphere
    const coloredLights = [
      { color: 0xff00ff, intensity: 0.5, position: [20, 10, 20] },
      { color: 0x00ffff, intensity: 0.5, position: [-20, -10, 20] },
      { color: 0xffff00, intensity: 0.3, position: [0, 20, -20] }
    ];
    
    coloredLights.forEach(lightConfig => {
      const light = new THREE.PointLight(
        lightConfig.color, 
        lightConfig.intensity, 
        30
      );
      light.position.set(...lightConfig.position);
      this.scene.add(light);
    });
  }
  
  initializeNameSystem() {
    console.log('[wireframe-planet] Initializing name system...');
    
    // Create initial set of floating names
    for (let i = 0; i < this.nameCount; i++) {
      this.spawnFloatingName();
    }
    
    console.log('[wireframe-planet] Name system initialized with', this.floatingNames.length, 'names');
  }
  
  // Phase 4: Initialize particle trails
  initializeParticleTrails() {
    console.log('[wireframe-planet] Initializing particle trails...');
    
    // Create trail geometry and material
    this.trailGeometry = new THREE.BufferGeometry();
    this.trailMaterial = new THREE.LineBasicMaterial({
      color: this.particleColor,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending
    });
    
    // Initialize trail points array
    this.trailPoints = [];
    
    console.log('[wireframe-planet] Particle trails initialized');
  }
  
  initializeParticleSystem() {
    console.log('[wireframe-planet] Initializing particle system...');
    
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const velocities = new Float32Array(this.particleCount * 3);
    const lifetimes = new Float32Array(this.particleCount);
    
    for (let i = 0; i < this.particleCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      
      velocities[i * 3] = (Math.random() - 0.5) * 0.5;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      
      lifetimes[i] = 0;
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    particleGeometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
    
    const particleMaterial = new THREE.PointsMaterial({
      color: this.particleColor,
      size: 0.3,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    
    this.particles = new THREE.Points(particleGeometry, particleMaterial);
    this.scene.add(this.particles);
    
    console.log('[wireframe-planet] Particle system initialized with', this.particleCount, 'particles');
  }
  
  createNameSprite(name) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;
    
    // Clear canvas
    context.fillStyle = 'rgba(0, 0, 0, 0)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw text
    context.font = 'bold 48px monospace';
    context.fillStyle = '#ff00ff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowBlur = 10;
    context.shadowColor = '#ff00ff';
    context.fillText(name.toUpperCase(), canvas.width / 2, canvas.height / 2);
    
    // Create texture and sprite
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true,
      opacity: 0
    });
    
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(this.nameSize, this.nameSize * 0.25, 1);
    
    return sprite;
  }
  
  spawnFloatingName() {
    const randomName = this.names[Math.floor(Math.random() * this.names.length)];
    
    // Create orbital parameters
    const orbitRadius = this.nameOrbitRadius.min + 
      Math.random() * (this.nameOrbitRadius.max - this.nameOrbitRadius.min);
    const orbitSpeed = this.nameRotationSpeed.min + 
      Math.random() * (this.nameRotationSpeed.max - this.nameRotationSpeed.min);
    const orbitAngle = Math.random() * Math.PI * 2;
    const orbitHeight = (Math.random() - 0.5) * 10;
    
    // Create name sprite
    const sprite = this.createNameSprite(randomName);
    
    // Create connection line geometry
    const lineGeometry = new THREE.BufferGeometry();
    const lineMaterial = new THREE.LineBasicMaterial({
      color: this.nameColor,
      transparent: true,
      opacity: this.connectionLineOpacity
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    
    // Create floating name object
    const floatingName = {
      sprite: sprite,
      line: line,
      name: randomName,
      orbitRadius: orbitRadius,
      orbitSpeed: orbitSpeed,
      orbitAngle: orbitAngle,
      orbitHeight: orbitHeight,
      opacity: 0,
      targetOpacity: 1,
      lifetime: this.nameLifetime,
      age: 0,
      baseGlow: 1,
      scale: 1, // Phase 4
      targetScale: 1, // Phase 4
      hovered: false // Phase 4
    };
    
    // Add to scene and arrays
    this.scene.add(sprite);
    this.scene.add(line);
    this.floatingNames.push(floatingName);
    this.nameSprites.push(sprite);
    this.connectionLines.push(line);
  }
  
  removeFloatingName(index) {
    const floatingName = this.floatingNames[index];
    
    // Remove from scene
    this.scene.remove(floatingName.sprite);
    this.scene.remove(floatingName.line);
    
    // Remove from arrays
    this.floatingNames.splice(index, 1);
    this.nameSprites.splice(index, 1);
    this.connectionLines.splice(index, 1);
  }
  
  updateFloatingNames() {
    for (let i = this.floatingNames.length - 1; i >= 0; i--) {
      const name = this.floatingNames[i];
      
      // Update orbital position with audio reactivity
      const audioSpeedMultiplier = 1 + (this.MID / 100) * this.midSensitivity;
      name.orbitAngle += name.orbitSpeed * this.speedMultiplier * audioSpeedMultiplier;
      
      const x = Math.cos(name.orbitAngle) * name.orbitRadius;
      const z = Math.sin(name.orbitAngle) * name.orbitRadius;
      const y = name.orbitHeight + Math.sin(this.time * 0.01 + name.orbitAngle) * 2;
      
      // Update sprite position
      name.sprite.position.set(x, y, z);
      
      // Update connection line
      const linePositions = new Float32Array([
        0, 0, 0,  // Planet center
        x, y, z    // Name position
      ]);
      name.line.geometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
      
      // Update age and lifetime
      name.age++;
      
      // Fade in/out logic with audio reactivity
      const audioGlow = 1 + (this.MID / 100) * this.midSensitivity;
      
      if (name.age < 50) {
        // Fade in
        name.opacity = Math.min(name.opacity + this.nameFadeSpeed, name.targetOpacity);
      } else if (name.age > name.lifetime - 50) {
        // Fade out
        name.targetOpacity = 0;
        name.opacity = Math.max(name.opacity - this.nameFadeSpeed, 0);
      }
      
      // Update sprite opacity with audio glow
      name.sprite.material.opacity = name.opacity * name.baseGlow * audioGlow;
      name.line.material.opacity = name.opacity * this.connectionLineOpacity * audioGlow;
      
      // Phase 4: Update scale with smooth animation
      const scaleDiff = name.targetScale - name.scale;
      name.scale += scaleDiff * 0.1;
      name.sprite.scale.set(
        this.nameSize * name.scale, 
        this.nameSize * 0.25 * name.scale, 
        1
      );
      
      // Remove dead names
      if (name.age >= name.lifetime && name.opacity <= 0) {
        this.removeFloatingName(i);
      }
    }
    
    // Spawn new names periodically
    this.nameSpawnTimer++;
    if (this.nameSpawnTimer > 100 && this.floatingNames.length < this.nameCount) {
      this.spawnFloatingName();
      this.nameSpawnTimer = 0;
    }
  }
  
  // Phase 4: Check for name hover
  checkNameHover() {
    // Update raycaster with mouse position
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Check for intersections with name sprites
    const intersects = this.raycaster.intersectObjects(this.nameSprites);
    
    // Reset all names to non-hovered state
    this.floatingNames.forEach(name => {
      if (name.hovered) {
        name.hovered = false;
        name.targetScale = 1;
      }
    });
    
    // Set hovered state for intersected name
    if (intersects.length > 0) {
      const intersectedSprite = intersects[0].object;
      const hoveredName = this.floatingNames.find(name => name.sprite === intersectedSprite);
      
      if (hoveredName) {
        hoveredName.hovered = true;
        hoveredName.targetScale = 1.2;
        
        // Update hovered name reference
        if (this.hoveredName !== hoveredName) {
          this.hoveredName = hoveredName;
          console.log('[wireframe-planet] Hovered name:', hoveredName.name);
        }
      }
    } else if (this.hoveredName) {
      this.hoveredName = null;
    }
  }
  
  // Phase 4: Update particle trails
  updateParticleTrails() {
    // Add current particle positions to trail points
    if (this.particles) {
      const positions = this.particles.geometry.attributes.position.array;
      
      for (let i = 0; i < this.particleCount; i++) {
        const lifetime = this.particles.geometry.attributes.lifetime.array[i];
        
        if (lifetime > 0) {
          // Add position to trail
          this.trailPoints.push(
            positions[i * 3],
            positions[i * 3 + 1],
            positions[i * 3 + 2]
          );
          
          // Limit trail length
          if (this.trailPoints.length > this.particleCount * 3 * 10) {
            this.trailPoints.splice(0, 3);
          }
        }
      }
      
      // Update trail geometry
      if (this.trailPoints.length > 0) {
        this.trailGeometry.setAttribute(
          'position', 
          new THREE.BufferAttribute(new Float32Array(this.trailPoints), 3)
        );
        
        // Create or update trail line
        if (!this.trailLine) {
          this.trailLine = new THREE.Line(this.trailGeometry, this.trailMaterial);
          this.scene.add(this.trailLine);
        }
      }
    }
  }
  
  updateParticles() {
    if (!this.particles) return;
    
    const positions = this.particles.geometry.attributes.position.array;
    const velocities = this.particles.geometry.attributes.velocity.array;
    const lifetimes = this.particles.geometry.attributes.lifetime.array;
    
    // Trigger particle bursts with high frequencies
    if (this.HIGH > 70 && Math.random() < this.trebleSensitivity * 0.1) {
      this.triggerParticleBurst();
    }
    
    for (let i = 0; i < this.particleCount; i++) {
      if (lifetimes[i] > 0) {
        // Update position
        positions[i * 3] += velocities[i * 3];
        positions[i * 3 + 1] += velocities[i * 3 + 1];
        positions[i * 3 + 2] += velocities[i * 3 + 2];
        
        // Update lifetime
        lifetimes[i]--;
        
        // Fade out
        const opacity = lifetimes[i] / 100;
        if (opacity <= 0) {
          // Reset particle
          positions[i * 3] = 0;
          positions[i * 3 + 1] = 0;
          positions[i * 3 + 2] = 0;
          lifetimes[i] = 0;
        }
      }
    }
    
    // Update geometry
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.lifetime.needsUpdate = true;
    
    // Update particle material opacity based on audio
    const audioOpacity = 0.5 + (this.HIGH / 100) * this.trebleSensitivity;
    this.particles.material.opacity = audioOpacity;
  }
  
  triggerParticleBurst() {
    const positions = this.particles.geometry.attributes.position.array;
    const velocities = this.particles.geometry.attributes.velocity.array;
    const lifetimes = this.particles.geometry.attributes.lifetime.array;
    
    // Find inactive particles
    for (let i = 0; i < this.particleCount; i++) {
      if (lifetimes[i] <= 0) {
        // Activate particle at random position on planet surface
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        const x = Math.sin(phi) * Math.cos(theta) * this.planetRadius;
        const y = Math.sin(phi) * Math.sin(theta) * this.planetRadius;
        const z = Math.cos(phi) * this.planetRadius;
        
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        
        // Random outward velocity
        const speed = 0.1 + Math.random() * 0.3;
        velocities[i * 3] = x / this.planetRadius * speed;
        velocities[i * 3 + 1] = y / this.planetRadius * speed;
        velocities[i * 3 + 2] = z / this.planetRadius * speed;
        
        lifetimes[i] = 50 + Math.random() * 50;
        
        // Limit burst size
        break;
      }
    }
  }
  
  // Phase 4: Update post-processing effects
  updatePostProcessing() {
    if (!this.bloomPass || !this.bloomEnabled) return;
    
    // Update bloom parameters based on audio
    const audioBloomStrength = this.bloomStrength * (1 + (this.HIGH / 100) * this.trebleSensitivity);
    this.bloomPass.strength = audioBloomStrength;
    
    // Adjust bloom radius based on mid frequencies
    const audioBloomRadius = this.bloomRadius * (1 + (this.MID / 100) * this.midSensitivity * 0.5);
    this.bloomPass.radius = audioBloomRadius;
    
    // Adjust bloom threshold based on low frequencies
    const audioBloomThreshold = this.bloomThreshold * (1 - (this.LOW / 100) * this.bassSensitivity * 0.2);
    this.bloomPass.threshold = Math.max(0.1, audioBloomThreshold);
  }
  
  updateAudioReactivity() {
    // Planet pulsing with low frequencies
    this.planetPulse = 1 + (this.LOW / 100) * this.bassSensitivity * 0.3;
    
    // Camera shake with heavy bass
    if (this.LOW > 80) {
      this.cameraShake.x = (Math.random() - 0.5) * this.bassSensitivity * 2;
      this.cameraShake.y = (Math.random() - 0.5) * this.bassSensitivity * 2;
      this.cameraShake.z = (Math.random() - 0.5) * this.bassSensitivity * 2;
    } else {
      this.cameraShake.x *= 0.9;
      this.cameraShake.y *= 0.9;
      this.cameraShake.z *= 0.9;
    }
    
    // Speed multiplier based on overall audio intensity
    this.speedMultiplier = 1 + (this.LOW + this.MID + this.HIGH) / 300;
    
    // Name glow intensity
    this.nameGlow = 1 + (this.MID / 100) * this.midSensitivity;
  }
  
  updateCamera() {
    // Rotate camera around planet with audio reactivity
    const audioRotationSpeed = this.cameraRotationSpeed * this.speedMultiplier;
    this.cameraAngle += audioRotationSpeed;
    
    this.camera.position.x = Math.cos(this.cameraAngle) * this.cameraDistance + this.cameraShake.x;
    this.camera.position.z = Math.sin(this.cameraAngle) * this.cameraDistance + this.cameraShake.z;
    this.camera.position.y = this.cameraHeight + this.cameraShake.y;
    
    // Always look at planet center
    this.camera.lookAt(0, 0, 0);
  }
  
  updatePlanet() {
    // Rotate planet with audio reactivity
    if (this.planet) {
      const audioRotationSpeed = this.planetRotationSpeed * this.speedMultiplier;
      this.planet.rotation.y += audioRotationSpeed;
      this.planet.rotation.x += audioRotationSpeed * 0.5;
      
      // Apply planet pulsing
      this.planet.scale.set(this.planetPulse, this.planetPulse, this.planetPulse);
      
      // Update planet material opacity with audio
      const audioOpacity = 0.5 + (this.LOW / 100) * this.bassSensitivity * 0.5;
      this.planet.material.opacity = Math.min(1, audioOpacity);
    }
  }
  
  updateStarfield() {
    // Slowly rotate starfield for parallax effect
    if (this.starfield) {
      this.starfield.rotation.y += 0.0001 * this.speedMultiplier;
      this.starfield.rotation.x += 0.00005 * this.speedMultiplier;
    }
  }
  
  draw = () => {
    if (!this.webglSupported || !this.renderer) {
      return;
    }
    
    this.time++;
    
    // Update audio reactivity
    this.updateAudioReactivity();
    
    // Update scene elements
    this.updateCamera();
    this.updatePlanet();
    this.updateStarfield();
    this.updateFloatingNames();
    this.updateParticles();
    
    // Update Phase 4 features
    this.checkNameHover();
    this.updateParticleTrails();
    this.updatePostProcessing();
    
    // Render scene with post-processing
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
    console.log('[wireframe-planet] Starting animation...');
    
    // Handle Resolution
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    
    console.log('[wireframe-planet] Canvas size set to:', this.canvas.width, 'x', this.canvas.height);
    
    // Initialize 3D scene
    this.init();
    
    if (!this.frameId && this.webglSupported) {
      console.log('[wireframe-planet] Starting animation frame loop');
      this.frameId = requestAnimationFrame(this.draw);
    } else {
      console.log('[wireframe-planet] Animation already running or WebGL not supported');
    }
  }
  
  stop() {
    console.log('[wireframe-planet] Stopping animation...');
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
      while(this.scene.children.length > 0) {
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
    this.floatingNames = [];
    this.nameSprites = [];
    this.connectionLines = [];
    this.particleSystem = [];
    this.particleTrails = [];
    this.trailPoints = [];
    
    // Remove any error messages
    const viewContainer = this.canvas.closest('.animation-view');
    if (viewContainer) {
      const errorDivs = viewContainer.querySelectorAll('div[style*="WebGL not supported"]');
      errorDivs.forEach(div => div.remove());
    }
  }
}