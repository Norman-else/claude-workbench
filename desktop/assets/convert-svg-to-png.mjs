#!/usr/bin/env node

/**
 * Convert SVG files to PNG and ICO formats using sharp
 * Run: npm install sharp && node desktop/assets/convert-svg-to-png.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const assetsDir = __dirname;

async function convertSvgToPng(svgPath, pngPath, width = 22, height = 22) {
  try {
    const svgBuffer = fs.readFileSync(svgPath);
    await sharp(svgBuffer, { density: 150 })
      .png()
      .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toFile(pngPath);
    return true;
  } catch (error) {
    console.error(`Failed to convert ${svgPath}:`, error.message);
    return false;
  }
}

async function convertPngToIco(pngPath, icoPath) {
  try {
    const pngBuffer = fs.readFileSync(pngPath);
    // For now, just copy PNG data (Windows can use PNG in tray)
    // For proper ICO, would need additional conversion
    fs.copyFileSync(pngPath, icoPath);
    return true;
  } catch (error) {
    console.error(`Failed to convert ${pngPath} to ICO:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🎨 Converting SVG icons to PNG and ICO formats...\n');

  try {
    // Convert tray icon SVG to PNG
    const trayIconPath = path.join(assetsDir, 'tray-icon.svg');
    const trayIconPngPath = path.join(assetsDir, 'tray-icon.png');
    
    if (fs.existsSync(trayIconPath)) {
      console.log('Converting tray-icon.svg to PNG...');
      if (await convertSvgToPng(trayIconPath, trayIconPngPath, 22, 22)) {
        console.log('✅ Created tray-icon.png');
        
        // Convert PNG to ICO for Windows
        const trayIconIcoPath = path.join(assetsDir, 'tray-icon.ico');
        if (await convertPngToIco(trayIconPngPath, trayIconIcoPath)) {
          console.log('✅ Created tray-icon.ico');
        }
      }
    }

    // Convert tray template SVG to PNG
    const trayTemplatePath = path.join(assetsDir, 'tray-iconTemplate.svg');
    const trayTemplatePngPath = path.join(assetsDir, 'tray-iconTemplate.png');
    
    if (fs.existsSync(trayTemplatePath)) {
      console.log('Converting tray-iconTemplate.svg to PNG...');
      if (await convertSvgToPng(trayTemplatePath, trayTemplatePngPath, 22, 22)) {
        console.log('✅ Created tray-iconTemplate.png');
      }
    }

    console.log('\n✅ Icon conversion complete!');
  } catch (error) {
    console.error('\n❌ Error during icon conversion:', error.message);
    process.exit(1);
  }
}

main();

