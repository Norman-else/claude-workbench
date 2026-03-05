import { ipcMain, BrowserWindow, app } from 'electron';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export type UpdateStatus =
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'available'; version: string; releaseNotes?: string }
  | { type: 'not-available' }
  | { type: 'downloading'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string };

// electron-updater event info shapes
interface UpdateInfo {
  version: string;
  releaseNotes?: string | null;
}

interface DownloadProgressInfo {
  percent: number;
}

let currentStatus: UpdateStatus = { type: 'idle' };
let downloadedUpdateFile: string | null = null;

function sendStatus(status: UpdateStatus): void {
  currentStatus = status;
  const windows = BrowserWindow.getAllWindows();
  windows.forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('updater-status', status);
    }
  });
}

export function setupAutoUpdater(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { autoUpdater } = require('electron-updater');

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  // Skip macOS code signature verification for unsigned builds.
  // This fixes the auto-update error on macOS:
  //   "Code signature at URL did not pass validation:
  //    代码不含资源，但签名指示这些资源必须存在"
  if (process.platform === 'darwin') {
    autoUpdater.verifyUpdateCodeSignature = false;
  }

  autoUpdater.on('checking-for-update', () => {
    sendStatus({ type: 'checking' });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    sendStatus({
      type: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendStatus({ type: 'not-available' });
  });

  autoUpdater.on('download-progress', (progressObj: DownloadProgressInfo) => {
    sendStatus({ type: 'downloading', percent: Math.round(progressObj.percent) });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo & { downloadedFile?: string }) => {
    downloadedUpdateFile = info.downloadedFile || null;
    sendStatus({ type: 'downloaded', version: info.version });
  });

  autoUpdater.on('error', (err: Error) => {
    sendStatus({ type: 'error', message: err.message });
  });

  // IPC: manual check trigger
  ipcMain.removeHandler('check-for-updates');
  ipcMain.handle('check-for-updates', async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      sendStatus({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  });

  // IPC: quit and install downloaded update
  ipcMain.removeHandler('install-update');
  ipcMain.handle('install-update', () => {
    (app as any).isQuitting = true;

    if (process.platform === 'darwin') {
      // On macOS, Squirrel.Mac doesn't work reliably with unsigned builds.
      // Bypass it entirely: find the downloaded zip, extract it via a
      // detached shell script, replace the current .app bundle, and relaunch.
      applyMacUpdateManually(autoUpdater);
    } else {
      // Windows/Linux: standard quitAndInstall works fine
      autoUpdater.quitAndInstall(false, true);
    }
  });

  // IPC: get current status snapshot
  ipcMain.removeHandler('get-updater-status');
  ipcMain.handle('get-updater-status', () => {
    return currentStatus;
  });
}

function applyMacUpdateManually(autoUpdater: any): void {
  // 1. Resolve the app bundle path (e.g. /Applications/Claude Workbench.app)
  const exePath = app.getPath('exe');
  const appBundlePath = exePath.replace(/\/Contents\/MacOS\/.+$/, '');

  // 2. Find the downloaded update zip
  let zipPath = downloadedUpdateFile;

  if (!zipPath || !fs.existsSync(zipPath)) {
    // Fallback: search the updater cache directories
    const baseCachePath = path.join(app.getPath('home'), 'Library', 'Caches');
    const appName = app.getName();
    const possibleDirs = [
      path.join(baseCachePath, `${appName}-updater`, 'pending'),
      path.join(baseCachePath, appName, 'pending'),
    ];
    for (const dir of possibleDirs) {
      const candidate = path.join(dir, 'update.zip');
      if (fs.existsSync(candidate)) {
        zipPath = candidate;
        break;
      }
    }
  }

  if (!zipPath || !fs.existsSync(zipPath)) {
    console.error('[Updater] Cannot find downloaded update file, falling back to quitAndInstall');
    autoUpdater.quitAndInstall(false, true);
    setTimeout(() => app.quit(), 1500);
    return;
  }

  console.log(`[Updater] Applying macOS update manually from: ${zipPath}`);
  console.log(`[Updater] Current app bundle: ${appBundlePath}`);

  // 3. Create a detached shell script to replace the app and relaunch
  const tempDir = path.join(app.getPath('temp'), 'claude-wb-update');
  const scriptPath = path.join(app.getPath('temp'), 'claude-wb-update.sh');

  // Use the current PID so the script waits for THIS process to exit
  const pid = process.pid;

  const script = `#!/bin/bash
# Wait for the Electron app to exit
while kill -0 ${pid} 2>/dev/null; do sleep 0.5; done

# Extract the update
rm -rf "${tempDir}"
mkdir -p "${tempDir}"
unzip -q -o "${zipPath}" -d "${tempDir}"

# Find the .app bundle in the extracted content
APP_NAME=$(find "${tempDir}" -maxdepth 1 -name "*.app" -type d | head -1)
if [ -z "$APP_NAME" ]; then
  echo "[Updater] No .app found in update zip"
  rm -rf "${tempDir}"
  rm -f "${scriptPath}"
  exit 1
fi

# Replace the current app bundle
rm -rf "${appBundlePath}"
mv "$APP_NAME" "${appBundlePath}"

# Relaunch
open "${appBundlePath}"

# Clean up
rm -rf "${tempDir}"
rm -f "${scriptPath}"
`;

  fs.writeFileSync(scriptPath, script, { mode: 0o755 });

  // Spawn the script detached so it survives the app exit
  const child = spawn('/bin/bash', [scriptPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // Exit immediately — the script will handle the rest
  app.exit(0);
}

export function checkForUpdatesOnStartup(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { autoUpdater } = require('electron-updater');

  // Delay 5 seconds to avoid slowing app startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      console.error('[Updater] Auto check failed:', err);
    });
  }, 5000);
}

export function checkForUpdatesManually(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { autoUpdater } = require('electron-updater');

  sendStatus({ type: 'checking' });

  autoUpdater.checkForUpdates().catch((err: Error) => {
    console.error('[Updater] Manual check failed:', err);
    sendStatus({ type: 'error', message: err.message });
  });
}
