# DEVELOPING.md — PartyViz Development Guide

This document helps contributors run, debug, and extend the PartyViz single-page app.

Overview
- PartyViz flows: `index.html` loads a manifest of animations, injects each `animation-view`, instantiates the exported class with its canvas, and sends a continuous stream of normalized `low`, `mid`, `high` bandwidth values.
- No build tools required — simple static server + browser is sufficient.

Design & aesthetic guidance
- PartyViz has an 80s 'computer terminal' visual identity: prefer a monochrome or limited palette (green/amber on black), pixel/mono font choices, and minimal color effects. Animations should be readable and stylistically consistent with this retro vibe.

Run locally (PowerShell)
1. Start a static server in the repo root:

```powershell
cd c:\Users\erbro\Documents\projects\PartyViz
python -m http.server 8000
Start-Process "http://localhost:8000"
```

2. Open the app in the browser and check the DevTools console for errors.

Test Mode (index behavior)
- Since `index.html` is not yet added, when you create it or when the eventual loader is implemented, include a test-mode generator that simulates audio by generating random or deterministic `low`, `mid`, and `high` values and calls `updateFrequencies()` on the active animation at ~60Hz.
- Example test generator pseudocode:

```js
let testMode = true;
let activeAnimation = window.currentAnimation;
if (testMode && activeAnimation) {
  setInterval(() => {
    const low = Math.floor(Math.random() * 101);
    const mid = Math.floor(Math.random() * 101);
    const high = Math.floor(Math.random() * 101);
    activeAnimation.updateFrequencies(low, mid, high);
  }, 1000 / 60);
}
```

NOTE: Prefer `requestAnimationFrame` based timing if tied to visual frames instead of setInterval.

Add an Animation — step-by-step
- Create folder `animations/<slug>` (slug should be lowercase, no spaces).
- Add `animations/<slug>/<slug>-animation.html`:
  - Include a `div#view-<slug> .animation-view`, a `canvas#canvas-<slug>`, and `div#meta-<slug>` for metadata.
  - Optionally include a local `.css` for animation-specific styles.
- Add `animations/<slug>/<slug>-animation.js`:
  - Export a PascalCase class that matches the loader's `class_name` field in the manifest (e.g., `class FireworksAnimation` -> `class_name: "FireworksAnimation"`).
  - Implement: `constructor(canvas, config)`, `updateFrequencies(low, mid, high)`, `start()`, and `stop()`.
- Add a manifest entry in `index.html` with `slug`, `class_name`, `name`, `creator`, and optional `duration`.

Example class skeleton (in `animations/template/template-animation.js`)
```
export class TemplateAnimation {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.config = config;
    this.frameId = null;
    this.LOW = 0; this.MID = 0; this.HIGH = 0;
  }
  updateFrequencies(low, mid, high) { this.LOW = low; this.MID = mid; this.HIGH = high; }
  start() { if (!this.frameId) { this.drawFrame(); } }
  stop() { if (this.frameId) { cancelAnimationFrame(this.frameId); this.frameId = null; } }
  drawFrame = () => { /* draw using this.LOW/MID/HIGH; schedule rAF */ }
}
```

Debugging Tips
- Expose the active animation to the console so you can call `updateFrequencies()` directly:

```js
window.currentAnimation = activeInstance;
window.currentAnimation.updateFrequencies(20, 50, 80);
```

- Use `console.log` for small debugging. Remove or disable extensive logs before PRs if they’re noisy.
- If an animation uses local CSS, verify there are no conflicting global styles.

Testing
- Manual testing: use test-mode generator to send random values and verify visuals.
- Write unit tests if needed (optional). Use a single `class` exported to test `start/stop` and that `updateFrequencies` has the desired effect. Since this is pure front-end, mock `canvas.getContext` in tests or include a headless approach.

Performance Checklist
- Ensure `start()`/`stop()` lifecycle properly manages `requestAnimationFrame` (no runaway loops after switching views).
- No long-running synchronous processing in the draw loop.
- Keep number of rAF instances minimal (one per active view).

Next Steps
- Once you’re ready to add `index.html`, I can draft the loader behavior and a simple test harness that rotates views and simulates audio with random values at 60Hz.
- Optionally, if you decide to add Node tooling later, we can add a `package.json` and small dev scripts. For now the repo is intentionally minimal and simple.

</DEVELOPING>
