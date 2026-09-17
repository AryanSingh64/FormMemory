/**
 * FormMemory Packager
 * Packages extension files into browser-specific zips:
 *  - formmemory-firefox.zip
 *  - formmemory-chrome.zip
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Run build first to ensure latest files are synced
execSync('node build.js', { stdio: 'inherit' });

function createZip(sourceDir, zipName) {
  if (fs.existsSync(zipName)) {
    fs.unlinkSync(zipName);
  }

  try {
    // Compress all files inside sourceDir into zipName
    execSync(`powershell -Command "Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${zipName}' -Force"`);
    console.log(`[FormMemory] Successfully created ${zipName} from ./${sourceDir}`);
  } catch (err) {
    console.error(`[FormMemory] Error creating ${zipName}:`, err.message);
  }
}

createZip('firefox', 'formmemory-firefox.zip');
createZip('chrome', 'formmemory-chrome.zip');

// Also keep formmemory-extension.zip (defaults to firefox package) for backwards compatibility
if (fs.existsSync('formmemory-firefox.zip')) {
  fs.copyFileSync('formmemory-firefox.zip', 'formmemory-extension.zip');
}

console.log('[FormMemory] All browser packages generated successfully!');
