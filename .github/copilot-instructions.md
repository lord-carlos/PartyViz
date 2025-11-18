# PartyViz - Copilot Instructions

This repo is a simple, modular, single-page music visualization system that rotates canvas-based animations automatically. Each animation is a small JS class + HTML snippet in `animations/*` that is driven by three normalized audio bands: low, mid, high (0–100).

Quick Goals for Copilot:
- Help contributors implement new animations that follow the contract below.
- Keep changes minimal and consistent with folder/file naming conventions.
- Prefer small changes to `index.html` manifest or loader logic; if loader changes are required, keep them modular.

Key Files & Locations
- Animation modules: `animations/<slug>/<slug>-animation.js` and `animations/<slug>/<slug>-animation.html`
- Template example: `animations/template/template-animation.js` and `animations/template/template-animation.html`
- Global styles: `styles.css` (animations may also include a local CSS file in their folder)

Retro 80s aesthetic (project-wide guidance)
- All visuals should aim for an 80s 'computer terminal' vibe (mono/limited palette, CRT/scanline optional). Keep animations readable in a limited color set — e.g. bright green or amber on black, with subtle glow effects.
- Prefer minimal pixel/mono fonts and consistent retro color usage across animations; avoid full-color gradients unless part of an animation's controlled palette.

Animation Module Contract (required)
- JS file must export a single class matching the `class_name` in the manifest.
- Class signature:
  - constructor(canvas, config) — store `this.canvas`, `this.ctx`, `this.config` and `this.frameId`.
  - updateFrequencies(low, mid, high) — mandatory hook; values are integers 0–100.
  - start() — must use `requestAnimationFrame` and set `this.frameId`.
  - stop() — must cancel the rAF and set `this.frameId = null`.

DOM & Naming Conventions (required)
- Root view: `div#view-<slug>.animation-view`.
- Canvas id: `canvas-<slug>`.
- Metadata placeholder: `div#meta-<slug>`.
- CSS: global `styles.css` is loaded by the app; animation-specific styling may be included in the HTML snippet.

Frequency Band Mapping & Conventions
- Values are normalized 0–100 before reaching animations.
  - LOW — Bass (0–200Hz) -> big size, movement speed, background pulse.
  - MID — Vocals / Rhythm (200Hz–2kHz) -> color, position, medium detail.
  - HIGH — Hi-hats / cymbals -> glow, fine detail, particles, text flicker.
- Smoothing/normalization is done in the loader/audio layer; animations assume clean values.

Loader & Manifest
- The (future) `index.html` manifest is the canonical list of animations. Typical fields:
  - slug: the folder name
  - class_name: exported PascalCase class name for that animation
  - name, creator, duration (optional)
- The loader should:
  1. Inject `animations/<slug>/<slug>-animation.html` into the DOM
  2. Find canvas `#canvas-<slug>` and `#meta-<slug>` elements
  3. Instantiate the exported class: `new Class(canvas, config)`
  4. Wire `updateFrequencies()` calls (60Hz by default) from the audio analyzer or test-mode generator
  5. Toggle `.animation-view` display and call `start()`/`stop()` as views change

Development & Test Mode
- No Node or build tool required — run a local static server. Example (PowerShell):

```powershell
cd c:\Users\erbro\Documents\projects\PartyViz
python -m http.server 8000
Start-Process "http://localhost:8000"
```

- A minimal `index.html` test-mode must simulate audio and call `updateFrequencies(low, mid, high)` at 60Hz (random or seeded values). Use `window.AudioTestMode = true` to toggle.
- Loader should expose `window.currentAnimation` in dev so you can interact via the console:

```js
window.currentAnimation.updateFrequencies(10, 50, 80);
```

Debugging & QA Checklist
- Verify `start()` sets `this.frameId` and `stop()` cancels rAF and resets it.
- Verify `updateFrequencies` accepts 0–100 and maps values consistently.
- Check CSS: animation can use global `styles.css` and its own local CSS included in the HTML snippet.
- Confirm no long-running timers when view is not active.

PR Checklist (for all animation additions)
- Folder `animations/<slug>` created
- `slug-animation.html` and `slug-animation.js` provided
- Exported class name matches manifest `class_name`
- `start()`/`stop()` lifecycle implemented and tested (no leaks)
- Metadata populated in `#meta-<slug>`
- Add brief comments describing frequency mappings used
 - Ensure the animation fits the 80s computer vibe / limited palette guideline where possible.

Examples & Quick Reference
- See `animations/template/template-animation.js` for minimal class and frequency mapping examples. Keep changes concise and clearly commented.

If anything is missing, please add small examples or references to real loader code (once `index.html` is added). Feedback needed: do you want short code-snippets inline to be used by Copilot, or prefer explicit references only?