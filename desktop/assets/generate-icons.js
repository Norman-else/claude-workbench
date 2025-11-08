#!/usr/bin/env node

/**
 * Simple icon generator for Claude Workbench
 * Creates basic placeholder icons that can be replaced later
 * 
 * This creates simple SVG-based icons and saves them as PNG
 * For production, replace with professionally designed icons
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a simple SVG icon
function createAppIconSVG(size) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background gradient -->
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#8B5CF6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#6366F1;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="url(#bgGradient)"/>
  
  <!-- "CW" Text -->
  <text 
    x="50%" 
    y="50%" 
    font-family="Arial, sans-serif" 
    font-size="${size * 0.4}" 
    font-weight="bold" 
    fill="white" 
    text-anchor="middle" 
    dominant-baseline="central">CW</text>
</svg>`;
}

// Create a simple tray icon SVG (monochrome for macOS template)
function createTrayIconSVG(size, isTemplate = false) {
  const color = isTemplate ? '#000000' : '#8B5CF6';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${size/2}" cy="${size/2}" r="${size * 0.4}" fill="${color}"/>
  <text 
    x="50%" 
    y="50%" 
    font-family="Arial, sans-serif" 
    font-size="${size * 0.5}" 
    font-weight="bold" 
    fill="white" 
    text-anchor="middle" 
    dominant-baseline="central">C</text>
</svg>`;
}

// Save SVG files
const assetsDir = __dirname;

// Save main icon SVG
fs.writeFileSync(
  path.join(assetsDir, 'icon.svg'),
  createAppIconSVG(1024)
);

// Save tray icon SVGs
fs.writeFileSync(
  path.join(assetsDir, 'tray-icon.svg'),
  createTrayIconSVG(22, false)
);

fs.writeFileSync(
  path.join(assetsDir, 'tray-iconTemplate.svg'),
  createTrayIconSVG(22, true)
);

console.log('✅ Icon SVG files created!');
console.log('');
console.log('📝 Next steps:');
console.log('1. Convert SVG to PNG/ICO using an online tool or ImageMagick');
console.log('2. For macOS: Convert icon.png to icon.icns');
console.log('3. For Windows: Convert icon.png to icon.ico');
console.log('4. Or use electron-builder which can auto-generate from icon.png');
console.log('');
console.log('💡 For better results, create professional icons in a design tool like Figma or Sketch');

