import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';

export class SynthwaveCityAnimation {
  constructor(canvas, config) {
    console.log('[synthwave-city] Constructor called');
    this.canvas = canvas;
    this.config = config || {};
    this.frameId = null;
    
    // Color palette for the city
    this.colors = {
      sky: 0x0a0a1a,        // Dark blue
      fog: 0x0a0a2a,         // Slightly lighter blue
      ground: 0x0a0a0a,       // Dark gray
      grid: 0x16213e,        // Dark blue
      buildings: {
        tower: 0x1a1a2e,     // Dark blue
        block: 0x16213e,     // Dark blue
        pyramid: 0x0f3460     // Dark blue
      },
      windows: 0x00ffff,      // Cyan
      vehicles: 0xff00ff,     // Magenta
      lights: {
        ambient: 0x404040,    // Gray
        directional: 0xff00ff, // Magenta
        point: 0x00ffff      // Cyan
      },
      particles: {
        colors: [
          0xff00ff,           // Magenta
          0x00ffff,           // Cyan
          0xffff00            // Yellow
        ]
      },
      hologram: 0x00ffff      // Cyan
    };
    
    // Audio frequency values
    this.LOW = 0;
    this.MID = 0;
    this.HIGH = 0;
    
    // Names for holographic displays
    this.names = ["UNKNOWN", "BOGEY", "TARGET"]; // Fallbacks
    this.fetchNames();
    
    // Three.js components
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.buildings = [];
    this.holographicNames = [];
    this.particles = null;
    this.vehicles = [];
    
    // Animation parameters
    this.time = 0;
    this.cameraAngle = 0;
    this.citySize = 20;
    this.buildingCount = 0;
    
    // Materials
    this.buildingMaterials = {};
    this.windowMaterial = null;
    this.roadMaterial = null;
    
    // WebGL context check
    this.webglSupported = this.checkWebGLSupport();
    
    console.log('[synthwave-city] Constructor completed');
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
    console.log('[synthwave-city] Fetching names...');
    try {
      const res = await fetch('./names.json');
      const data = await res.json();
      if (data.names && Array.isArray(data.names)) {
        this.names = data.names;
        console.log('[synthwave-city] Names loaded successfully:', this.names.length, 'names');
      }
    } catch (e) {
      console.warn("[synthwave-city] Could not load names.json", e);
    }
  }
  
  init() {
    console.log('[synthwave-city] Initializing 3D scene...');
    
    if (!this.webglSupported) {
      console.error('[synthwave-city] WebGL is not supported in this browser');
      this.showWebGLError();
      return;
    }
    
    try {
      // Initialize Three.js scene
      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.Fog(this.colors.fog, 50, 200);
      
      // Setup camera
      const aspect = this.canvas.width / this.canvas.height;
      this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
      this.camera.position.set(30, 25, 30);
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
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.setClearColor(this.colors.sky, 1);
      
      // Create materials
      this.createMaterials();
      
      // Create city
      this.createGround();
      this.generateCity();
      this.createLighting();
      this.createParticles();
      this.createVehicles();
      
      console.log('[synthwave-city] 3D scene initialized successfully');
    } catch (error) {
      console.error('[synthwave-city] Error initializing 3D scene:', error);
      this.showWebGLError();
    }
  }
  
  showWebGLError() {
    // Create error message as HTML overlay instead of canvas drawing
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
      background: rgba(0, 0, 51, 0.9);
      padding: 20px;
      border: 2px solid #00ffff;
      border-radius: 10px;
      z-index: 1000;
    `;
    errorDiv.innerHTML = `
      <div>WebGL not supported</div>
      <div style="color: #00ffff; font-size: 16px; margin-top: 10px;">Please try a different browser</div>
    `;
    
    // Find the parent view container and add error message
    const viewContainer = this.canvas.closest('.animation-view');
    if (viewContainer) {
      viewContainer.appendChild(errorDiv);
    }
  }
  
  createMaterials() {
    // Building materials for different types
    this.buildingMaterials.tower = new THREE.MeshPhongMaterial({
      color: this.colors.buildings.tower,
      emissive: this.colors.buildings.tower,
      emissiveIntensity: 0.2,
      shininess: 10
    });
    
    this.buildingMaterials.block = new THREE.MeshPhongMaterial({
      color: this.colors.buildings.block,
      emissive: this.colors.buildings.block,
      emissiveIntensity: 0.2,
      shininess: 10
    });
    
    this.buildingMaterials.pyramid = new THREE.MeshPhongMaterial({
      color: this.colors.buildings.pyramid,
      emissive: this.colors.buildings.pyramid,
      emissiveIntensity: 0.2,
      shininess: 10
    });
    
    // Window material
    this.windowMaterial = new THREE.MeshBasicMaterial({
      color: this.colors.windows
    });
    
    // Road material
    this.roadMaterial = new THREE.MeshBasicMaterial({ 
      color: this.colors.ground
    });
  }
  
  createGround() {
    // Create ground plane
    const groundGeometry = new THREE.PlaneGeometry(this.citySize * 10, this.citySize * 10);
    const ground = new THREE.Mesh(groundGeometry, this.roadMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    
    // Create grid lines
    const gridHelper = new THREE.GridHelper(this.citySize * 10, this.citySize, this.colors.grid, this.colors.ground);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);
  }
  
  generateCity() {
    const gridSize = this.citySize;
    const buildingTypes = ['tower', 'block', 'pyramid'];
    
    for (let x = -gridSize/2; x < gridSize/2; x++) {
      for (let z = -gridSize/2; z < gridSize/2; z++) {
        // Skip some positions for variety
        if (Math.random() < 0.3) continue;
        
        const buildingType = buildingTypes[Math.floor(Math.random() * buildingTypes.length)];
        const building = this.createBuilding(x * 4, z * 4, buildingType);
        
        if (building) {
          this.scene.add(building);
          this.buildings.push(building);
          this.buildingCount++;
        }
      }
    }
    
    console.log('[synthwave-city] Generated', this.buildingCount, 'buildings');
  }
  
  createBuilding(x, z, type) {
    let geometry, mesh;
    const height = 5 + Math.random() * 20;
    
    switch(type) {
      case 'tower':
        geometry = new THREE.BoxGeometry(1, height, 1);
        mesh = new THREE.Mesh(geometry, this.buildingMaterials.tower.clone());
        mesh.position.set(x, height/2, z);
        break;
        
      case 'block':
        geometry = new THREE.BoxGeometry(2, height, 2);
        mesh = new THREE.Mesh(geometry, this.buildingMaterials.block.clone());
        mesh.position.set(x, height/2, z);
        break;
        
      case 'pyramid':
        geometry = new THREE.ConeGeometry(1.5, height, 4);
        mesh = new THREE.Mesh(geometry, this.buildingMaterials.pyramid.clone());
        mesh.position.set(x, height/2, z);
        mesh.rotation.y = Math.PI / 4;
        break;
        
      default:
        return null;
    }
    
    // Set up userData BEFORE calling addWindows
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { 
      type: type, 
      baseHeight: height, 
      baseY: height/2,
      windowLights: []
    };
    
    // Add windows to block buildings
    if (type === 'block') {
      this.addWindows(mesh, height);
    }
    
    return mesh;
  }
  
  addWindows(building, height) {
    const windowRows = Math.floor(height / 2);
    const windowCols = 2;
    
    for (let row = 0; row < windowRows; row++) {
      for (let col = 0; col < windowCols; col++) {
        const windowGeometry = new THREE.PlaneGeometry(0.3, 0.3);
        const windowMesh = new THREE.Mesh(windowGeometry, this.windowMaterial.clone());
        
        windowMesh.position.set(
          col === 0 ? -1.01 : 1.01,
          row * 2 - height/2 + 1,
          0
        );
        
        windowMesh.userData = { 
          baseIntensity: 0.3 + Math.random() * 0.7,
          flickerSpeed: 0.01 + Math.random() * 0.02
        };
        
        building.add(windowMesh);
        // Now building.userData.windowLights should exist
        if (building.userData && building.userData.windowLights) {
          building.userData.windowLights.push(windowMesh);
        }
      }
    }
  }
  
  createLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(this.colors.lights.ambient, 0.3);
    this.scene.add(ambientLight);
    
    // Directional light (sun/moon)
    const directionalLight = new THREE.DirectionalLight(this.colors.lights.directional, 0.5);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    this.scene.add(directionalLight);
    
    // Point lights for atmosphere
    for (let i = 0; i < 5; i++) {
      const colorIndex = i % this.colors.particles.colors.length;
      const pointLight = new THREE.PointLight(
        this.colors.particles.colors[colorIndex], 
        0.5, 
        20
      );
      pointLight.position.set(
        (Math.random() - 0.5) * this.citySize * 4,
        10 + Math.random() * 10,
        (Math.random() - 0.5) * this.citySize * 4
      );
      this.scene.add(pointLight);
    }
  }
  
  createParticles() {
    const particleCount = 500; // Reduced for performance
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * this.citySize * 10;
      positions[i * 3 + 1] = Math.random() * 30;
      positions[i * 3 + 2] = (Math.random() - 0.5) * this.citySize * 10;
      
      // Use our color palette
      const color = new THREE.Color(
        this.colors.particles.colors[i % this.colors.particles.colors.length]
      );
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const material = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.6
    });
    
    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }
  
  createVehicles() {
    const vehicleCount = 10; // Reduced for performance
    
    for (let i = 0; i < vehicleCount; i++) {
      const geometry = new THREE.BoxGeometry(0.2, 0.1, 0.4);
      // Use MeshStandardMaterial instead of MeshBasicMaterial to support emissive
      const material = new THREE.MeshStandardMaterial({ 
        color: this.colors.vehicles,
        emissive: this.colors.vehicles,
        emissiveIntensity: 0.5
      });
      
      const vehicle = new THREE.Mesh(geometry, material);
      vehicle.position.set(
        (Math.random() - 0.5) * this.citySize * 4,
        5 + Math.random() * 15,
        (Math.random() - 0.5) * this.citySize * 4
      );
      
      vehicle.userData = {
        speed: 0.1 + Math.random() * 0.2,
        direction: new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          0,
          (Math.random() - 0.5) * 2
        ).normalize()
      };
      
      this.vehicles.push(vehicle);
      this.scene.add(vehicle);
    }
  }
  
  createHolographicName(x, y, z, name) {
    // Create text sprite for name
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;
    
    context.fillStyle = 'rgba(0, 0, 0, 0)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    context.font = 'bold 48px monospace';
    context.fillStyle = '#00ffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowBlur = 20;
    context.shadowColor = '#00ffff';
    context.fillText(name, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true,
      opacity: 0
    });
    
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(8, 2, 1);
    
    sprite.userData = {
      opacity: 0,
      targetOpacity: 1,
      fadeSpeed: 0.02,
      lifeTime: 200
    };
    
    this.scene.add(sprite);
    this.holographicNames.push(sprite);
    
    return sprite;
  }
  
  updateBuildings() {
    // Audio-reactive building animations
    for (const building of this.buildings) {
      const userData = building.userData;
      
      // Low frequencies affect building height
      const heightModifier = 1 + (this.LOW / 100) * 0.3;
      const targetHeight = userData.baseHeight * heightModifier;
      const currentHeight = building.scale.y * userData.baseHeight;
      
      if (Math.abs(currentHeight - targetHeight) > 0.1) {
        building.scale.y = targetHeight / userData.baseHeight;
        building.position.y = targetHeight / 2;
      }
      
      // Mid frequencies affect window lights
      if (userData.windowLights) {
        for (const window of userData.windowLights) {
          const intensity = window.userData.baseIntensity + (this.MID / 100) * 0.5;
          window.material.color.setHex(this.colors.windows);
          window.material.color.multiplyScalar(intensity);
        }
      }
      
      // High frequencies affect building glow
      if (this.HIGH > 70) {
        building.material.emissiveIntensity = 0.5;
      } else {
        building.material.emissiveIntensity = 0.2;
      }
    }
  }
  
  updateVehicles() {
    // Update vehicle positions
    for (const vehicle of this.vehicles) {
      const speed = vehicle.userData.speed * (1 + (this.HIGH / 100) * 2);
      vehicle.position.add(vehicle.userData.direction.clone().multiplyScalar(speed));
      
      // Wrap around city bounds
      const bound = this.citySize * 2;
      if (Math.abs(vehicle.position.x) > bound) {
        vehicle.position.x = -vehicle.position.x;
      }
      if (Math.abs(vehicle.position.z) > bound) {
        vehicle.position.z = -vehicle.position.z;
      }
      
      // High frequencies make vehicles glow
      if (this.HIGH > 50) {
        vehicle.material.emissiveIntensity = 1;
      } else {
        vehicle.material.emissiveIntensity = 0.5;
      }
    }
  }
  
  updateHolographicNames() {
    // Update holographic name displays
    for (let i = this.holographicNames.length - 1; i >= 0; i--) {
      const name = this.holographicNames[i];
      const userData = name.userData;
      
      // Fade in/out animation
      if (userData.opacity < userData.targetOpacity) {
        userData.opacity = Math.min(userData.opacity + userData.fadeSpeed, userData.targetOpacity);
      } else if (userData.lifeTime <= 0) {
        userData.opacity = Math.max(userData.opacity - userData.fadeSpeed, 0);
      }
      
      name.material.opacity = userData.opacity;
      userData.lifeTime--;
      
      // Remove faded names
      if (userData.opacity <= 0) {
        this.scene.remove(name);
        this.holographicNames.splice(i, 1);
      }
      
      // Floating animation
      name.position.y += Math.sin(this.time * 0.002) * 0.02;
    }
    
    // Spawn new names based on audio peaks
    if (this.MID > 80 && Math.random() < 0.02 && this.holographicNames.length < 5) {
      const randomName = this.names[Math.floor(Math.random() * this.names.length)];
      const x = (Math.random() - 0.5) * this.citySize * 3;
      const y = 10 + Math.random() * 15;
      const z = (Math.random() - 0.5) * this.citySize * 3;
      
      this.createHolographicName(x, y, z, randomName);
    }
  }
  
  updateCamera() {
    // Slow camera rotation around the city
    this.cameraAngle += 0.001;
    const radius = 40;
    this.camera.position.x = Math.cos(this.cameraAngle) * radius;
    this.camera.position.z = Math.sin(this.cameraAngle) * radius;
    this.camera.lookAt(0, 5, 0);
    
    // Audio-reactive camera movement
    if (this.LOW > 70) {
      this.camera.position.y = 25 + Math.sin(this.time * 0.01) * 2;
    }
    
    // Update fog density based on audio
    if (this.scene.fog) {
      const fogDensity = 0.5 + (this.LOW / 100) * 0.5;
      this.scene.fog.near = 50 - fogDensity * 20;
      this.scene.fog.far = 200 - fogDensity * 50;
    }
  }
  
  draw = () => {
    if (!this.webglSupported || !this.renderer) {
      return;
    }
    
    this.time++;
    
    // Update all components
    this.updateBuildings();
    this.updateVehicles();
    this.updateHolographicNames();
    this.updateCamera();
    
    // Rotate particles
    if (this.particles) {
      this.particles.rotation.y += 0.0005;
    }
    
    // Render the scene
    this.renderer.render(this.scene, this.camera);
    
    // Continue animation loop
    this.frameId = requestAnimationFrame(this.draw);
  }
  
  updateFrequencies(low, mid, high) {
    this.LOW = low;
    this.MID = mid;
    this.HIGH = high;
  }
  
  start() {
    console.log('[synthwave-city] Starting animation...');
    
    // Handle Resolution
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    
    console.log('[synthwave-city] Canvas size set to:', this.canvas.width, 'x', this.canvas.height);
    
    // Initialize 3D scene
    this.init();
    
    if (!this.frameId && this.webglSupported) {
      console.log('[synthwave-city] Starting animation frame loop');
      this.frameId = requestAnimationFrame(this.draw);
    } else {
      console.log('[synthwave-city] Animation already running or WebGL not supported');
    }
  }
  
  stop() {
    console.log('[synthwave-city] Stopping animation...');
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
    
    // Remove any error messages
    const viewContainer = this.canvas.closest('.animation-view');
    if (viewContainer) {
      const errorDivs = viewContainer.querySelectorAll('div[style*="WebGL not supported"]');
      errorDivs.forEach(div => div.remove());
    }
  }
}