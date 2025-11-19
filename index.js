// index.js
import { AudioManager } from './audio-manager.js';

const ANIMATIONS_YML = './animations/animations.yml';
const VIEWS_CONTAINER_ID = 'views';
const DEFAULT_DURATION = 8;

function showError(msg) {
  console.error('[PartyViz ERROR]', msg);
}

async function fetchYAML(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not fetch ${path}`);
  const txt = await res.text();
  return window.jsyaml.load(txt);
}

async function injectAnimationHtml(slug) {
  const htmlPath = `./animations/${slug}/${slug}-animation.html`;
  const res = await fetch(htmlPath);
  if (!res.ok) throw new Error(`Could not fetch ${htmlPath}`);
  return await res.text();
}

async function loadAnimations() {
  const parsed = await fetchYAML(ANIMATIONS_YML).catch(err => { showError(err); return null; });
  if (!parsed) return [];

  let list = parsed.animations || parsed;
  if (!Array.isArray(list)) {
    showError('animations.yml format unexpected');
    return [];
  }

  const container = document.getElementById(VIEWS_CONTAINER_ID);
  const loaded = [];

  for (const anim of list) {
    try {
      const slug = anim.slug;
      const html = await injectAnimationHtml(slug);

      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      const viewRoot = wrapper.querySelector('.animation-view') || wrapper.firstElementChild;
      wrapper.innerHTML = '';
      wrapper.appendChild(viewRoot);
      container.appendChild(wrapper);

      const canvas = viewRoot.querySelector(`#canvas-${slug}`);
      if (!canvas) {
        loaded.push({ slug, view: viewRoot, instance: null, config: anim });
        continue;
      }

      const modulePath = `./animations/${slug}/${slug}-animation.js`;
      const module = await import(modulePath);
      const ClassName = anim.class_name;
      const Cls = module[ClassName];

      if (!Cls) {
        loaded.push({ slug, view: viewRoot, instance: null, config: anim });
        continue;
      }

      const instance = new Cls(canvas, anim);

      // Metadata
      const metaEl = viewRoot.querySelector(`#meta-${slug}`) || viewRoot.querySelector('.metadata');
      if (metaEl) {
        const metaParts = [];
        if (anim.name) metaParts.push(anim.name);
        if (anim.creator) metaParts.push(`by ${anim.creator}`);
        metaEl.textContent = metaParts.join(' — ');
      }

      loaded.push({ slug, view: viewRoot, instance, config: anim });
      console.log(`[PartyViz] Loaded ${slug}`);

    } catch (err) {
      showError(`Error loading ${anim.slug}: ${err}`);
    }
  }
  return loaded;
}

function hideAll(loaded) {
  for (const item of loaded) if (item.view) item.view.style.display = 'none';
}

async function init() {
  console.log('[PartyViz] Initializing...');

  // --- AUDIO SETUP ---
  const audioManager = new AudioManager();
  // Start the loop immediately (it defaults to Test Mode)
  audioManager.startLoop();

  const loaded = await loadAnimations();
  if (!loaded.length) {
    showError('No animations loaded');
    return;
  }

  let currentIndex = 0;
  let currentItem = null;
  let rotationTimer = null;
  let paused = false; // when true, stop automatic rotation

  function showIndex(index) {
    if (currentItem && currentItem.instance && typeof currentItem.instance.stop === 'function') {
      currentItem.instance.stop();
    }
    hideAll(loaded);

    const item = loaded[index];
    if (!item) return;

    if (item.view) item.view.style.display = 'block';
    if (item.instance && typeof item.instance.start === 'function') {
      item.instance.start();
    }

    window.currentAnimation = item.instance || null;
    currentItem = item;
    currentIndex = index;
  }

  function rotateNext(step = 1) {
    // step is 1 for forward, -1 for previous
    const next = (currentIndex + step + loaded.length) % loaded.length;
    showIndex(next);
    const nextItem = loaded[next];
    const duration = (nextItem && nextItem.config && nextItem.config.duration) || DEFAULT_DURATION;

    rotationTimer && clearTimeout(rotationTimer);
    // don't schedule next if paused (e.g., user pressed pause)
    if (!paused) {
      rotationTimer = setTimeout(() => rotateNext(1), duration * 1000);
    }
  }

  // --- UI EVENTS ---

  document.getElementById('prev').addEventListener('click', () => {
    // If user interacts manually, resume automatic rotation and go to previous.
    paused = false;
    rotateNext(-1);
  });

  document.getElementById('next').addEventListener('click', () => {
    // If user interacts manually, resume automatic rotation and go to next.
    paused = false;
    rotateNext(1);
  });

  // Pause button toggles automatic rotation; it leaves the current animation running.
  const pauseBtn = document.getElementById('pause');
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    if (paused) {
      // stop future rotations
      clearTimeout(rotationTimer);
      rotationTimer = null;
      pauseBtn.textContent = '▶';
      pauseBtn.title = 'Resume rotation';
    } else {
      // resume with the duration of the next item
      pauseBtn.textContent = '⏸';
      pauseBtn.title = 'Pause rotation';
      // schedule next based on next item's config
      const nextIndex = (currentIndex + 1) % loaded.length;
      const nextItem = loaded[nextIndex];
      const duration = (nextItem && nextItem.config && nextItem.config.duration) || DEFAULT_DURATION;
      rotationTimer && clearTimeout(rotationTimer);
      rotationTimer = setTimeout(() => rotateNext(1), duration * 1000);
    }
  });

  // Test Mode Toggle
  const testModeCheckbox = document.getElementById('audioTestMode');

  // Sync initial state
  audioManager.setTestMode(testModeCheckbox.checked);

  // 1. Test Mode Toggle
  testModeCheckbox.addEventListener('change', (ev) => {
    const isTest = ev.target.checked;
    audioManager.setTestMode(isTest);
    // If user manually checks Test Mode, we might want to visually indicate mic is paused
    if (isTest) {
      btnMic.style.opacity = "0.5";
    } else if (audioManager.isLive) {
      btnMic.style.opacity = "1";
    }
  });

  // Microphone Button
  const btnMic = document.getElementById('btnEnableMic');
  const selectMic = document.getElementById('audioSourceSelect');
  btnMic.addEventListener('click', async () => {
    console.log
    const success = await audioManager.enableLiveInput();
    if (success) {
      // If mic starts successfully, uncheck Test Mode automatically
      testModeCheckbox.checked = false;
      audioManager.setTestMode(false);
      btnMic.textContent = "🎤 ON AIR";
      btnMic.style.background = "var(--color-primary)";
      btnMic.style.color = "var(--color-bg)";
    }
  });

  // 2. Function to populate device list
  const refreshDeviceList = async () => {
    const devices = await audioManager.getAudioDevices();
    selectMic.innerHTML = ''; // clear

    devices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      // Fallback name if label is empty (rare once permission granted)
      option.text = device.label || `Audio Device ${index + 1}`;
      selectMic.appendChild(option);
    });

    // Show the dropdown if we have devices
    if (devices.length > 0) {
      selectMic.style.display = 'inline-block';
      btnMic.style.display = 'none'; // Hide big button, use dropdown now
    }
  };

  // 3. Enable Mic Button (First interaction)
  btnMic.addEventListener('click', async () => {
    // Request default device first to trigger permission prompt
    const success = await audioManager.enableLiveInput(null);
    if (success) {
      testModeCheckbox.checked = false;

      // Now that we have permission, we can read device labels
      await refreshDeviceList();
    }
  });

  // 4. Dropdown Selection Change
  selectMic.addEventListener('change', async (ev) => {
    const deviceId = ev.target.value;
    console.log('[PartyViz] Switching to device:', deviceId);
    const success = await audioManager.enableLiveInput(deviceId);
    if (success) {
      testModeCheckbox.checked = false;
    }
  });



  // --- STARTUP ---
  showIndex(0);
  const firstDuration = (currentItem && currentItem.config && currentItem.config.duration) || DEFAULT_DURATION;
  rotationTimer = setTimeout(() => rotateNext(1), firstDuration * 1000);

  window.rotateNext = rotateNext;
}



init().catch(err => showError(err));