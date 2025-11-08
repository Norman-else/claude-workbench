# Application Icons

This directory contains the application icons for Claude Workbench desktop app.

## Icon Files

### Application Icons
- `icon.png` - Base icon (1024x1024) - Used for macOS and Linux
- `icon.icns` - macOS application icon (generated from icon.png)
- `icon.ico` - Windows application icon (generated from icon.png)

### Tray Icons
- `tray-icon.png` - Tray icon for Linux (22x22)
- `tray-iconTemplate.png` - Tray template icon for macOS (22x22, monochrome)
- `tray-icon.ico` - Tray icon for Windows (16x16)

## Generating Icons

If you want to create custom icons, follow these steps:

### 1. Create the base icon
Create a 1024x1024 PNG image named `icon.png`

### 2. Generate platform-specific icons

#### For macOS (.icns):
```bash
# Install iconutil (comes with Xcode)
mkdir icon.iconset
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
rm -rf icon.iconset
```

#### For Windows (.ico):
Use an online converter like https://convertio.co/png-ico/
Or install ImageMagick:
```bash
convert icon.png -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico
```

### 3. Create tray icons
```bash
# Resize for tray
sips -z 22 22 icon.png --out tray-icon.png
sips -z 22 22 icon.png --out tray-iconTemplate.png
# For Windows tray icon, resize to 16x16 and convert to .ico
```

## Current Icons

The current icons are simple placeholder icons with a purple gradient background and "CW" text.
Feel free to replace them with your own custom designs!

## Design Guidelines

### Application Icon
- Should be recognizable at small sizes (16x16 to 512x512)
- Use clear, simple shapes
- Consider the Claude brand colors
- Test on both light and dark backgrounds

### Tray Icon (macOS)
- Should be monochrome (template image)
- Works well with both light and dark menu bars
- 22x22 pixels with @2x version at 44x44
- Simple, recognizable silhouette

### Tray Icon (Windows)
- Can use color
- 16x16 pixels (standard Windows tray size)
- Should be clear at small size

