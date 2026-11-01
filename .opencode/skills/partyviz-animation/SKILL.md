---
name: PartyViz Animation
description: Create, modify, or debug a PartyViz canvas/Three.js animation end to end, including the manifest entry and validation.
---

# PartyViz Animation Workflow

Use this skill when adding a new animation, changing an existing animation's
visuals/audio mapping, or fixing an animation's lifecycle/performance.

Read `AGENTS.md` first for repo-wide rules. This skill is the hands-on checklist.

## 1. Pick the names

- `slug`: lowercase kebab-case, folder name, e.g. `neon-rain`.
- `class_name`: PascalCase, e.g. `NeonRainAnimation`.
- Files:
  - `animations/<slug>/<slug>-animation.html`
  - `animations/<slug>/<slug>-animation.js`
  - optional `animations/<slug>/<slug>-animation.css`
- IDs inside the HTML: `view-<slug>`, `canvas-<slug>`, `meta-<slug>`.

## 2. Create the HTML snippet

```html
<div id="view-neon-rain" class="animation-view">
  <canvas id="canvas-neon-rain"></canvas>
  <div id="meta-neon-rain" class="metadata"></div>
</div>
```

Local CSS is optional. Scope every rule under `#view-<slug>` so it cannot leak.
Do not add a full-screen scanline/CRT overlay; the host page already has one.

## 3. Create the JS module

Export exactly one class, named to match `class_name`:

```js
export class NeonRainAnimation {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = config || {};
    this.frameId = null;

    this.LOW = 0;
    this.MID = 0;
    this.HIGH = 0;
    this.width = 0;
    this.height = 0;

    const settings = this.config.settings || {};
    this.sensitivity = Number(settings.sensitivity) || 1;

    this._resizeHandler = () => this.resize();
  }

  updateFrequencies(low, mid, high) {
    this.LOW = low;
    this.MID = mid;
    this.HIGH = high;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw = () => {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    // Draw using this.LOW / this.MID / this.HIGH (0..100)
    this.frameId = requestAnimationFrame(this.draw);
  };

  start() {
    this.resize();
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
}
```

Rules that matter:

- `start()` is idempotent: calling it twice must not create two rAF loops.
- `stop()` is idempotent: cancel rAF, clear timers, remove listeners, unsubscribe
  `audioManager.onUpdate`, dispose Three.js resources.
- Size from `getBoundingClientRect()` in `start()`/`resize()`, not the constructor.
  Hidden views measure 0×0.
- Draw in CSS pixels after applying the DPR transform.
- Read CSS colors once in `resize()`/constructor, not every frame.
- No `Math.random()` in the draw loop. Precompute offsets, reuse arrays/objects.
- Do not start a second rAF chain for one-off effects. Keep effect state and
  update it from the main loop.

## 4. Add the manifest entry

In `animations/animations.yml`:

```yaml
  - slug: neon-rain
    name: Neon Rain
    creator: "Your Name"
    class_name: NeonRainAnimation
    duration: 60
    settings:
      sensitivity: 1.0
```

`config` is the whole entry, so settings are at `this.config.settings`.

## 5. Map the frequency bands

Values are recalculated every animation frame and normalized to `0..100`.

- `low` (20–250 Hz): kick/bass. Use for background pulse, size, shake, slow
  motion, gravity, camera zoom.
- `mid` (250–4000 Hz): melody/vocals. Use for speed, color, position, medium
  detail.
- `high` (4000–20000 Hz): hats/cymbals. Use for glow, flicker, particles, text
  jitter, small details.

Never divide by 255 or compare against values above 100. That is the most common
bug in this repo. If you need a normalized 0..1 value, use `band / 100`.

## 6. Visual direction

- 80s terminal: one accent (`var(--color-primary)`, usually green) on
  near-black (`var(--color-bg)`), monospace, restrained glow.
- Synthwave/neon animations may use a wider palette, but keep it intentional.
- Add a background layer (stars, grid, nebula) that does not compete with the
  foreground.
- `names.json` is optional. Fetch it asynchronously and always keep a local
  fallback:

```js
async fetchNames() {
  try {
    const res = await fetch('./names.json');
    const data = await res.json();
    if (Array.isArray(data.names)) this.names = data.names;
  } catch {
    /* keep fallback */
  }
}
```

## 7. Three.js notes

- Import from the import map: `import * as THREE from 'three'`.
- Addons: `import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'`.
- Never import a CDN copy of Three.js; it creates two incompatible copies.
- `init()` should guard against being called twice: `if (this.scene) return;`.
- `stop()` should dispose the renderer, composer/passes, and every geometry,
  material, and texture (traverse the scene). Null the scene/renderer/camera so a
  later `start()` can recreate them.
- Handle resize: update camera aspect/projection and renderer/composer size.
- Avoid `preserveDrawingBuffer`, per-frame shadow-map rebuilds, and per-frame
  `new BufferAttribute`/`Texture` allocations.

## 8. Validate and test

```bash
bun run validate   # manifest, files, IDs, class export, methods
bun run test       # audio/BPM math
bun run smoke      # headless browser: all animations load and cycle
bun run dev        # manual check
```

Manual console helpers:

```js
window.currentAnimation.updateFrequencies(0, 100, 0); // mid-band test
window.audioManager.setTestMode(true);
window.audioManager.setTestBpm(128);
```

## 9. Definition of done

- [ ] Folder and file names follow the convention.
- [ ] HTML has all three required IDs.
- [ ] JS exports the exact `class_name`.
- [ ] `constructor(canvas, config)`, `updateFrequencies`, `start`, `stop` exist.
- [ ] `start()`/`stop()` are idempotent and leak-free.
- [ ] Canvas sizing is done after layout, with DPR.
- [ ] Bands use 0..100 and are mapped intentionally.
- [ ] No per-frame allocations or random calls in the draw path.
- [ ] Manifest entry exists and `bun run validate` passes.
- [ ] Visuals match the 80s terminal/limited-palette direction.
- [ ] `bun run smoke` passes.
