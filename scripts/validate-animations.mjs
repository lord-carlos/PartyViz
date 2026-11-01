// Static validation for animations.yml, animation files, and required exports.
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ANIMATIONS_DIR = join(ROOT, 'animations');
const MANIFEST = join(ANIMATIONS_DIR, 'animations.yml');

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readText(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

const manifestText = await readText(MANIFEST);
if (!manifestText) {
  console.error(`[validate] Missing ${MANIFEST}`);
  process.exit(1);
}

let manifest;
try {
  manifest = yaml.load(manifestText);
} catch (err) {
  console.error(`[validate] Invalid YAML in animations.yml: ${err.message}`);
  process.exit(1);
}

const animations = manifest && manifest.animations;
if (!Array.isArray(animations)) {
  console.error('[validate] animations.yml must contain a top-level "animations" array');
  process.exit(1);
}

const seenSlugs = new Set();
const seenClasses = new Set();

for (const [index, entry] of animations.entries()) {
  const label = `animations[${index}]${entry && entry.slug ? ` (${entry.slug})` : ''}`;

  if (!entry || typeof entry !== 'object') {
    fail(`${label}: entry must be an object`);
    continue;
  }

  for (const field of ['slug', 'name', 'creator', 'class_name', 'duration']) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
      fail(`${label}: missing required field "${field}"`);
    }
  }

  const slug = entry.slug;
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fail(`${label}: slug must be lowercase kebab-case`);
    continue;
  }

  if (seenSlugs.has(slug)) fail(`${label}: duplicate slug "${slug}"`);
  seenSlugs.add(slug);

  const className = entry.class_name;
  if (typeof className !== 'string' || !/^[A-Z][A-Za-z0-9]*$/.test(className)) {
    fail(`${label}: class_name must be PascalCase`);
  } else {
    if (seenClasses.has(className)) warn(`${label}: duplicate class_name "${className}"`);
    seenClasses.add(className);
  }

  if (entry.duration !== undefined && (!Number.isFinite(entry.duration) || entry.duration <= 0)) {
    fail(`${label}: duration must be a positive number of seconds`);
  }

  const dir = join(ANIMATIONS_DIR, slug);
  const htmlPath = join(dir, `${slug}-animation.html`);
  const jsPath = join(dir, `${slug}-animation.js`);

  if (!(await exists(dir))) {
    fail(`${label}: folder animations/${slug} does not exist`);
    continue;
  }

  const html = await readText(htmlPath);
  if (html === null) {
    fail(`${label}: missing animations/${slug}/${slug}-animation.html`);
  } else {
    for (const id of [`view-${slug}`, `canvas-${slug}`, `meta-${slug}`]) {
      if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
        fail(`${label}: HTML is missing id="${id}"`);
      }
    }
  }

  const js = await readText(jsPath);
  if (js === null) {
    fail(`${label}: missing animations/${slug}/${slug}-animation.js`);
  } else {
    if (className && !new RegExp(`export\\s+class\\s+${className}\\b`).test(js)) {
      fail(`${label}: JS does not export class ${className}`);
    }
    for (const method of ['updateFrequencies', 'start', 'stop']) {
      if (!new RegExp(`\\b${method}\\s*\\(`).test(js)) {
        fail(`${label}: JS is missing ${method}()`);
      }
    }
    if (!/requestAnimationFrame\s*\(/.test(js)) {
      warn(`${label}: JS does not call requestAnimationFrame`);
    }
    if (/setInterval\s*\(/.test(js)) {
      warn(`${label}: uses setInterval; prefer the rAF draw loop`);
    }
  }
}

// Folders that are not in the manifest are usually forgotten contributions.
const folders = (await readdir(ANIMATIONS_DIR, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
for (const folder of folders) {
  if (!seenSlugs.has(folder)) warn(`animations/${folder} is not listed in animations.yml`);
}

// names.json is optional but, when present, must have the expected shape.
const namesPath = join(ROOT, 'names.json');
if (await exists(namesPath)) {
  const namesText = await readText(namesPath);
  try {
    const names = JSON.parse(namesText);
    if (!Array.isArray(names.names)) warn('names.json: expected an object with a "names" array');
  } catch (err) {
    fail(`names.json is not valid JSON: ${err.message}`);
  }
}

for (const warning of warnings) console.warn(`[validate] warning: ${warning}`);

if (errors.length) {
  for (const error of errors) console.error(`[validate] error: ${error}`);
  console.error(`[validate] ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}

console.log(`[validate] ${animations.length} animations OK (${warnings.length} warning(s))`);
