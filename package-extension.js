/**
 * FormMemory Packager
 * Packages extension files into formmemory-extension.zip for GitHub releases or Firefox Add-ons.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const filesToInclude = [
  'manifest.json',
  'background.js',
  'content.js',
  'content.css',
  'popup.html',
  'popup.js',
  'popup.css',
  'icon.svg',
  'icon-16.png',
  'icon-48.png',
  'icon-128.png',
  'README.md'
];

const zipName = 'formmemory-extension.zip';

// Remove old zip if present
if (fs.existsSync(zipName)) {
  fs.unlinkSync(zipName);
}

try {
  // Use PowerShell Compress-Archive on Windows
  const fileList = filesToInclude.filter(f => fs.existsSync(f)).join(', ');
  execSync(`powershell -Command "Compress-Archive -Path ${fileList} -DestinationPath ${zipName} -Force"`);
  console.log(`Successfully created ${zipName}! Ready to upload or share.`);
} catch (err) {
  console.error('Error creating zip archive:', err.message);
}
