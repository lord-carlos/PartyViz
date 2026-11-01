---
name: PartyViz Review
description: Audit a PartyViz animation or loader/audio change for contract compliance, lifecycle leaks, performance, and visual consistency.
---

# PartyViz Review Workflow

Use this skill when reviewing an animation contribution or a change to the
loader/audio pipeline.

## Commands

```bash
bun run validate
bun run test
bun run smoke
```

`validate` is the fast structural check. `smoke` is the real integration check:
it loads the page in headless Chrome, cycles all animations, collects page
errors, and verifies test-mode BPM.

## Contract checklist

- [ ] Manifest entry has `slug`, `name`, `creator`, `class_name`, `duration`.
- [ ] Folder/file naming matches the slug.
- [ ] HTML has `view-<slug>`, `canvas-<slug>`, `meta-<slug>`.
- [ ] JS exports exactly the manifest `class_name`.
- [ ] `constructor(canvas, config)`, `updateFrequencies`, `start`, `stop`.
- [ ] `config.settings` is the path for per-animation settings.
- [ ] `start()` is idempotent; no duplicate rAF loops.
- [ ] `stop()` cancels rAF, clears timers, removes listeners, unsubscribes audio,
      disposes GPU resources.
- [ ] Canvas is sized after layout and handles DPR/resize.
- [ ] Bands use `0..100`; no `/255` or thresholds above 100.
- [ ] Frequencies are mapped intentionally (low = weight/pulse, mid = motion/color,
      high = detail/glow).

## High-severity bug patterns in this repo

1. **Wrong band scale**: `LOW / 255`, `MID > 120`, `HIGH > 100`. Bands are 0..100.
2. **rAF leaks in effects**: `createImpactWave` starting its own
   `requestAnimationFrame` chain that survives `stop()`. Update effects from the
   main loop instead.
3. **Listener leaks**: `window`/`canvas` listeners added in the constructor or
   every `start()` but never removed. Store the handler and remove it in `stop()`.
4. **Restart corruption**: `stop()` disposes the renderer but leaves arrays of
   disposed meshes/scene references, so the next `start()` appends to stale state.
   Null/reset scene, renderer, arrays, counters.
5. **Double init**: `start()` calls `init()` unconditionally, creating a second
   WebGL renderer on the same canvas. Guard with `if (this.scene) return;`.
6. **Per-frame GPU allocation**: `new CanvasTexture`, `new BufferGeometry`,
   `new BufferAttribute`, or a new material inside the draw loop. Preallocate and
   update buffers in place.
7. **Per-frame style reads**: `getComputedStyle()` inside `draw()`. Cache colors.
8. **Per-item shadow blur**: setting `shadowBlur` for every bar/particle/name.
   Batch it or set once.
9. **Unbatched strokes**: one `beginPath`/`stroke` per grid line. Batch into one
   path and one stroke.
10. **Painter-order bug**: sorting entities one way and iterating the other way.
    Verify near/far draw order.
11. **Unreachable thresholds**: values compared above 100, e.g. `mid > 120`.
12. **Dead services**: subscribing to `audioManager.onUpdate` and never
    unsubscribing.
13. **Unbounded timers**: `setTimeout` for combo/effect cleanup without tracking
    and clearing it in `stop()`.
14. **Aspect-ratio bugs**: orthographic camera frustum not updated on resize, or
    a fixed frustum that stretches the scene.
15. **Unbounded coordinate drift**: an offset that only grows (compass, rotation)
    eventually loses precision. Wrap it.

## Performance checklist

- [ ] No `Math.random()` in the draw path.
- [ ] No `new` objects/arrays/closures per frame in hot loops.
- [ ] No `shift()`/`splice()` on large particle arrays per frame; use ring
      buffers or draw ranges.
- [ ] Static backgrounds cached (offscreen canvas/geometry).
- [ ] Text HUD updates throttled (DOM writes and `measureText` are expensive).
- [ ] `shadowBlur` used sparingly; expensive blur/filter not applied to the whole
      canvas every frame.
- [ ] Three.js: no `preserveDrawingBuffer`, no unnecessary shadow maps, no
      per-frame texture/material creation, post-processing disposed/recreated
      correctly.
- [ ] Resize updates canvas dimensions, context transform, camera aspect, and
      composer size.

## Visual checklist

- [ ] 80s terminal identity: limited palette, monospace, restrained glow.
- [ ] Background supports the foreground instead of competing with it.
- [ ] Metadata remains readable.
- [ ] No full-screen scanline overlay (the host page provides one).
- [ ] Synthwave/neon pieces use a deliberate palette rather than accidental color.

## Review output

Group findings by severity (`high`, `medium`, `low`). For each finding include:

- file:line
- what is wrong
- why it matters (leak, crash, wrong reaction, frame cost)
- one concrete fix

Do not claim runtime verification unless `bun run smoke` was actually run. If you
only reviewed statically, say so.
