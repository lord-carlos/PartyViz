// index.js - Loader for PartyViz
// - Loads `animations/animations.yml` (via js-yaml CDN loaded in index.html)
// - Injects each animation's HTML into the DOM
// - Dynamically imports each animation JS module and instantiates its class (matching class_name)
// - Rotates views every `duration` seconds and runs test-mode generator for `updateFrequencies` calls

const ANIMATIONS_YML = './animations/animations.yml';
const VIEWS_CONTAINER_ID = 'views';
const DEFAULT_DURATION = 8; // seconds if not defined in manifest

// Simple helper to show errors in console and UI
function showError(msg) {
  console.error('[PartyViz ERROR]', msg);
}

async function fetchYAML(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not fetch ${path}: ${res.status} ${res.statusText}`);
  const txt = await res.text();
  console.log(`[PartyViz] Fetched YAML from ${path}`);
  return window.jsyaml.load(txt);
}

async function injectAnimationHtml(slug) {
  const htmlPath = `./animations/${slug}/${slug}-animation.html`;
  console.log(`[PartyViz] Fetching HTML for ${slug} from ${htmlPath}`);
  const res = await fetch(htmlPath);
  if (!res.ok) throw new Error(`Could not fetch ${htmlPath}: status ${res.status}`);
  return await res.text();
}

async function loadAnimations() {
  const parsed = await fetchYAML(ANIMATIONS_YML).catch(err => { showError(err); return null; });
  if (!parsed) return [];

  let list = parsed.animations || parsed;
  console.log(`[PartyViz] Manifest contains ${Array.isArray(list) ? list.length : 0} animation(s)`);
  if (!Array.isArray(list)) {
    // If top-level is map of entries keyed by slug, convert to array
    showError('animations.yml format unexpected; expecting `animations:` array');
    return [];
  }

  const container = document.getElementById(VIEWS_CONTAINER_ID);
  console.log(`[PartyViz] Found views container: #${VIEWS_CONTAINER_ID}`);
  const loaded = [];

  for (const anim of list) {
    try {
      const slug = anim.slug;
      console.log(`[PartyViz] Loading animation: ${slug} (${anim.name || 'unnamed'})`);
      const html = await injectAnimationHtml(slug);
      console.log(`[PartyViz] Fetched HTML for ${slug}`);
      // containerElement to avoid inserting duplicate DOM nodes
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      // The snippet may already include a root .animation-view element with id `view-<slug>`
      const viewRoot = wrapper.querySelector('.animation-view') || wrapper.firstElementChild;
      if (!viewRoot) {
        showError(`No root .animation-view found for animation ${slug}`);
        continue;
      }
      // Make sure wrapper contains that root node only
      wrapper.innerHTML = '';
      wrapper.appendChild(viewRoot);

      // Append to main container
      container.appendChild(wrapper);

      const canvas = viewRoot.querySelector(`#canvas-${slug}`);
      if (!canvas) {
        showError(`Canvas #canvas-${slug} not found in ${slug}-animation.html`);
        // Keep DOM but don't instantiate
        loaded.push({ slug, view: viewRoot, instance: null, config: anim });
        continue;
      }

      const modulePath = `./animations/${slug}/${slug}-animation.js`;
      console.log(`[PartyViz] Importing module ${modulePath}`);
      const module = await import(modulePath);
      console.log(`[PartyViz] Imported module: ${modulePath}`);
      const ClassName = anim.class_name;
      const Cls = module[ClassName];
      if (!Cls) {
        showError(`Exported class ${ClassName} not found in ${modulePath}`);
        loaded.push({ slug, view: viewRoot, instance: null, config: anim });
        continue;
      }

      const instance = new Cls(canvas, anim);
        // Populate metadata if present
        const metaEl = viewRoot.querySelector(`#meta-${slug}`) || viewRoot.querySelector('.metadata');
        if (metaEl) {
          const metaParts = [];
          if (anim.name) metaParts.push(anim.name);
          if (anim.creator) metaParts.push(`by ${anim.creator}`);
          if (anim.settings) metaParts.push(`settings: ${JSON.stringify(anim.settings)}`);
          metaEl.textContent = metaParts.join(' — ');
        }
      console.log(`[PartyViz] Instantiated ${ClassName} for animation: ${slug}`);
      loaded.push({ slug, view: viewRoot, instance, config: anim });

    } catch (err) {
      showError(`Error loading animation ${anim.slug}: ${err}`);
    }
  }

  console.log('[PartyViz] loadAnimations finished. Loaded items:', loaded.map(it => ({ slug: it.slug, name: (it.config && it.config.name) || null })));
  return loaded;
}

function hideAll(loaded) {
  for (const item of loaded) {
    if (!item.view) continue;
    item.view.style.display = 'none';
  }
}

async function init() {
  console.log('[PartyViz] Initializing loader');
  const loaded = await loadAnimations();
  if (!loaded || loaded.length === 0) {
    showError('No animations loaded');
    return;
  }

  let currentIndex = 0;
  let currentItem = null;
  let rotationTimer = null;
  let audioTestIntervalId = null;

  function showIndex(index) {
    const nextDisplay = loaded[index] && loaded[index].slug ? `${index} (${loaded[index].slug})` : index;
    console.log(`[PartyViz] showIndex - switching to ${nextDisplay}`);
    if (currentItem && currentItem.instance && typeof currentItem.instance.stop === 'function') {
      console.log(`[PartyViz] Stopping animation: ${currentItem.slug}`);
      try { currentItem.instance.stop(); } catch (err) { showError(err); }
    }
    hideAll(loaded);
    const item = loaded[index];
    if (!item) return;
    if (item.view) item.view.style.display = 'block';
    if (item.instance && typeof item.instance.start === 'function') {
      console.log(`[PartyViz] Starting animation: ${item.slug}`);
      try { item.instance.start(); } catch (err) { showError(err); }
    }
    window.currentAnimation = item.instance || null;
    currentItem = item;
    currentIndex = index;
  }

  function rotateNext() {
    let next = (currentIndex + 1) % loaded.length;
    console.log(`[PartyViz] Rotating to next index: ${next}`);
    showIndex(next);
    const nextItem = loaded[next];
    // set rotation timer according to `duration` in manifest or default
    const duration = (nextItem && nextItem.config && nextItem.config.duration) || DEFAULT_DURATION;
    rotationTimer && clearTimeout(rotationTimer);
    rotationTimer = setTimeout(rotateNext, duration * 1000);
  }

  document.getElementById('prev').addEventListener('click', () => {
    const prev = (currentIndex - 1 + loaded.length) % loaded.length;
    showIndex(prev);
  });
  document.getElementById('next').addEventListener('click', () => {
    const next = (currentIndex + 1) % loaded.length;
    showIndex(next);
  });

  // Test mode toggle UI
  const testModeCheckbox = document.getElementById('audioTestMode');
  window.AudioTestMode = !!testModeCheckbox.checked;
  testModeCheckbox.addEventListener('change', (ev) => {
    window.AudioTestMode = !!ev.target.checked;
    console.log(`[PartyViz] AudioTestMode set to ${window.AudioTestMode}`);
  });

  // Start with index 0
  showIndex(0);
  // Start rotation using the current item's duration
  const firstDuration = (currentItem && currentItem.config && currentItem.config.duration) || DEFAULT_DURATION;
  console.log(`[PartyViz] Scheduling rotation start: first duration ${firstDuration}s`);
  rotationTimer = setTimeout(rotateNext, firstDuration * 1000);

  // Setup test-mode audio feed (random values 0..100 at ~60Hz) to the active animation only
  function startTestMode() {
    if (audioTestIntervalId) return;
    audioTestIntervalId = setInterval(() => {
      if (!window.AudioTestMode) return;
      if (!window.currentAnimation || typeof window.currentAnimation.updateFrequencies !== 'function') return;
      const low = Math.floor(Math.random() * 101);
      const mid = Math.floor(Math.random() * 101);
      const high = Math.floor(Math.random() * 101);
      try { window.currentAnimation.updateFrequencies(low, mid, high); } catch (err) { /* ignore animation errors */ }
      // Log periodically to avoid excessive console spam
      if (window.DEBUG_AUDIO || Math.random() > 0.98) console.log(`[PartyViz] Test audio -> low:${low} mid:${mid} high:${high}`);
    }, 1000 / 60);
    console.log('[PartyViz] Test-mode generator started');
  }
  function stopTestMode() {
    if (!audioTestIntervalId) return;
    clearInterval(audioTestIntervalId);
    audioTestIntervalId = null;
    console.log('[PartyViz] Test-mode generator stopped');
  }

  // Start generator
  startTestMode();

  // Update window hooks
  window.registeredAnimations = loaded;
  console.log('[PartyViz] Registered animations:', loaded.map(l => l.slug));
  window.rotateNext = rotateNext;

  // Optional: clean up on page unload
  window.addEventListener('beforeunload', () => {
    rotationTimer && clearTimeout(rotationTimer);
    audioTestIntervalId && clearInterval(audioTestIntervalId);
    for (const it of loaded) if (it.instance && typeof it.instance.stop === 'function') it.instance.stop();
  });
}

init().catch(err => showError(err));
