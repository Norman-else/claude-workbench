'use strict';

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.join(__dirname, 'icon-source.png');
const WARM_BG = { r: 255, g: 248, b: 245, alpha: 255 };
const NEAR_WHITE_THRESHOLD = 220;

// ---------------------------------------------------------------------------
// removeWhiteBackground
// Zeroes the alpha channel for any near-white pixel (R>220 AND G>220 AND B>220).
// Accepts a sharp-compatible buffer; returns a new RGBA sharp buffer.
// ---------------------------------------------------------------------------
async function removeWhiteBackground(inputBuffer) {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const pixelCount = width * height;

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * channels;
    const isNearWhite =
      data[offset] > NEAR_WHITE_THRESHOLD &&
      data[offset + 1] > NEAR_WHITE_THRESHOLD &&
      data[offset + 2] > NEAR_WHITE_THRESHOLD;

    if (isNearWhite) {
      data[offset + 3] = 0;
    }
  }

  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

// ---------------------------------------------------------------------------
// createRoundedIconBuffer
// Produces a PNG buffer: warm background + rounded-corner mask + centred icon.
// ---------------------------------------------------------------------------
async function createRoundedIconBuffer(size) {
  const radius = Math.round(size * 0.22);
  const iconSize = Math.round(size * 0.68);
  const padding = Math.round((size - iconSize) / 2);

  const maskSvg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/>` +
    `</svg>`
  );

  const resizedIconBuf = await sharp(SOURCE_PATH)
    .resize(iconSize, iconSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  const iconBuf = await removeWhiteBackground(resizedIconBuf);

  return sharp({
    create: { width: size, height: size, channels: 4, background: WARM_BG },
  })
    .composite([
      { input: maskSvg, blend: 'dest-in' },
      { input: iconBuf, top: padding, left: padding },
    ])
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// createTrayIconBuffer
// Transparent background, starburst only — no rounded corners.
// ---------------------------------------------------------------------------
async function createTrayIconBuffer(size) {
  const sourceBuf = await sharp(SOURCE_PATH).toBuffer();
  const sourceWithoutWhite = await removeWhiteBackground(sourceBuf);

  return sharp(sourceWithoutWhite)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// buildIco
// Encodes multiple RGBA buffers (each `size x size`) into a single ICO file.
// ICO spec: ICONDIR header + ICONDIRENTRY per image + raw PNG payloads.
// ---------------------------------------------------------------------------
async function buildIco(sizes) {
  const images = await Promise.all(
    sizes.map(async (size) => {
      const buf = await createRoundedIconBuffer(size);
      return { size, data: buf };
    })
  );

  const count = images.length;
  // ICONDIR = 6 bytes, each ICONDIRENTRY = 16 bytes
  const headerSize = 6 + count * 16;
  let offset = headerSize;

  const entries = images.map(({ size, data }) => {
    const entry = { size, data, offset };
    offset += data.length;
    return entry;
  });

  const totalSize = offset;
  const ico = Buffer.alloc(totalSize);

  // ICONDIR header
  ico.writeUInt16LE(0, 0);      // reserved
  ico.writeUInt16LE(1, 2);      // type: 1 = ICO
  ico.writeUInt16LE(count, 4);  // number of images

  // ICONDIRENTRY for each image
  entries.forEach(({ size, data, offset: imgOffset }, i) => {
    const base = 6 + i * 16;
    ico.writeUInt8(size >= 256 ? 0 : size, base);      // width (0 means 256)
    ico.writeUInt8(size >= 256 ? 0 : size, base + 1);  // height (0 means 256)
    ico.writeUInt8(0, base + 2);                        // color count
    ico.writeUInt8(0, base + 3);                        // reserved
    ico.writeUInt16LE(1, base + 4);                     // color planes
    ico.writeUInt16LE(32, base + 6);                    // bits per pixel
    ico.writeUInt32LE(data.length, base + 8);           // size of image data
    ico.writeUInt32LE(imgOffset, base + 12);            // offset to image data
  });

  // Copy raw PNG payloads
  entries.forEach(({ data, offset: imgOffset }) => {
    data.copy(ico, imgOffset);
  });

  return ico;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const out = (filename) => path.join(__dirname, filename);

  console.log('Generating icon.png (1024×1024)…');
  const icon1024 = await createRoundedIconBuffer(1024);
  fs.writeFileSync(out('icon.png'), icon1024);

  console.log('Generating icon-256.png (256×256)…');
  const icon256 = await createRoundedIconBuffer(256);
  fs.writeFileSync(out('icon-256.png'), icon256);

  console.log('Generating tray-icon.png (32×32)…');
  const tray32 = await createTrayIconBuffer(32);
  fs.writeFileSync(out('tray-icon.png'), tray32);

  console.log('Generating tray-iconTemplate.png (32×32)…');
  fs.writeFileSync(out('tray-iconTemplate.png'), tray32);

  console.log('Generating icon.ico (16,32,48,64,128,256)…');
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoBuf = await buildIco(icoSizes);
  fs.writeFileSync(out('icon.ico'), icoBuf);

  console.log('Done. Files written:');
  ['icon.png', 'icon-256.png', 'tray-icon.png', 'tray-iconTemplate.png', 'icon.ico'].forEach((f) => {
    const size = fs.statSync(out(f)).size;
    console.log(`  ${f} (${(size / 1024).toFixed(1)} KB)`);
  });
}

main().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
