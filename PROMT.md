Please create an animation that XXXXXXXXXX

You are writing a PartyViz animation module. Follow these hard rules:
1) Create a folder `animations/<slug>` where `slug` is lowercase, single-word, hyphenated if required.
2) Add `<slug>-animation.html` that contains:
   - `<div id="view-<slug>" class="animation-view">` as the root
   - a `<canvas id="canvas-<slug>"></canvas>` element
   - a metadata placeholder: `<div id="meta-<slug>" class="metadata"></div>`
3) Add `<slug>-animation.js` module that exports a single class (PascalCase) matching the `class_name` field in the manifest (see manifest example below).
   - Class signature: `constructor(canvas, config)` and implement `start()`, `stop()`, `updateFrequencies(low, mid, high)`.
4) Add the animation to `animations/animations.yml` with new manifest fields (see example below) and push the change.

Hard Rules for JS class (must be followed)
- The exported class must preserve these names and signature exactly:
  - constructor(canvas, config)
  - updateFrequencies(low, mid, high)
  - start()
  - stop()
- Inside the constructor, store: this.canvas, this.ctx (canvas.getContext('2d')), this.config, and this.frameId.
- `start()` must call a reusable draw loop using requestAnimationFrame and set this.frameId.
- `stop()` must cancelAnimationFrame(this.frameId) and set this.frameId = null and detach any timers or event handlers.
- Avoid per-frame allocations and Math.random() inside draw loops. Precompute offsets and reuse objects.
- Do NOT assume index.html exists or what the loader does beyond the contract above (the loader will pass the `canvas` and `config` to your constructor).

Loader Contract & Manifest
- Loader reads `animations/animations.yml` (top-level `animations` array of entries).
- Each manifest entry should include: slug, name, creator, class_name, duration (seconds), and optionally a settings object:
  - Example:
    ```yaml
    - slug: asteroids
      name: Asteroids
      creator: "Community"
      class_name: AsteroidsAnimation
      duration: 10
      settings:
        count: 40
        base_speed: 0.03
        sensitivity: 0.8
    ```
- The loader will inject `animations/<slug>/<slug>-animation.html` into the DOM, then import `./animations/<slug>/<slug>-animation.js`, get the `class_name` named export and call `new Class(canvas, config)`.
- The loader expects the HTML snippet to expose consistent IDs: `view-<slug>`, `canvas-<slug>`, `meta-<slug>`.
- The loader keeps one animation active: it calls `start()` when the view is visible and `stop()` when hidden.

Audio Contract
- `updateFrequencies(low, mid, high)` will be called repeatedly (test-mode is 60Hz), with integers normalized to 0..100.
- The frequency semantics are:
  - low — bass (0–200Hz)  — use for background pulse, size, slow motion
  - mid — mid-range (200Hz–2kHz) — use for color, position, and moderate details
  - high — high-range (2kHz+) — use for glow, particles, flicker, and small details
- Do not do DSP in the animation; rely on the loader/audio layer to normalize and smooth values.

80s Retro Style Guidelines
- PartyViz visuals should feel like an 80s monochrome terminal (green or amber on black) with a minimal, possibly pixelated look.
- Preferred palette is a single accent color (`--color-primary`) on a very dark or black background (`--color-bg`), optionally with a faint vignette/scanline overlay.
- Use `var(--color-primary)` and `var(--color-bg)` to stay consistent with global styles.
- Avoid huge gradients or wide color ranges.
- Optional is a synth wave / retro wave style, in that case huge color ranges are allowed.
- Avoid scanlines / overlay, as the .html that will embed the animation will already add a tv scanline overlay.
- In the root `./names.json` is a json array `names` that contains a list of name that can be used to enhance the animations with personalized names.
- Add a background animation, but make sure it does not distract from the forground. (Stars, nebulars etc)

CSS variables the project exposes (main variables in `styles.css`)
- --color-primary: Accent color (bright green by default)
- --color-bg: Background color (dark/black)
- --color-grid: Minor UI highlight/border
- --font-mono: Preferred monospace font

Best Practices & Performance
- Precompute particle offsets and re-use objects to avoid memory churn
- Use `requestAnimationFrame` in `start()` for animation; use `cancelAnimationFrame` in `stop()`.
- Avoid long-running synchronous loops or CPU heavy computations in the draw path.
- Keep draw code idempotent: draw only what’s needed and avoid global state modification during the draw loop.
- Canvas sizing: Must be done in start() method using getBoundingClientRect()
- CSS colors: Use getComputedStyle(this.canvas). for exampel style.getPropertyValue('--color-primary').trim() || '#0f0';
- Names fetching: Use async fetchNames() with fallback array
- Add some console.log('[ANIMATIONNAME] ...') for debugging, but don't  add it into the draw loop.

HTML & CSS Requirements
- Root view must use `<div id="view-<slug>" class="animation-view">` and canvas `id="canvas-<slug>"`.
- Animations can include a small `animation.css` in their folder and use scoped rules.
- Use global `styles.css` variables to match the overall UI palette.

Naming conventions
- `animations/<slug>/<slug>-animation.html`
- `animations/<slug>/<slug>-animation.js`
- EXPORTED class: PascalCase matching `class_name` in `animations.yml`.
- HTML IDs: `view-<slug>`, `canvas-<slug>`, `meta-<slug>`.

Testing / Dev Mode
- No Node or bundler required. Use a simple static server to host the repo root.
  - Example (PowerShell):
    ```powershell
    python -m http.server 8000
    Start-Process "http://localhost:8000"
    ```
- `index.html` has a "Test Mode" toggle. When enabled it sends random values (0..100 at ~60Hz) to the active animation using `updateFrequencies()`.
- The loader exposes `window.currentAnimation` for debug so you can call `updateFrequencies()` from the console.
  - Example: `window.currentAnimation.updateFrequencies(0,100,0)` to test a mid-band reaction

PR Checklist for animation contributions (strict)
- [ ] `animations/<slug>` folder created
- [ ] `animations/<slug>/<slug>-animation.html` with required IDs
- [ ] `animations/<slug>/<slug>-animation.js` exporting the correct PascalCase class
- [ ] `animations/animations.yml` updated with manifest entry (slug, name, creator, class_name, duration)
- [ ] `start()` / `stop()` lifecycle implemented and tested (clean cancel of rAF, no timers left running)
- [ ] `updateFrequencies(low, mid, high)` implemented and mapped appropriately
- [ ] `#meta-<slug>` populated by loader and includes metadata
- [ ] Animation is consistent with the 80s terminal look (monochrome or limited palette)
- [ ] No heavy CPU usage or large allocations in draw loop

Short Example: Minimal Animation (JS)
```javascript
export class ExampleAnimation {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = config || {};
    this.frameId = null;
    this.LOW = 0; this.MID = 0; this.HIGH = 0;
  }
  updateFrequencies(low, mid, high) {
    this.LOW = low; this.MID = mid; this.HIGH = high;
  }
  draw = (ts) => {
    const ctx = this.ctx;
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    // Draw using this.LOW / this.MID / this.HIGH
    this.frameId = requestAnimationFrame(this.draw);
  }
  start() {
    if (!this.frameId) this.frameId = requestAnimationFrame(this.draw)
  }
  stop() {
    if (this.frameId) cancelAnimationFrame(this.frameId), this.frameId = null;
  }
}
```

Short Example: Minimal Animation (HTML)
```html
<div id="view-example" class="animation-view">
  <canvas id="canvas-example"></canvas>
  <div id="meta-example" class="metadata"></div>
</div>
```

How to expose config settings in `animations/animations.yml`
- Include a `settings` object in the manifest entry. The loader passes the manifest entry as `config` to your constructor.
- Read settings via `this.config.settings` and fall back to class defaults.

Quick Troubleshooting Tips for AI authors
- "One giant object" bug at startup usually means layout hasn't happened yet: test `canvas.getBoundingClientRect()` width/height during init or defer init until `requestAnimationFrame` after constructor.
- If the animation looks jittery: avoid Math.random() during draw; precompute shapes and offsets. Smooth transitions with `sizeCurrent = lerp(sizeCurrent, targetSize, smoothing)`.
- If colors are too bright: use `rgba` with alpha 0.6-0.9 and rely on `--color-primary` to keep hue consistent.

Deliverable requirements
- The AI should provide both HTML and JS files with the correct naming and a valid manifest entry. It should also provide a short note about mapping frequency bands used.

Additions / Enhancements (optional)
- Add animation-specific CSS file `animations/<slug>/<slug>-animation.css` and link it from the HTML snippet.
- In the root `./names.json` is a json array `names` that contains a list of name that can be used for the animations.

Safety & Constraints
- Keep code simple — avoid external libs; a small utility function for easing or lerp is OK.
- No network calls required (excluding the loader’s artifact fetching), no Node-specific operations, and avoid heavy CPU tasks.
