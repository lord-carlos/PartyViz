# PartyViz

A single-page, zero-build collection of canvas and Three.js animations that react
to music. It rotates through the animations automatically, with a CRT/80s
terminal look and a built-in test signal so it works without a microphone.

**Demo:** https://lord-carlos.github.io/PartyViz/

## Quick start

The app itself needs no build step or runtime packages. For the dev tooling:

```bash
bun install
bun run dev
```

Then open http://127.0.0.1:8000/. Any static server works too:

```bash
python -m http.server 8000
```

Bun is the recommended package manager for the dev scripts. Node 22+ works as
well (`node scripts/dev-server.mjs`). Three.js and js-yaml for the runtime are
loaded from CDNs via `index.html`; there is no bundler.

## Controls

- `<` / `>` (or left/right arrow keys): previous/next animation.
- Pause button (or space): stop automatic rotation; the current animation keeps
  running.
- **TEST_MODE**: feeds a simulated 120 BPM musical pattern to the animations.
  This is on by default.
- **Enable Mic**: requests microphone access and switches to live input. After
  permission is granted you can choose a specific input device.

## Audio model

Animations receive three normalized bands (`0..100`) every frame:

| Band | Frequency range | Typical use |
| --- | --- | --- |
| `low` | 20–250 Hz | kick, pulse, size, shake, slow motion |
| `mid` | 250–4000 Hz | melody/vocals, speed, color, medium detail |
| `high` | 4000–20000 Hz | hats/cymbals, glow, flicker, particles |

The audio layer also exposes richer data (`spectrumNorm`, RMS, spectral centroid,
spectral flux, and an experimental BPM estimate) through
`window.audioManager.onUpdate()`. See [AGENTS.md](AGENTS.md#audio-model) for the
payload shape.

BPM detection is experimental and works best with clear, regular transients.
Test mode simulates 120 BPM so it can be verified without audio hardware.

## Adding an animation

An animation is a folder with an HTML snippet and an ES module class:

```text
animations/<slug>/
├── <slug>-animation.html
├── <slug>-animation.js
└── <slug>-animation.css   # optional
```

The class must implement `constructor(canvas, config)`,
`updateFrequencies(low, mid, high)`, `start()`, and `stop()`, and be listed in
`animations/animations.yml`.

Coding agents should follow [AGENTS.md](AGENTS.md) and the OpenCode skills in
`.opencode/skills/`:

- `partyviz-animation` — create or modify an animation.
- `partyviz-audio` — work on the analyser, bands, test mode, or BPM.
- `partyviz-review` — audit an animation for contract/performance issues.

Start from `animations/template/` if you prefer a working example.

## Development commands

```bash
bun run dev        # static server (PORT/HOST env supported)
bun run validate   # manifest, files, IDs, class export, required methods
bun run test       # node:test unit tests for BPM/audio math
bun run check      # validate + tests
bun run smoke      # headless Chrome integration test
```

`bun run smoke` loads the real page, cycles through every animation, checks for
page errors, and verifies test-mode BPM convergence. It needs Chrome or Edge;
set `CHROME_PATH` if auto-detection fails. Screenshots are written to the system
temp directory; set `SMOKE_SHOTS=slug1,slug2` to capture specific animations.

## Project structure

```text
index.html                 shell, header, import map
index.js                   manifest loader, rotation, mic/test-mode UI
audio-manager.js           analyser, bands, features, test generator
bpm-estimator.js           shared tempo estimator
bpm-worker.js              module worker wrapper
animations/animations.yml  canonical animation list
animations/<slug>/         animation HTML/JS/CSS
styles.css                 shared CRT theme and CSS variables
names.json                 optional names used by several animations
scripts/                   dev server, validator, smoke test
tests/                     node:test unit tests
```

## Customization

- Edit `names.json` to change the names displayed by animations that support it.
- Per-animation settings live under the `settings:` block in
  `animations/animations.yml`; the whole manifest entry is passed to the class as
  `config`.
- Colors come from the CSS variables in `styles.css` (`--color-primary`,
  `--color-bg`, `--color-grid`, `--font-mono`).

## Notes

- `names.json` is intentionally gitignored so local names do not get committed;
  use `names.example.json` as a template.
- Keep the runtime zero-build. The dev tools are optional and only needed for
  validation/tests.
