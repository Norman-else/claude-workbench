// afterPack hook for electron-builder
// Re-signs the macOS .app bundle with ad-hoc signatures using proper inside-out
// signing order. Each nested component (dylib, framework, helper app) is signed
// individually before the main .app bundle.
//
// Why: Electron ships with an ad-hoc code signature. When electron-builder injects
// app code, the signature breaks. With `identity: null`, electron-builder doesn't
// re-sign. The resulting .zip has broken signature metadata, causing auto-update
// errors: "Code signature at URL did not pass validation"
//
// The `codesign --deep` flag is deprecated by Apple and unreliable for Electron's
// complex nested Framework structure. Instead, we sign each component individually
// from innermost to outermost, then sign the main .app bundle last.
//
// Signing order (inside-out):
//   1. All .dylib files (dynamic libraries, including inside frameworks)
//   2. All .so files (shared objects)
//   3. Helper .app bundles inside Contents/Frameworks/
//   4. Non-Electron .framework bundles inside Contents/Frameworks/
//   5. Electron Framework.framework (signed last among frameworks)
//   6. The main .app bundle (outermost)
//
// This MUST be CommonJS (.cjs) because electron-builder loads hooks with require()
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Recursively walk a directory tree, collecting all files and directories.
 * Does not follow symbolic links to avoid signing the same binary twice.
 * @param {string} dir - Root directory to walk
 * @returns {Array<{fullPath: string, isDirectory: boolean}>}
 */
function walkDirectory(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip symbolic links — they point to already-signed originals
    if (entry.isSymbolicLink()) continue;

    results.push({ fullPath, isDirectory: entry.isDirectory() });

    if (entry.isDirectory()) {
      results.push(...walkDirectory(fullPath));
    }
  }

  return results;
}

/**
 * Ad-hoc sign a single file or bundle.
 * Uses --force to replace any existing (broken) signature.
 * Does NOT use --deep (deprecated by Apple, unreliable for Electron).
 * @param {string} targetPath - Path to the file or bundle to sign
 * @param {string} label - Human-readable category label for logging
 * @param {string} basePath - Base path for computing relative display paths
 * @returns {boolean} true if signing succeeded
 */
function adHocSign(targetPath, label, basePath) {
  const displayPath = path.relative(basePath, targetPath) || path.basename(targetPath);
  try {
    console.log(`[afterPack]   Signing ${label}: ${displayPath}`);
    execSync(`codesign --force --sign - "${targetPath}"`, { stdio: 'pipe' });
    return true;
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString().trim() : error.message;
    console.warn(`[afterPack]   ⚠️  Failed to sign ${displayPath}: ${stderr}`);
    return false;
  }
}

module.exports = async function afterPack(context) {
  // Only run on macOS builds
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  // Find the .app bundle in the output directory
  const appOutDir = context.appOutDir;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  if (!fs.existsSync(appPath)) {
    console.warn(`[afterPack] App bundle not found: ${appPath}`);
    return;
  }

  console.log(`[afterPack] Re-signing ${appName}.app with ad-hoc signature (inside-out)...`);
  console.log(`[afterPack] App path: ${appPath}`);

  const contentsDir = path.join(appPath, 'Contents');
  const frameworksDir = path.join(contentsDir, 'Frameworks');

  // Walk the entire Contents/ directory once for efficient lookups
  const allEntries = walkDirectory(contentsDir);

  let signed = 0;
  let failed = 0;

  // --- Step 1/6: Sign all .dylib files (deepest binaries first) ---
  console.log('[afterPack] Step 1/6: Signing dynamic libraries (.dylib)...');
  const dylibs = allEntries
    .filter((e) => !e.isDirectory && path.extname(e.fullPath) === '.dylib')
    .map((e) => e.fullPath);

  for (const filePath of dylibs) {
    if (adHocSign(filePath, 'dylib', appPath)) signed++;
    else failed++;
  }
  console.log(`[afterPack]   Processed ${dylibs.length} .dylib file(s)`);

  // --- Step 2/6: Sign all .so files ---
  console.log('[afterPack] Step 2/6: Signing shared objects (.so)...');
  const soFiles = allEntries
    .filter((e) => !e.isDirectory && path.extname(e.fullPath) === '.so')
    .map((e) => e.fullPath);

  for (const filePath of soFiles) {
    if (adHocSign(filePath, 'shared object', appPath)) signed++;
    else failed++;
  }
  console.log(`[afterPack]   Processed ${soFiles.length} .so file(s)`);

  // --- Step 3/6: Sign helper .app bundles inside Frameworks/ ---
  console.log('[afterPack] Step 3/6: Signing helper apps...');
  if (fs.existsSync(frameworksDir)) {
    const fwDirEntries = fs.readdirSync(frameworksDir, { withFileTypes: true });
    const helperApps = fwDirEntries
      .filter((e) => !e.isSymbolicLink() && e.isDirectory() && e.name.endsWith('.app'))
      .map((e) => path.join(frameworksDir, e.name));

    for (const helperPath of helperApps) {
      if (adHocSign(helperPath, 'helper app', appPath)) signed++;
      else failed++;
    }
    console.log(`[afterPack]   Processed ${helperApps.length} helper app(s)`);
  } else {
    console.log('[afterPack]   Frameworks directory not found, skipping');
  }

  // --- Step 4/6: Sign non-Electron .framework bundles inside Frameworks/ ---
  console.log('[afterPack] Step 4/6: Signing framework bundles...');
  if (fs.existsSync(frameworksDir)) {
    const fwDirEntries = fs.readdirSync(frameworksDir, { withFileTypes: true });
    const frameworks = fwDirEntries
      .filter(
        (e) =>
          !e.isSymbolicLink() &&
          e.isDirectory() &&
          e.name.endsWith('.framework') &&
          e.name !== 'Electron Framework.framework',
      )
      .map((e) => path.join(frameworksDir, e.name));

    for (const fwPath of frameworks) {
      if (adHocSign(fwPath, 'framework', appPath)) signed++;
      else failed++;
    }
    console.log(`[afterPack]   Processed ${frameworks.length} non-Electron framework(s)`);
  }

  // --- Step 5/6: Sign Electron Framework separately (after all other frameworks) ---
  console.log('[afterPack] Step 5/6: Signing Electron Framework...');
  const electronFwPath = path.join(frameworksDir, 'Electron Framework.framework');
  if (fs.existsSync(electronFwPath)) {
    if (adHocSign(electronFwPath, 'Electron Framework', appPath)) signed++;
    else failed++;
  } else {
    console.log('[afterPack]   Electron Framework.framework not found');
  }

  // --- Step 6/6: Sign the main .app bundle with a stable designated requirement ---
  // By default, ad-hoc signing creates a cdhash-based designated requirement that
  // changes every build. Squirrel.Mac validates updates against the CURRENT app's
  // designated requirement, so cdhash-based requirements cause ALL updates to fail.
  // Fix: set an explicit identifier-based requirement that's stable across versions.
  console.log('[afterPack] Step 6/6: Signing main app bundle (with stable designated requirement)...');
  const appId = context.packager.appInfo.id || 'com.claude.workbench';
  const displayPath = path.basename(appPath);
  try {
    console.log(`[afterPack]   Signing main app bundle: ${displayPath}`);
    console.log(`[afterPack]   Designated requirement: identifier "${appId}"`);
    execSync(
      `codesign --force --sign - --requirements '=designated => identifier "${appId}"' "${appPath}"`,
      { stdio: 'pipe' },
    );
    signed++;
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString().trim() : error.message;
    console.warn(`[afterPack]   ⚠️  Failed to sign ${displayPath}: ${stderr}`);
    failed++;
  }

  console.log(`[afterPack] Signing complete: ${signed} succeeded, ${failed} failed`);

  // Verify the final signature using --deep --strict
  // Note: --deep is fine for VERIFICATION (it's only deprecated for signing)
  console.log('[afterPack] Verifying final signature...');
  try {
    execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'pipe' });
    console.log('[afterPack] ✅ Signature verification passed');
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString().trim() : error.message;
    console.warn(`[afterPack] ⚠️  Signature verification failed: ${stderr}`);
    // Don't throw - allow build to continue even if verification fails
    // The app will work, just auto-update may have issues on macOS
  }
};
