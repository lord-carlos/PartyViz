// index.js
import { AudioManager } from './audio-manager.js';

const ANIMATIONS_YML = './animations/animations.yml';
const VIEWS_CONTAINER_ID = 'views';
const DEFAULT_DURATION = 8;

function showError(message, error) {
  console.error('[PartyViz ERROR]', message, error || '');
}

async function fetchYAML(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not fetch ${path} (${res.status})`);
  const text = await res.text();
  if (!window.jsyaml) throw new Error('js-yaml failed to load; check the CDN script in index.html');
  return window.jsyaml.load(text);
}

async function injectAnimationHtml(slug) {
  const htmlPath = `./animations/${slug}/${slug}-animation.html`;
  const res = await fetch(htmlPath);
  if (!res.ok) throw new Error(`Could not fetch ${htmlPath} (${res.status})`);
  return await res.text();
}

async function loadAnimations() {
  const parsed = await fetchYAML(ANIMATIONS_YML).catch((err) => {
    showError(err);
    return null;
  });
  if (!parsed) return [];

  const list = parsed.animations || parsed;
  if (!Array.isArray(list)) {
    showError('animations.yml format unexpected');
    return [];
  }

  const container = document.getElementById(VIEWS_CONTAINER_ID);
  const loaded = [];

  for (const anim of list) {
    const slug = anim && anim.slug;
    if (!slug || !anim.class_name) {
      showError('Skipping manifest entry without slug/class_name', anim);
      continue;
    }

    try {
      const html = await injectAnimationHtml(slug);

      // <template> parses the snippet without executing scripts or touching live DOM.
      const template = document.createElement('template');
      template.innerHTML = html;
      const viewRoot = template.content.querySelector('.animation-view') || template.content.firstElementChild;
      if (!viewRoot) throw new Error('HTML snippet has no root element');

      container.appendChild(viewRoot);

      const canvas = viewRoot.querySelector(`#canvas-${slug}`);
      if (!canvas) {
        showError(`Missing #canvas-${slug}`);
        loaded.push({ slug, view: viewRoot, instance: null, config: anim });
        continue;
      }

      const modulePath = `./animations/${slug}/${slug}-animation.js`;
      const module = await import(modulePath);
      const Cls = module[anim.class_name];
      if (typeof Cls !== 'function') {
        showError(`Missing export ${anim.class_name} in ${modulePath}`);
        loaded.push({ slug, view: viewRoot, instance: null, config: anim });
        continue;
      }

      const instance = new Cls(canvas, anim);

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
      showError(`Error loading ${slug}`, err);
    }
  }

  return loaded;
}

function hideAll(loaded) {
  for (const item of loaded) {
    if (item.view) item.view.style.display = 'none';
  }
}

async function init() {
  console.log('[PartyViz] Initializing...');

  // --- AUDIO SETUP ---
  const audioManager = new AudioManager();
  window.audioManager = audioManager; // exposed for animations and the dev console
  audioManager.startLoop();

  const loaded = await loadAnimations();
  if (!loaded.length) {
    showError('No animations loaded');
    return;
  }

  const pauseBtn = document.getElementById('pause');
  const testModeCheckbox = document.getElementById('audioTestMode');
  const testModeMark = testModeCheckbox && testModeCheckbox.parentElement.querySelector('.checkmark');
  const btnMic = document.getElementById('btnEnableMic');
  const selectMic = document.getElementById('audioSourceSelect');

  let currentIndex = 0;
  let currentItem = null;
  let rotationTimer = null;
  let paused = false;

  function syncTestModeUi() {
    if (!testModeCheckbox) return;
    if (testModeMark) testModeMark.textContent = testModeCheckbox.checked ? '[X]' : '[ ]';
    if (btnMic) btnMic.style.opacity = testModeCheckbox.checked ? '0.6' : '1';
  }

  function setPaused(nextPaused) {
    paused = nextPaused;
    if (!pauseBtn) return;
    pauseBtn.textContent = paused ? '▶' : '⏸';
    pauseBtn.title = paused ? 'Resume rotation' : 'Pause rotation';
  }

  function scheduleNext() {
    if (rotationTimer) {
      clearTimeout(rotationTimer);
      rotationTimer = null;
    }
    if (paused || !currentItem) return;
    const duration = Number(currentItem.config && currentItem.config.duration) || DEFAULT_DURATION;
    rotationTimer = setTimeout(() => rotateNext(1), Math.max(1, duration) * 1000);
  }

  function showIndex(index) {
    const item = loaded[index];
    if (!item) return;

    if (currentItem && currentItem.instance && typeof currentItem.instance.stop === 'function') {
      try {
        currentItem.instance.stop();
      } catch (err) {
        showError(`Error stopping ${currentItem.slug}`, err);
      }
    }
    hideAll(loaded);

    item.view.style.display = 'block';
    if (item.instance && typeof item.instance.start === 'function') {
      try {
        item.instance.start();
      } catch (err) {
        showError(`Error starting ${item.slug}`, err);
      }
    }

    window.currentAnimation = item.instance || null;
    currentItem = item;
    currentIndex = index;
  }

  function rotateNext(step = 1) {
    const next = (currentIndex + step + loaded.length) % loaded.length;
    showIndex(next);
    scheduleNext();
  }

  // --- UI EVENTS ---

  if (document.getElementById('prev')) {
    document.getElementById('prev').addEventListener('click', () => {
      setPaused(false);
      rotateNext(-1);
    });
  }

  if (document.getElementById('next')) {
    document.getElementById('next').addEventListener('click', () => {
      setPaused(false);
      rotateNext(1);
    });
  }

  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      setPaused(!paused);
      scheduleNext();
    });
  }

  // Keyboard: arrows switch, space toggles rotation.
  document.addEventListener('keydown', (event) => {
    if (event.target && /input|select|textarea/i.test(event.target.tagName)) return;
    if (event.key === 'ArrowLeft') {
      setPaused(false);
      rotateNext(-1);
    } else if (event.key === 'ArrowRight') {
      setPaused(false);
      rotateNext(1);
    } else if (event.key === ' ') {
      event.preventDefault();
      setPaused(!paused);
      scheduleNext();
    }
  });

  if (testModeCheckbox) {
    testModeCheckbox.checked = true;
    audioManager.setTestMode(true);
    syncTestModeUi();

    testModeCheckbox.addEventListener('change', (event) => {
      audioManager.setTestMode(event.target.checked);
      syncTestModeUi();
    });
  }

  async function refreshDeviceList() {
    if (!selectMic || !btnMic) return;
    const devices = await audioManager.getAudioDevices();
    selectMic.innerHTML = '';

    devices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Audio Device ${index + 1}`;
      selectMic.appendChild(option);
    });

    if (devices.length > 0) {
      selectMic.style.display = 'inline-block';
      btnMic.style.display = 'none';
    }
  }

  async function activateMicrophone(deviceId = null) {
    if (!btnMic) return false;
    btnMic.disabled = true;
    const success = await audioManager.enableLiveInput(deviceId);
    btnMic.disabled = false;

    if (!success) {
      btnMic.textContent = '🎤 MIC ERROR';
      setTimeout(() => {
        btnMic.textContent = '🎤 Enable Mic';
      }, 2000);
      return false;
    }

    if (testModeCheckbox) testModeCheckbox.checked = false;
    audioManager.setTestMode(false);
    syncTestModeUi();

    btnMic.textContent = '🎤 ON AIR';
    btnMic.style.background = 'var(--color-primary)';
    btnMic.style.color = 'var(--color-bg)';

    await refreshDeviceList();
    return true;
  }

  if (btnMic) {
    btnMic.addEventListener('click', () => activateMicrophone(null));
  }

  if (selectMic) {
    selectMic.addEventListener('change', async (event) => {
      console.log('[PartyViz] Switching to device:', event.target.value);
      await activateMicrophone(event.target.value);
    });
  }

  // --- STARTUP ---
  showIndex(0);
  scheduleNext();

  window.rotateNext = rotateNext;
  window.setPaused = setPaused;
  window.partyViz = {
    loaded,
    rotateNext,
    setPaused,
    showIndex,
    get currentIndex() {
      return currentIndex;
    },
  };
  window.addEventListener('beforeunload', () => audioManager.dispose());
}

init().catch((err) => showError(err));
