// Headless Chrome smoke test using only the DevTools protocol (no dependencies).
// Usage: node scripts/smoke-test.mjs
// Optional env: CHROME_PATH, PORT, SMOKE_SECONDS, SMOKE_SHOTS=slug1,slug2.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 8123;
const DEBUG_PORT = Number(process.env.DEBUG_PORT) || 9223;
const WAIT_SECONDS = Number(process.env.SMOKE_SECONDS) || 10;
const URL_UNDER_TEST = `http://127.0.0.1:${PORT}/`;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function waitForUrl(url, attempts = 80, interval = 150) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      /* not ready yet */
    }
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('Could not find Chrome/Edge. Set CHROME_PATH.');
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve: resolveCall, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolveCall(message.result);
      } else if (message.method) {
        this.events.push(message);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveCall, reject) => {
      this.pending.set(id, { resolve: resolveCall, reject });
    });
  }
}

const problems = [];
const warnings = [];
let server;
let chrome;
let userDataDir;

try {
  const chromePath = findChrome();
  server = spawn(process.execPath, [join(ROOT, 'scripts/dev-server.mjs'), String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (chunk) => warnings.push(`[server] ${chunk.toString().trim()}`));
  await waitForUrl(URL_UNDER_TEST);

  userDataDir = await mkdtemp(join(tmpdir(), 'partyviz-smoke-'));
  chrome = spawn(chromePath, [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--mute-audio',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  chrome.stderr.on('data', () => {});

  await waitForUrl(`http://127.0.0.1:${DEBUG_PORT}/json/version`);

  const targetResponse = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(URL_UNDER_TEST)}`, { method: 'PUT' });
  if (!targetResponse.ok) throw new Error(`Could not create Chrome target (${targetResponse.status})`);
  const target = await targetResponse.json();

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });

  const cdp = new Cdp(socket);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');

  await cdp.send('Page.navigate', { url: URL_UNDER_TEST });
  await waitForUrl(URL_UNDER_TEST);

  const evaluate = async (expression) => {
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
  };

  // Wait for the loader to finish all dynamic imports.
  let loaded = 0;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    loaded = await evaluate("window.partyViz && window.partyViz.loaded ? window.partyViz.loaded.length : 0");
    const views = await evaluate("document.querySelectorAll('.animation-view').length");
    if (loaded > 0 && loaded === views) break;
  }

  const viewCount = await evaluate("document.querySelectorAll('.animation-view').length");
  if (viewCount < 1) problems.push('No animation views were injected');

  if (loaded !== viewCount) problems.push(`Loaded ${loaded} of ${viewCount} animation views`);

  if (!(await evaluate('!!window.audioManager'))) problems.push('window.audioManager is missing');
  if (!(await evaluate('!!window.currentAnimation'))) problems.push('window.currentAnimation is missing');

  // Let the test-mode BPM estimator settle, then verify it found ~120 BPM.
  await sleep(WAIT_SECONDS * 1000);
  const bpm = await evaluate('window.audioManager.getBpmInfo()');
  if (!bpm || !bpm.value) {
    problems.push('BPM estimator never produced a value');
  } else if (Math.abs(bpm.value - 120) > 4) {
    problems.push(`Expected test-mode BPM near 120, got ${bpm.value}`);
  }
  if (bpm && !bpm.stable) warnings.push(`BPM is not stable yet: ${JSON.stringify(bpm)}`);

  // Cycle through every animation and make sure each one starts and stops cleanly.
  const slugs = await evaluate('window.partyViz.loaded.map((item) => item.slug)');
  for (let i = 0; i < slugs.length; i++) {
    await evaluate('window.rotateNext(1)');
    await sleep(350);
    const active = await evaluate('window.currentAnimation ? window.currentAnimation.constructor.name : null');
    if (!active) problems.push(`Animation ${slugs[i]} did not expose an instance`);
  }

  // Optional visual inspection: SMOKE_SHOTS=slug1,slug2
  const screenshotSlugs = (process.env.SMOKE_SHOTS || '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean);
  if (screenshotSlugs.length) {
    await evaluate('window.partyViz.setPaused(true); window.partyViz.rotateNext(0)');
    for (const slug of screenshotSlugs) {
      const index = slugs.indexOf(slug);
      if (index < 0) {
        warnings.push(`Unknown screenshot slug: ${slug}`);
        continue;
      }
      await evaluate(`window.partyViz.showIndex(${index})`);
      await sleep(900);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const shotPath = join(tmpdir(), `partyviz-${slug}.png`);
      await writeFile(shotPath, Buffer.from(shot.data, 'base64'));
      console.log(`[smoke] ${slug} screenshot: ${shotPath}`);
    }
  }

  // Return to the debug visualizer for a screenshot.
  const debugIndex = slugs.indexOf('debug-visualizer');
  if (debugIndex >= 0) {
    await evaluate(`window.partyViz.setPaused(true); window.partyViz.showIndex(${debugIndex})`);
    await sleep(600);
    const canvasStats = await evaluate(`(() => {
      const canvas = document.querySelector('#canvas-debug-visualizer');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let nonBlack = 0;
      let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
      for (let y = 0; y < canvas.height; y += 3) {
        for (let x = 0; x < canvas.width; x += 3) {
          const i = (y * canvas.width + x) * 4;
          if (data[i] + data[i + 1] + data[i + 2] > 30) {
            nonBlack++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      return { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height, x: rect.x, y: rect.y, nonBlack, bbox: [minX, minY, maxX, maxY] };
    })()`);
    console.log(`[smoke] debug canvas: ${JSON.stringify(canvasStats)}`);
    if (!canvasStats || canvasStats.cssWidth < 100 || canvasStats.cssHeight < 100) {
      problems.push('debug visualizer canvas has no usable size');
    } else if (canvasStats.x < 250) {
      problems.push(`debug visualizer canvas is not beside the info panel (x=${canvasStats.x})`);
    }
    if (!canvasStats || canvasStats.nonBlack === 0) {
      problems.push('debug visualizer canvas appears blank');
    }
    const canvasDataUrl = await evaluate("document.querySelector('#canvas-debug-visualizer').toDataURL('image/png')");
    const canvasScreenshotPath = join(tmpdir(), 'partyviz-smoke-canvas.png');
    await writeFile(canvasScreenshotPath, Buffer.from(canvasDataUrl.split(',')[1], 'base64'));
    console.log(`[smoke] canvas screenshot: ${canvasScreenshotPath}`);
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const screenshotPath = join(tmpdir(), 'partyviz-smoke.png');
    await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    console.log(`[smoke] screenshot: ${screenshotPath}`);
  }

  const pageProblems = cdp.events
    .filter((event) => event.method === 'Runtime.exceptionThrown')
    .map((event) => event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text);
  const consoleErrors = cdp.events
    .filter((event) => event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error')
    .map((event) => event.params.args.map((arg) => arg.value || arg.description || '').join(' '));
  const logErrors = cdp.events
    .filter((event) => event.method === 'Log.entryAdded' && event.params.entry.level === 'error')
    .map((event) => `${event.params.entry.text} ${event.params.entry.url || ''}`.trim());

  for (const message of [...pageProblems, ...consoleErrors, ...logErrors]) {
    if (message && !/favicon\.ico/i.test(message)) problems.push(message);
  }

  console.log(`[smoke] views=${viewCount} loaded=${loaded} bpm=${bpm?.value ?? '-'} stable=${bpm?.stable ?? false}`);
  for (const warning of warnings) console.warn(`[smoke] warning: ${warning}`);
  if (problems.length) {
    for (const problem of problems) console.error(`[smoke] error: ${problem}`);
    process.exitCode = 1;
  } else {
    console.log('[smoke] OK');
  }

  socket.close();
} catch (error) {
  console.error('[smoke] failed:', error.message);
  process.exitCode = 1;
} finally {
  if (chrome) chrome.kill();
  if (server) server.kill();
  if (userDataDir) {
    try {
      await rm(userDataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
