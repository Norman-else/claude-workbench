import { ipcMain, BrowserWindow, app } from 'electron';

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

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
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
    // Enable auto-install on quit for macOS native updater
    autoUpdater.autoInstallOnAppQuit = true;

    // Mark app as quitting so the window close handler (window.ts)
    // doesn't intercept the close event and hide the window instead
    (app as any).isQuitting = true;

    // Defer quitAndInstall to next tick so the IPC response reaches
    // the renderer before the app starts quitting
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true);
    });

    // Fallback: on macOS with unsigned builds, quitAndInstall may not
    // terminate the process. Force quit after a short delay to ensure
    // the app actually exits. autoInstallOnAppQuit=true guarantees the
    // update is applied during the quit lifecycle.
    setTimeout(() => {
      app.quit();
    }, 1500);
  });

  // IPC: get current status snapshot
  ipcMain.removeHandler('get-updater-status');
  ipcMain.handle('get-updater-status', () => {
    return currentStatus;
  });
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
