#!/usr/bin/env node

/**
 * Build script for Claude Workbench Desktop App
 * 
 * This script:
 * 1. Compiles TypeScript desktop code
 * 2. Builds the frontend React app
 * 3. Prepares backend files
 * 4. Runs electron-builder to create installers
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '../..');

function run(command, cwd = rootDir) {
  console.log(`\n🔨 Running: ${command}`);
  try {
    execSync(command, { cwd, stdio: 'inherit' });
  } catch (error) {
    console.error(`❌ Failed to run: ${command}`);
    process.exit(1);
  }
}

console.log('🚀 Building Claude Workbench Desktop App...\n');

// Step 1: Clean previous builds
console.log('📦 Step 1: Cleaning previous builds');
if (fs.existsSync(path.join(rootDir, 'desktop/dist'))) {
  fs.rmSync(path.join(rootDir, 'desktop/dist'), { recursive: true, force: true });
}
if (fs.existsSync(path.join(rootDir, 'dist-electron'))) {
  fs.rmSync(path.join(rootDir, 'dist-electron'), { recursive: true, force: true });
}

// Step 2: Compile TypeScript for desktop
console.log('\n📦 Step 2: Compiling Desktop TypeScript');
run('cd desktop && npx tsc');

// Step 3: Build frontend
console.log('\n📦 Step 3: Building Frontend');
run('cd frontend && npm run build');

// Step 4: Ensure backend is ready (no build needed for plain JS)
console.log('\n📦 Step 4: Backend files ready (no compilation needed)');

// Step 5: Run electron-builder
console.log('\n📦 Step 5: Running electron-builder');
const platform = process.platform;
let builderCommand = 'electron-builder';

if (process.argv.includes('--mac')) {
  builderCommand += ' --mac';
} else if (process.argv.includes('--win')) {
  builderCommand += ' --win';
} else if (process.argv.includes('--linux')) {
  builderCommand += ' --linux';
} else {
  // Build for current platform
  if (platform === 'darwin') {
    builderCommand += ' --mac';
  } else if (platform === 'win32') {
    builderCommand += ' --win';
  } else {
    builderCommand += ' --linux';
  }
}

run(builderCommand);

console.log('\n✅ Build complete!');
console.log(`📦 Installers are in: ${path.join(rootDir, 'dist-electron')}`);

