#!/bin/bash

# Desktop App Setup Verification Script
# Run this to check if everything is properly configured

echo "🔍 Claude Workbench Desktop Setup Verification"
echo "=============================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    check_pass "Node.js installed: $NODE_VERSION"
else
    check_fail "Node.js not found"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    check_pass "npm installed: $NPM_VERSION"
else
    check_fail "npm not found"
    exit 1
fi

echo ""
echo "📦 Checking Dependencies..."

# Check if node_modules exists
if [ -d "node_modules" ]; then
    check_pass "Root dependencies installed"
else
    check_fail "Root dependencies missing - run: npm install"
fi

if [ -d "frontend/node_modules" ]; then
    check_pass "Frontend dependencies installed"
else
    check_fail "Frontend dependencies missing - run: cd frontend && npm install"
fi

if [ -d "backend/node_modules" ]; then
    check_pass "Backend dependencies installed"
else
    check_fail "Backend dependencies missing - run: cd backend && npm install"
fi

echo ""
echo "📁 Checking Desktop Files..."

# Check desktop structure
if [ -f "desktop/main/index.ts" ]; then
    check_pass "Main process entry point exists"
else
    check_fail "Main process entry point missing"
fi

if [ -f "desktop/preload/index.ts" ]; then
    check_pass "Preload script exists"
else
    check_fail "Preload script missing"
fi

if [ -f "desktop/tsconfig.json" ]; then
    check_pass "TypeScript config exists"
else
    check_fail "TypeScript config missing"
fi

if [ -f "desktop/build/electron-builder.yml" ]; then
    check_pass "electron-builder config exists"
else
    check_fail "electron-builder config missing"
fi

echo ""
echo "🔧 Checking Build Scripts..."

# Check package.json scripts
if grep -q "dev:desktop" package.json; then
    check_pass "dev:desktop script configured"
else
    check_fail "dev:desktop script missing in package.json"
fi

if grep -q "build:desktop" package.json; then
    check_pass "build:desktop script configured"
else
    check_fail "build:desktop script missing in package.json"
fi

echo ""
echo "🎨 Checking Icon Assets..."

if [ -f "desktop/assets/icon.svg" ]; then
    check_pass "Icon SVG exists"
else
    check_warn "Icon SVG missing - generate with: cd desktop/assets && node generate-icons.js"
fi

if [ -f "desktop/assets/icon.png" ]; then
    check_pass "Icon PNG exists (ready for building)"
else
    check_warn "Icon PNG missing - electron-builder may fail without it"
    echo "   Convert icon.svg to icon.png (1024x1024) for building"
fi

echo ""
echo "🧪 Testing TypeScript Compilation..."

cd desktop
if npx tsc --noEmit &> /dev/null; then
    check_pass "TypeScript compiles without errors"
else
    check_fail "TypeScript compilation has errors - run: cd desktop && npx tsc"
fi
cd ..

echo ""
echo "📚 Checking Documentation..."

if [ -f "DESKTOP.md" ]; then
    check_pass "Desktop documentation exists"
else
    check_fail "DESKTOP.md missing"
fi

if [ -f "DESKTOP_QUICKSTART.md" ]; then
    check_pass "Quick start guide exists"
else
    check_warn "DESKTOP_QUICKSTART.md missing"
fi

echo ""
echo "=============================================="
echo ""
echo "🎯 Next Steps:"
echo ""
echo "1. Start development mode:"
echo "   npm run dev:desktop"
echo ""
echo "2. Or compile and test:"
echo "   npm run compile:desktop"
echo "   npm run dev:desktop"
echo ""
echo "3. Build installers:"
echo "   npm run build:desktop"
echo ""
echo "4. Build for specific platform:"
echo "   npm run build:desktop:mac"
echo "   npm run build:desktop:win"
echo "   npm run build:desktop:linux"
echo ""
echo "📖 See DESKTOP.md for full documentation"
echo ""

