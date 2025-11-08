#!/bin/bash

# Create PNG icons from SVG
# This script tries different methods to convert SVG to PNG

echo "Creating PNG icons from SVG..."

# Method 1: Try with rsvg-convert (if available via Homebrew)
if command -v rsvg-convert &> /dev/null; then
    echo "Using rsvg-convert..."
    rsvg-convert -w 1024 -h 1024 icon.svg -o icon.png
    rsvg-convert -w 22 -h 22 tray-icon.svg -o tray-icon.png
    rsvg-convert -w 22 -h 22 tray-iconTemplate.svg -o tray-iconTemplate.png
    echo "✅ PNG icons created!"
    exit 0
fi

# Method 2: Try with convert (ImageMagick)
if command -v convert &> /dev/null; then
    echo "Using ImageMagick convert..."
    convert -background none icon.svg -resize 1024x1024 icon.png
    convert -background none tray-icon.svg -resize 22x22 tray-icon.png
    convert -background none tray-iconTemplate.svg -resize 22x22 tray-iconTemplate.png
    echo "✅ PNG icons created!"
    exit 0
fi

# Method 3: Use Node.js canvas (if sharp is installed)
if command -v node &> /dev/null; then
    echo "Attempting to use Node.js..."
    node -e "console.log('Note: Manual SVG to PNG conversion required')"
fi

echo ""
echo "⚠️  No SVG converter found. Please convert manually:"
echo "1. Open icon.svg in your browser"
echo "2. Take a screenshot or use browser dev tools to save as PNG"
echo "3. Or use an online converter: https://cloudconvert.com/svg-to-png"
echo ""
echo "Required files:"
echo "  - icon.png (1024x1024)"
echo "  - tray-icon.png (22x22)"
echo "  - tray-iconTemplate.png (22x22)"

