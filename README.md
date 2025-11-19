PartyViz
========

PartyViz is a small single-page site of canvas-based animations that react to music.

Demo
----
https://lord-carlos.github.io/PartyViz/

Make your own animations
------------------------
Option 1 — Use an AI:

- Copy the contents of `PROMT.md` and paste it into an AI assistant (for example: ChatGPT, GitHub Copilot, or Google Gemini).

Option 2 — Start from examples:

- Inspect the existing animations in the `animations/` folder or copy `animations/template` and modify it to create your animation.

Customization
-------------
- You can edit `names.json` to customize displayed names used by the app.

Per-animation settings
----------------------
- Each animation has optional settings in `animations/animations.yml`. For example, `synthwave-run` exposes `maxNames` to control how many name entities can appear simultaneously. Change it in `animations/animations.yml` under the `settings:` block for each animation.

Quick test
----------
Run a simple static server and open the site locally:

```bash
python -m http.server 8000
# then open http://localhost:8000 in your browser
```