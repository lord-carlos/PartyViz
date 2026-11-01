# AGENTS.md — PartyViz

PartyViz is a zero-build, single-page music visualizer. `index.html` loads a YAML
manifest, injects each animation's HTML, dynamically imports its ES module, and
feeds the active animation normalized audio bands. Animations are plain canvas
or Three.js classes; there is no framework, bundler, or runtime dependency
install step.

This file is the source of truth for coding agents. Human setup lives in
`README.md`. Task-specific workflows live in `.opencode/skills/`.

## Commands

```bash
bun install          # dev-only deps (js-yaml for the validator)
bun run dev          # zero-dependency static server, default http://127.0.0.1:8000
bun run validate     # manifest + file + ID + export checks
bun run test         # node:test unit tests
bun run check        # validate + tests
bun run smoke        # headless Chrome: load all animations, BPM, screenshots
```

`bun run dev` runs `scripts/dev-server.mjs` through Node, so `node scripts/dev-server.mjs`
also works. Set `PORT`/`HOST` to change the dev server. `smoke` needs Chrome or
Edge; set `CHROME_PATH` if it is not auto-detected.

## Architecture

```
index.html                 shell, header, import map, js-yaml CDN script
index.js                   loader, rotation, mic/test-mode UI
audio-manager.js           Web Audio analyser, bands, features, test mode
bpm-estimator.js           shared tempo estimator (main thread fallback)
bpm-worker.js              module worker wrapper around the estimator
animations/animations.yml  canonical manifest
animations/<slug>/         one animation: HTML + JS (+ optional CSS)
styles.css                 shared CRT/terminal theme and CSS variables
names.json                 optional names used by several animations
```

Data flow:

1. `index.js` fetches `animations/animations.yml` and injects
   `animations/<slug>/<slug>-animation.html` into `#views`.
2. It imports `animations/<slug>/<slug>-animation.js` and calls
   `new Class(canvas, manifestEntry)`.
3. `AudioManager.startLoop()` runs one `requestAnimationFrame` loop for the whole
   app. It reads the analyser (or the test generator), computes the bands, and
   calls `window.currentAnimation.updateFrequencies(low, mid, high)`.
4. Rotation calls `stop()` on the outgoing instance and `start()` on the
   incoming one. Only one animation is visible and running at a time.

Useful globals: `window.currentAnimation`, `window.audioManager`,
`window.partyViz` (`{ loaded, rotateNext, setPaused }`), `window.rotateNext`,
`window.setPaused`.

## Animation contract

Every animation must export exactly the class named in `class_name` and provide:

```js
export class ExampleAnimation {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d'); // or a Three.js renderer
    this.config = config || {};
    this.frameId = null;
  }
  updateFrequencies(low, mid, high) { /* 0..100 */ }
  start() { /* idempotent; schedule one rAF loop */ }
  stop() { /* cancel rAF, clear timers/listeners, release GPU resources */ }
}
```

Hard rules:

- `config` is the whole manifest entry. Read settings from `this.config.settings`.
- `start()` must be safe to call twice in a row. Guard with `this.frameId` and/or
  an initialized flag.
- `stop()` must be idempotent: cancel `requestAnimationFrame`, clear every
  `setTimeout`/`setInterval`, unsubscribe `audioManager.onUpdate`, remove every
  `window`/`canvas` listener added by the animation, and dispose Three.js
  renderers, composers, geometries, materials, and textures.
- Keep exactly one rAF chain per running animation. Never start an untracked rAF
  chain for a one-off effect; update effect objects from the main draw loop.
- Required HTML IDs: `view-<slug>`, `canvas-<slug>`, `meta-<slug>`.
- Required file names: `animations/<slug>/<slug>-animation.html` and
  `animations/<slug>/<slug>-animation.js`.
- Add the manifest entry in `animations/animations.yml` with `slug`, `name`,
  `creator`, `class_name`, `duration`, and optional `settings`.

## Audio model

`updateFrequencies(low, mid, high)` receives integers `0..100`, recalculated every
animation frame (not a fixed 60 Hz timer). Bands are defined in `audio-manager.js`:

| Band | Range | Typical use |
| --- | --- | --- |
| `low` | 20–250 Hz | kick, size, pulse, shake, slow motion |
| `mid` | 250–4000 Hz | melody/vocals, speed, color, medium detail |
| `high` | 4000–20000 Hz | hats/cymbals, glow, flicker, particles, small detail |

Do not do DSP in an animation. The audio layer handles FFT, smoothing, and
normalization. Never assume `0..255`; that is a legacy bug source.

Rich per-frame data is available through the manager:

```js
const unsubscribe = window.audioManager.onUpdate((payload) => {
  // payload.bands, payload.features, payload.bpm, payload.spectrumNorm, ...
});
// Later, in stop():
unsubscribe();
```

`payload.features` contains `{ rms, centroidHz, spectralFlux }`.
`payload.bpm` contains `{ value, rolling, confidence, correlation, ageMs, samples, stable }`.
BPM is experimental and estimated from the spectral-flux envelope. Test mode
simulates a musical pattern at 120 BPM so the estimator can be exercised without
a microphone.

Other audio APIs:

- `audioManager.setTestMode(bool)`
- `audioManager.setTestBpm(number)` (40–200)
- `audioManager.getBpmInfo()`
- `audioManager.getSpectrum({ format: 'db' | 'mag' | 'norm' | 'byte' })`
- `audioManager.setBands([{ name, from, to }])`

## Canvas, layout, and performance

- Size the canvas in `start()` (and on resize), never rely on constructor-time
  layout. Hidden views have a zero-sized rect.
- Use HiDPI correctly:

```js
const dpr = window.devicePixelRatio || 1;
canvas.width = Math.floor(rect.width * dpr);
canvas.height = Math.floor(rect.height * dpr);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
// draw in CSS pixels
```

- Read CSS variables once (constructor/resize), not inside the draw loop:
  `getComputedStyle(canvas).getPropertyValue('--color-primary')`.
- Avoid per-frame allocations: no `new` objects/arrays/strings in hot loops, no
  `Math.random()` in draw loops, no `shift()`/`splice()` on large arrays per
  particle. Precompute offsets and reuse buffers.
- Do not set `shadowBlur` per item; set it once per batch.
- Cache static backgrounds (starfields, grids) in an offscreen canvas or a
  geometry, and redraw with one call.
- Three.js: `import * as THREE from 'three'` (the import map is in
  `index.html`), addons from `three/addons/`. Never import a second Three.js
  copy from a CDN URL. Dispose GPU resources in `stop()`.

## Visual direction

80s terminal / CRT: green or amber on near-black, monospace, restrained glow,
limited palette. The embedding page already draws scanlines and a vignette, so
animations should not add their own full-screen scanline overlay. Synthwave /
neon animations may use a wider palette when that is the point of the piece.
Use `--color-primary`, `--color-bg`, `--color-grid`, and `--font-mono`.

Animations may fetch `./names.json` for personalization; always keep a local
fallback array and fail silently if the fetch fails.

## Testing and validation

- `bun run validate` is the fast contract check. It verifies the manifest, file
  names, required IDs, `class_name` export, and required methods.
- `bun run test` covers the BPM estimator/audio math.
- `bun run smoke` boots the real page in headless Chrome, loads every manifest
  animation, cycles through them, checks for page errors, and verifies test-mode
  BPM convergence. It also writes screenshots to the temp directory. Set
  `SMOKE_SHOTS=slug1,slug2` to capture specific animations for visual review.
- Manual check: `bun run dev`, open the URL, keep TEST_MODE on, cycle with the
  arrow buttons. In the console:
  `window.currentAnimation.updateFrequencies(0, 100, 0)`.

Do not commit generated screenshots, `node_modules`, or local `names.json`
changes unless the task explicitly asks for them.

## Repo conventions

- Keep the runtime zero-build. Do not add React/Vite/TypeScript compilation to
  the animation runtime.
- No external animation libraries. Three.js is available through the import map.
- Keep changes surgical and consistent with the surrounding animation style.
- Prefer adding a small helper over copy-pasting a large block.
- Update `animations/animations.yml` and run the validator for every new or
  renamed animation.
- Do not recreate `PROMT.md`; use this file and the OpenCode skills.
