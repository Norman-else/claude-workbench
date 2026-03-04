// afterPack hook for electron-builder
// Re-signs the macOS .app bundle with an ad-hoc signature after packaging.
//
// Why: Electron ships with an ad-hoc code signature. When electron-builder injects
// app code, the signature breaks. With `identity: null`, electron-builder doesn't
// re-sign. The resulting .zip has broken signature metadata, causing auto-update
// errors: "Code signature at URL did not pass validation"
//
// This MUST be CommonJS (.cjs) because electron-builder loads hooks with require()
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

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

  console.log(`[afterPack] Re-signing ${appName}.app with ad-hoc signature...`);

  try {
    // --force: Replace any existing (broken) signature
    // --deep: Sign all nested code (frameworks, helpers, dylibs)
    // -s -: Use ad-hoc identity (no Apple Developer certificate needed)
    execSync(`codesign --force --deep -s - "${appPath}"`, {
      stdio: 'inherit',
    });
    console.log(`[afterPack] ✅ Successfully re-signed ${appName}.app`);
  } catch (error) {
    console.error(`[afterPack] ❌ Failed to re-sign: ${error.message}`);
    // Don't throw - allow build to continue even if signing fails
    // The app will work, just auto-update may have issues on macOS
  }
};
