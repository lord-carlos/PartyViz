import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';

export class SynthwaveCityAnimation {
  constructor(canvas, config) {
    console.log('[synthwave-city] Constructor called');
    this.canvas = canvas;
    this.config = config || {};
    this.frameId = null;

    // Color palette for the city
    this.colors = {
      sky: 0x0a0a1a,          // Dark blue
      fog: 0x1a1a3a,          // Lighter blue
      ground: 0x0a0a0a,       // Dark gray
      grid: 0xff00ff,         // Magenta Grid (Changed for visibility)
      buildings: {
        tower: 0x2a2a4e,      // Dark blue
        block: 0x16314e,      // Green-blue
        pyramid: 0x0f4470     // Deep blue
      },
      windows: 0x00ffff,      // Cyan
      vehicles: 0xffffff,     // White headlights
      tailLights: 0xff0000,   // Red taillights
      sun: {
        top: 0xffaa00,        // Orange
        bottom: 0xff00aa      // Pink
      },
      lights: {
        ambient: 0x404040,
        directional: 0xff00ff,
        point: 0x00ffff
      },
      particles: {
        colors: [0xff00ff, 0x00ffff, 0xffff00]
      },
      hologram: 0x00ffff
    };

    // Audio frequency values
    this.LOW = 0;
    this.MID = 0;
    this.HIGH = 0;

    this.names = ["UNKNOWN", "BOGEY", "TARGET"];
    this.fetchNames();

    // Three.js components
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.buildings = [];
    this.holographicNames = [];
    this.particles = null;
    this.vehicles = [];
    this.sun = null;

    // Animation parameters
    this.time = 0;
    this.cameraAngle = 0;
    this.citySize = 20;
    this.buildingCount = 0;
    this.gridSpacing = 4; // Distance between building centers

    // Materials
    this.buildingMaterials = {};
    this.windowMaterial = null;
    this.roadMaterial = null;

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
    console.log('[synthwave-city] Initializing 3D scene...');

    if (!this.webglSupported) {
      this.showWebGLError();
      return;
    }

    try {
      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.Fog(this.colors.fog, 30, 150);

      const aspect = this.canvas.width / this.canvas.height;
      this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
      this.camera.position.set(0, 20, 60); // Adjusted camera to look down the street
      this.camera.lookAt(0, 0, 0);

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

      this.createMaterials();
      this.createSun(); // Added Sun
      this.createGround();
      this.generateCity();
      this.createLighting();
      this.createParticles();
      this.createVehicles(); // Updated Vehicles

      console.log('[synthwave-city] 3D scene initialized');
    } catch (error) {
      console.error('[synthwave-city] Error initializing:', error);
      this.showWebGLError();
    }
  }

  showWebGLError() {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #ff0066; background: rgba(0,0,51,0.9); padding: 20px; border: 2px solid #00ffff; border-radius: 10px; z-index: 1000;`;
    errorDiv.innerHTML = `<div>WebGL not supported</div>`;
    const viewContainer = this.canvas.closest('.animation-view');
    if (viewContainer) viewContainer.appendChild(errorDiv);
  }

  createMaterials() {
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

    this.windowMaterial = new THREE.MeshBasicMaterial({
      color: this.colors.windows
    });

    this.roadMaterial = new THREE.MeshBasicMaterial({
      color: this.colors.ground
    });
  }

  createSun() {
    // Create a large sun in the background
    const geometry = new THREE.CircleGeometry(40, 32);

    // Create a gradient texture for the sun
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, 128);
    gradient.addColorStop(0, '#ffff00'); // Yellow top
    gradient.addColorStop(0.5, '#ff00ff'); // Magenta middle
    gradient.addColorStop(1, '#9900cc'); // Purple bottom
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);

    // Add scanlines to sun
    context.fillStyle = 'rgba(0, 0, 0, 0.3)';
    for (let y = 0; y < 128; y += 4) {
      context.fillRect(0, y, 128, 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      fog: false,
      transparent: true
    });

    this.sun = new THREE.Mesh(geometry, material);
    this.sun.position.set(0, 30, -100); // Far back
    this.scene.add(this.sun);
  }

  createGround() {
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const ground = new THREE.Mesh(groundGeometry, this.roadMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Moving Grid
    const gridHelper = new THREE.GridHelper(200, 50, this.colors.grid, this.colors.grid);
    gridHelper.position.y = 0.1;
    this.scene.add(gridHelper);
  }

  generateCity() {
    const gridSize = this.citySize;
    const buildingTypes = ['tower', 'block', 'pyramid'];

    for (let x = -gridSize / 2; x < gridSize / 2; x++) {
      for (let z = -gridSize / 2; z < gridSize / 2; z++) {
        if (Math.random() < 0.3) continue;

        const buildingType = buildingTypes[Math.floor(Math.random() * buildingTypes.length)];
        // Position buildings on grid intervals
        const building = this.createBuilding(x * this.gridSpacing, z * this.gridSpacing, buildingType);

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

    switch (type) {
      case 'tower':
        geometry = new THREE.BoxGeometry(1.5, height, 1.5);
        mesh = new THREE.Mesh(geometry, this.buildingMaterials.tower.clone());
        break;
      case 'block':
        geometry = new THREE.BoxGeometry(3, height, 3);
        mesh = new THREE.Mesh(geometry, this.buildingMaterials.block.clone());
        break;
      case 'pyramid':
        geometry = new THREE.ConeGeometry(2, height, 4);
        mesh = new THREE.Mesh(geometry, this.buildingMaterials.pyramid.clone());
        mesh.rotation.y = Math.PI / 4;
        break;
      default: return null;
    }

    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // ASSIGN REACTIVITY: 0 = Low, 1 = Mid, 2 = High
    const reactBand = Math.floor(Math.random() * 3);

    mesh.userData = {
      type: type,
      baseHeight: height,
      baseY: height / 2,
      windowLights: [],
      reactBand: reactBand, // Which frequency range controls this building
      phaseOffset: Math.random() * Math.PI * 2 // Random start phase for non-synced look
    };

    if (type === 'block' || type === 'tower') {
      this.addWindows(mesh, height);
    }

    return mesh;
  }

 addWindows(building, height) {
    const buildingType = building.userData.type;
    const windowRows = Math.floor(height / 3);
    
    // Determine dimensions based on type
    const width = buildingType === 'block' ? 3 : 1.5;
    const distance = width / 2 + 0.02; // Distance from center to face + slight offset
    const windowCols = buildingType === 'block' ? 2 : 1;

    // Loop through all 4 sides (0, 1, 2, 3 represents 0, 90, 180, 270 deg)
    for (let side = 0; side < 4; side++) {
      const angle = (side * Math.PI) / 2;
      
      for (let row = 0; row < windowRows; row++) {
        for (let col = 0; col < windowCols; col++) {
          // Randomly skip some windows for variety
          if (Math.random() > 0.6) continue;

          const windowGeometry = new THREE.PlaneGeometry(0.4, 0.6);
          const windowMesh = new THREE.Mesh(windowGeometry, this.windowMaterial.clone());
          
          // Calculate horizontal offset relative to the specific face
          let xShift = 0;
          if (windowCols === 2) {
            xShift = col === 0 ? -0.75 : 0.75; 
          }

          // Calculate position by rotating the vector (xShift, 0, distance)
          const finalX = xShift * Math.cos(angle) + distance * Math.sin(angle);
          const finalZ = -xShift * Math.sin(angle) + distance * Math.cos(angle);
          const yPos = row * 3 - height / 2 + 2;

          windowMesh.position.set(finalX, yPos, finalZ);
          windowMesh.rotation.y = angle;

          windowMesh.userData = {
            baseIntensity: 0.3 + Math.random() * 0.7
          };

          building.add(windowMesh);
          building.userData.windowLights.push(windowMesh);
        }
      }
    }
  }

  createLighting() {
    const ambientLight = new THREE.AmbientLight(this.colors.lights.ambient, 0.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(this.colors.lights.directional, 0.8);
    directionalLight.position.set(-20, 50, 20);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);

    // Add a spotlight pointing at the center
    const spotLight = new THREE.SpotLight(0xff00ff, 1);
    spotLight.position.set(0, 80, 0);
    spotLight.angle = Math.PI / 4;
    this.scene.add(spotLight);
  }

  createParticles() {
    const particleCount = 400;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 150;
      positions[i * 3 + 1] = Math.random() * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 150;

      const color = new THREE.Color(this.colors.particles.colors[i % 3]);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.3,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  createVehicles() {
    // Create cars that drive on the grid lines
    // Buildings are at x*4, z*4. Roads are at x*4 + 2, z*4 + 2.
    const vehicleCount = 30;
    const carGeometry = new THREE.BoxGeometry(0.8, 0.4, 1.8);

    const carMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.2,
      metalness: 0.8
    });

    for (let i = 0; i < vehicleCount; i++) {
      const car = new THREE.Mesh(carGeometry, carMaterial);

      // Determine axis: 0 for X-axis movement, 1 for Z-axis movement
      const axis = Math.random() > 0.5 ? 'x' : 'z';

      // Snap to grid lines (between buildings)
      // Range -40 to 40, step 4, offset 2
      const lane = (Math.floor(Math.random() * 20) - 10) * this.gridSpacing + (this.gridSpacing / 2);
      const position = (Math.random() - 0.5) * 100;

      if (axis === 'z') {
        car.position.set(lane, 0.25, position);
        car.rotation.y = 0; // Facing +Z
      } else {
        car.position.set(position, 0.25, lane);
        car.rotation.y = Math.PI / 2; // Facing +X
      }

      // Add lights to car
      this.addCarLights(car);

      car.userData = {
        axis: axis,
        speed: 0.05 + Math.random() * 0.2,
        direction: Math.random() > 0.5 ? 1 : -1
      };

      // Orient car based on direction
      if (axis === 'z' && car.userData.direction === -1) car.rotation.y = Math.PI;
      if (axis === 'x' && car.userData.direction === -1) car.rotation.y = -Math.PI / 2;

      this.vehicles.push(car);
      this.scene.add(car);
    }
  }

  addCarLights(car) {
    // Headlights
    const headLightGeo = new THREE.BoxGeometry(0.2, 0.1, 0.1);
    const headLightMat = new THREE.MeshBasicMaterial({ color: this.colors.vehicles });

    const leftHead = new THREE.Mesh(headLightGeo, headLightMat);
    leftHead.position.set(-0.25, 0, 0.9);
    car.add(leftHead);

    const rightHead = new THREE.Mesh(headLightGeo, headLightMat);
    rightHead.position.set(0.25, 0, 0.9);
    car.add(rightHead);

    // Tail lights
    const tailLightMat = new THREE.MeshBasicMaterial({ color: this.colors.tailLights });
    const tailLightGeo = new THREE.BoxGeometry(0.35, 0.1, 0.1);

    const tail = new THREE.Mesh(tailLightGeo, tailLightMat);
    tail.position.set(0, 0, -0.9);
    car.add(tail);
  }

  createHolographicName(x, y, z, name) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;

    context.fillStyle = 'rgba(0, 0, 0, 0)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.font = 'bold 48px "Courier New", monospace';
    context.fillStyle = 'rgba(0, 255, 255, 0.8)';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowBlur = 15;
    context.shadowColor = '#00ffff';
    context.fillText(name, canvas.width / 2, canvas.height / 2);

    // Scanline effect
    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    for (let i = 0; i < canvas.height; i += 4) context.fillRect(0, i, canvas.width, 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      color: 0xffffff,
      blending: THREE.AdditiveBlending
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(10, 2.5, 1);

    sprite.userData = {
      opacity: 0,
      targetOpacity: 1,
      fadeSpeed: 0.02,
      lifeTime: 250
    };

    this.scene.add(sprite);
    this.holographicNames.push(sprite);

    return sprite;
  }

  updateBuildings() {
    // Audio-reactive building animations with FREQUENCY MAPPING
    for (const building of this.buildings) {
      const userData = building.userData;

      // Determine which frequency drives this building
      let inputFreq = 0;
      if (userData.reactBand === 0) inputFreq = this.LOW;
      else if (userData.reactBand === 1) inputFreq = this.MID;
      else inputFreq = this.HIGH;

      // Calculate target scale
      // Add phase offset so they don't all move exactly at once even in same band
      const phase = Math.sin(this.time * 0.05 + userData.phaseOffset);

      // Base wobble + Audio reaction
      const heightModifier = 1 + (inputFreq / 255) * 0.5 + (phase * 0.02);

      const targetHeight = userData.baseHeight * heightModifier;

      // Smooth interpolation (lerp)
      building.scale.y += (targetHeight / userData.baseHeight - building.scale.y) * 0.1;
      building.position.y = (userData.baseHeight * building.scale.y) / 2;

      // Window reaction - mostly responding to High/Mid percussive sounds
      if (userData.windowLights) {
        const lit = (this.HIGH > 100 || this.MID > 120) && Math.random() > 0.5;
        for (const window of userData.windowLights) {
          if (lit) {
            window.material.color.setHex(0xffffff); // Flash white
          } else {
            // Return to cyan/blue with slight pulse
            const hue = (userData.baseHeight / 30) + (this.time * 0.001);
            window.material.color.setHSL(hue % 1, 1, 0.5);
          }
        }
      }

      // Glow intensity based on HIGH freq
      if (this.HIGH > 80 && userData.reactBand === 2) {
        building.material.emissiveIntensity = 0.8;
      } else {
        building.material.emissiveIntensity = 0.2;
      }
    }
  }

  updateVehicles() {
    // Grid-based traffic movement
    const cityBound = 60; // Reset distance

    for (const vehicle of this.vehicles) {
      const speed = vehicle.userData.speed * (1 + (this.LOW / 200)); // Bass makes cars faster

      if (vehicle.userData.axis === 'z') {
        vehicle.position.z += speed * vehicle.userData.direction;
        // Wrap around
        if (vehicle.position.z > cityBound) vehicle.position.z = -cityBound;
        if (vehicle.position.z < -cityBound) vehicle.position.z = cityBound;
      } else {
        vehicle.position.x += speed * vehicle.userData.direction;
        // Wrap around
        if (vehicle.position.x > cityBound) vehicle.position.x = -cityBound;
        if (vehicle.position.x < -cityBound) vehicle.position.x = cityBound;
      }
    }
  }

  updateHolographicNames() {
    for (let i = this.holographicNames.length - 1; i >= 0; i--) {
      const name = this.holographicNames[i];
      const userData = name.userData;

      if (userData.opacity < userData.targetOpacity) {
        userData.opacity = Math.min(userData.opacity + userData.fadeSpeed, userData.targetOpacity);
      } else if (userData.lifeTime <= 0) {
        userData.opacity = Math.max(userData.opacity - userData.fadeSpeed, 0);
      }

      name.material.opacity = userData.opacity;
      userData.lifeTime--;

      if (userData.opacity <= 0) {
        this.scene.remove(name);
        this.holographicNames.splice(i, 1);
      }

      name.position.y += Math.sin(this.time * 0.01) * 0.01;
    }

    // Spawn names on beat (Kick drum usually in LOW)
    if (this.LOW > 140 && Math.random() < 0.05 && this.holographicNames.length < 4) {
      const randomName = this.names[Math.floor(Math.random() * this.names.length)];
      const x = (Math.random() - 0.5) * 40;
      const y = 12 + Math.random() * 10;
      const z = (Math.random() - 0.5) * 40;
      this.createHolographicName(x, y, z, randomName);
    }
  }

  updateCamera() {
    // Orbit camera slowly
    this.cameraAngle += 0.002;
    const radius = 45;
    this.camera.position.x = Math.cos(this.cameraAngle) * radius;
    this.camera.position.z = Math.sin(this.cameraAngle) * radius;
    this.camera.lookAt(0, 5, 0);

    // Sun pulsing to Bass
    if (this.sun) {
      const scale = 1 + (this.LOW / 255) * 0.2;
      this.sun.scale.set(scale, scale, 1);
      this.sun.position.x = this.camera.position.x * 0.2; // Parallax effect
      this.sun.position.z = this.camera.position.z * 0.2 - 100;
      this.sun.lookAt(this.camera.position);
    }
  }

  draw = () => {
    if (!this.webglSupported || !this.renderer) return;

    this.time++;

    this.updateBuildings();
    this.updateVehicles();
    this.updateHolographicNames();
    this.updateCamera();

    if (this.particles) {
      this.particles.rotation.y -= 0.001;
      // Particles rise up
      const positions = this.particles.geometry.attributes.position.array;
      for (let i = 1; i < positions.length; i += 3) {
        positions[i] += 0.05;
        if (positions[i] > 40) positions[i] = 0;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame(this.draw);
  }

  updateFrequencies(low, mid, high) {
    this.LOW = low;
    this.MID = mid;
    this.HIGH = high;
  }

  start() {
    console.log('[synthwave-city] Starting animation...');
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;

    this.init();

    if (!this.frameId && this.webglSupported) {
      this.frameId = requestAnimationFrame(this.draw);
    }
  }

  stop() {
    console.log('[synthwave-city] Stopping animation...');
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
    if (this.scene) {
      while (this.scene.children.length > 0) {
        const child = this.scene.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
        this.scene.remove(child);
      }
    }

    const viewContainer = this.canvas.closest('.animation-view');
    if (viewContainer) {
      const errs = viewContainer.querySelectorAll('div');
      errs.forEach(d => {
        if (d.innerText.includes('WebGL')) d.remove();
      });
    }
  }
}