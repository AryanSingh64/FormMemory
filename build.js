/**
 * FormMemory - Multi-Browser Build Script
 * Builds dedicated, ready-to-load versions for Firefox and Chrome.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const FIREFOX_DIR = path.join(ROOT_DIR, 'firefox');
const CHROME_DIR = path.join(ROOT_DIR, 'chrome');

const SHARED_FILES = [
  'background.js',
  'content.js',
  'content.css',
  'popup.html',
  'popup.js',
  'popup.css',
  'icon-16.png',
  'icon-48.png',
  'icon-128.png',
  'icon.svg'
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src, dest) {
  fs.copyFileSync(src, dest);
}

function build() {
  console.log('[FormMemory] Building browser targets...');

  ensureDir(FIREFOX_DIR);
  ensureDir(CHROME_DIR);

  // Copy shared assets to both targets
  for (const file of SHARED_FILES) {
    const src = path.join(ROOT_DIR, file);
    if (fs.existsSync(src)) {
      copyFile(src, path.join(FIREFOX_DIR, file));
      copyFile(src, path.join(CHROME_DIR, file));
    }
  }

  // Base manifest from root
  const baseManifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'manifest.json'), 'utf8'));

  // 1. FIREFOX MANIFEST (Manifest V3 with background scripts + gecko ID)
  const firefoxManifest = {
    ...baseManifest,
    background: {
      scripts: ['background.js']
    },
    browser_specific_settings: {
      gecko: {
        id: 'formmemory@antigravity.local',
        strict_min_version: '109.0'
      }
    }
  };

  fs.writeFileSync(
    path.join(FIREFOX_DIR, 'manifest.json'),
    JSON.stringify(firefoxManifest, null, 2) + '\n',
    'utf8'
  );
  console.log('[FormMemory] Firefox version ready in ./firefox');

  // 2. CHROME MANIFEST (Manifest V3 with service_worker, no gecko block)
  const chromeManifest = {
    ...baseManifest,
    background: {
      service_worker: 'background.js'
    }
  };
  delete chromeManifest.browser_specific_settings;

  fs.writeFileSync(
    path.join(CHROME_DIR, 'manifest.json'),
    JSON.stringify(chromeManifest, null, 2) + '\n',
    'utf8'
  );
  console.log('[FormMemory] Chrome version ready in ./chrome');
  console.log('[FormMemory] Build complete!');
}

build();
