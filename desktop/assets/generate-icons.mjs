#!/usr/bin/env node

/**
 * Icon generator for Claude Workbench
 * Creates valid PNG files for system tray
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Calculate CRC32 for PNG chunks
function calculateCRC(data) {
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }

  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  crc = crc ^ 0xffffffff;

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);
  return crcBuffer;
}

// Generate a PNG with smooth 3D cube design
function createPNG(width, height, colorMode = 'smooth3d') {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdrChunk = Buffer.concat([
    Buffer.from([0, 0, 0, 13]),
    Buffer.from('IHDR'),
    ihdrData,
    calculateCRC(Buffer.concat([Buffer.from('IHDR'), ihdrData]))
  ]);

  const scanlines = [];
  const cx = width / 2;
  const cy = height / 2;
  const size = Math.min(width, height) * 0.7;
  
  for (let y = 0; y < height; y++) {
    const scanline = Buffer.alloc(width * 3 + 1);
    scanline[0] = 0;
    
    for (let x = 0; x < width; x++) {
      const base = 1 + x * 3;
      
      // Create rounded square shape
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      const halfSize = size / 2;
      const cornerRadius = size * 0.25;
      
      let inShape = false;
      let r = 30, g = 30, b = 30; // Background
      
      // Check if inside rounded rectangle
      if (dx <= halfSize && dy <= halfSize) {
        if (dx <= halfSize - cornerRadius || dy <= halfSize - cornerRadius) {
          inShape = true;
        } else {
          const cdx = dx - (halfSize - cornerRadius);
          const cdy = dy - (halfSize - cornerRadius);
          if (cdx * cdx + cdy * cdy <= cornerRadius * cornerRadius) {
            inShape = true;
          }
        }
      }
      
      if (inShape) {
        // Create gradient from top-left to bottom-right
        const normX = (x - (cx - halfSize)) / size;
        const normY = (y - (cy - halfSize)) / size;
        
        // Vibrant gradient colors (bright blue to deeper blue)
        const t = (normX + normY) / 2;
        r = Math.floor(70 + t * 90);       // 70-160
        g = Math.floor(140 + t * 80);      // 140-220
        b = Math.floor(255 - t * 35);      // 255-220
        
        // Add stronger highlight in top-left for 3D effect
        if (normX < 0.5 && normY < 0.5) {
          const highlight = (0.5 - normX) * (0.5 - normY) * 150;
          r = Math.min(255, r + highlight);
          g = Math.min(255, g + highlight);
          b = Math.min(255, b + highlight);
        }
        
        // Add deeper shadow in bottom-right
        if (normX > 0.5 && normY > 0.5) {
          const shadow = (normX - 0.5) * (normY - 0.5) * 140;
          r = Math.max(0, r - shadow);
          g = Math.max(0, g - shadow);
          b = Math.max(0, b - shadow);
        }
      }
      
      scanline[base] = Math.max(0, Math.min(255, Math.floor(r)));
      scanline[base + 1] = Math.max(0, Math.min(255, Math.floor(g)));
      scanline[base + 2] = Math.max(0, Math.min(255, Math.floor(b)));
    }
    scanlines.push(scanline);
  }

  const idatData = Buffer.concat(scanlines);
  const compressedData = zlib.deflateSync(idatData);
  
  const idatChunk = Buffer.concat([
    Buffer.from([0, 0, 0, 0]),
    Buffer.from('IDAT'),
    compressedData,
    calculateCRC(Buffer.concat([Buffer.from('IDAT'), compressedData]))
  ]);
  
  idatChunk.writeUInt32BE(compressedData.length, 0);

  const iendChunk = Buffer.concat([
    Buffer.from([0, 0, 0, 0]),
    Buffer.from('IEND'),
    calculateCRC(Buffer.from('IEND'))
  ]);

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Create SVG icon
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

// Create tray icon SVG - Mac-style monochrome geometric icon
function createTrayIconSVG(size, isTemplate = false) {
  if (isTemplate) {
    // macOS template: monochrome geometric hexagon
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Hexagon shape -->
  <path d="M ${size*0.25} ${size*0.38} L ${size*0.43} ${size*0.25} L ${size*0.68} ${size*0.25} L ${size*0.86} ${size*0.50} L ${size*0.68} ${size*0.75} L ${size*0.43} ${size*0.75} Z" fill="#000"/>
  <!-- Inner diamond -->
  <path d="M ${size*0.43} ${size*0.50} L ${size*0.56} ${size*0.37} L ${size*0.69} ${size*0.50} L ${size*0.56} ${size*0.63} Z" fill="#FFF" opacity="0.8"/>
</svg>`;
  }
  
  // Windows/Linux: Smooth gradient rounded square
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="smoothGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#a0b5f0;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#6882dc;stop-opacity:1" />
    </linearGradient>
    <filter id="softShadow">
      <feGaussianBlur in="SourceAlpha" stdDeviation="0.5"/>
      <feOffset dx="0" dy="0.5" result="offsetblur"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.3"/>
      </feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  
  <!-- Rounded rectangle with smooth gradient -->
  <rect x="${size*0.15}" y="${size*0.15}" 
        width="${size*0.7}" height="${size*0.7}" 
        rx="${size*0.15}" ry="${size*0.15}" 
        fill="url(#smoothGrad)" 
        filter="url(#softShadow)"/>
  
  <!-- Subtle highlight overlay -->
  <rect x="${size*0.15}" y="${size*0.15}" 
        width="${size*0.35}" height="${size*0.35}" 
        rx="${size*0.15}" ry="${size*0.15}" 
        fill="white" 
        opacity="0.2"/>
</svg>`;
}

// Create ICO file from PNG buffer
function createICO(pngBuffer) {
  // ICO file format: header + image directory + image data
  const ico = Buffer.alloc(22 + pngBuffer.length);
  let offset = 0;
  
  // ICO header
  ico[offset++] = 0;      // reserved
  ico[offset++] = 0;      // reserved
  ico.writeUInt16LE(1, offset); // image count
  offset += 2;
  
  // Image directory entry
  ico[offset++] = 16;     // width
  ico[offset++] = 16;     // height
  ico[offset++] = 0;      // color count
  ico[offset++] = 0;      // reserved
  ico.writeUInt16LE(1, offset); // color planes
  offset += 2;
  ico.writeUInt16LE(32, offset); // bits per pixel
  offset += 2;
  ico.writeUInt32LE(pngBuffer.length, offset); // size
  offset += 4;
  ico.writeUInt32LE(22, offset); // offset
  offset += 4;
  
  // Append PNG data
  pngBuffer.copy(ico, 22);
  
  return ico;
}

const assetsDir = __dirname;

try {
  console.log('🎨 Generating icons for Claude Workbench...\n');

  // Generate SVG files
  fs.writeFileSync(
    path.join(assetsDir, 'icon.svg'),
    createAppIconSVG(1024)
  );
  console.log('✅ Created icon.svg');

  fs.writeFileSync(
    path.join(assetsDir, 'tray-icon.svg'),
    createTrayIconSVG(22, false)
  );
  console.log('✅ Created tray-icon.svg');

  fs.writeFileSync(
    path.join(assetsDir, 'tray-iconTemplate.svg'),
    createTrayIconSVG(22, true)
  );
  console.log('✅ Created tray-iconTemplate.svg');

  // Generate PNG files
  console.log('\nGenerating PNG files...');
  
  const trayPng = createPNG(22, 22, 'smooth3d'); // Smooth gradient cube
  fs.writeFileSync(path.join(assetsDir, 'tray-icon.png'), trayPng);
  console.log('✅ Created tray-icon.png (22x22 - Smooth 3D)');

  const trayTemplatePng = createPNG(22, 22, 'smooth3d'); // For macOS
  fs.writeFileSync(path.join(assetsDir, 'tray-iconTemplate.png'), trayTemplatePng);
  console.log('✅ Created tray-iconTemplate.png (22x22 - Smooth 3D)');

  // Generate ICO files
  console.log('\nGenerating ICO files...');
  
  const trayIco = createICO(trayPng);
  fs.writeFileSync(path.join(assetsDir, 'tray-icon.ico'), trayIco);
  console.log('✅ Created tray-icon.ico');

  console.log('\n✅ All icons generated successfully!');

} catch (error) {
  console.error('❌ Error generating icons:', error.message);
  process.exit(1);
}
