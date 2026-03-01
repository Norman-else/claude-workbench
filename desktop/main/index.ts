import { app, BrowserWindow, ipcMain, Notification } from 'electron';
import { createWindow, showWindow } from './window.js';
import { createTray, updateTrayMenu } from './tray.js';
import { isAutoLaunchEnabled, setAutoLaunch, toggleAutoLaunch } from './autoLaunch.js';
import { startBackend, stopBackend } from './backend.js';
import { setupAutoUpdater, checkForUpdatesOnStartup } from './updater.js';
import { createAppMenu } from './menu.js';

// Add isQuitting flag to app
(app as any).isQuitting = false;

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window
    showWindow();
  });
}

// App lifecycle
app.on('ready', async () => {
  console.log('[Main] App ready event fired');
  console.log('[Main] App version:', app.getVersion());
  console.log('[Main] Electron version:', process.versions.electron);
  console.log('[Main] Node version:', process.versions.node);
  console.log('[Main] Is packaged:', app.isPackaged);
  
  try {
    console.log('[Main] Starting backend server...');
    await startBackend();
    console.log('[Main] Backend started successfully');
    
    // Wait a bit for the server to be fully ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('[Main] Creating main window...');
    createAppMenu();
    console.log('[Main] App menu created');
    createWindow();
    console.log('[Main] Main window created');
    
    console.log('[Main] Creating system tray...');
    createTray();
    console.log('[Main] System tray created');

    // Setup auto updater (packaged builds only to avoid dev-mode interference)
    if (app.isPackaged) {
      setupAutoUpdater();
      checkForUpdatesOnStartup();
      console.log('[Main] Auto updater setup complete');
    }

    console.log('[Main] Claude Workbench desktop app started successfully');
  } catch (error) {
    console.error('[Main] Failed to start app:', error);
    console.error('[Main] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // Show error dialog before quitting
    const { dialog } = require('electron');
    dialog.showErrorBox(
      'Startup Error',
      `Failed to start Claude Workbench:\n\n${error instanceof Error ? error.message : String(error)}`
    );
    
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    showWindow();
  }
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
});

app.on('will-quit', () => {
  stopBackend();
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('get-platform', () => {
  return process.platform;
});

ipcMain.handle('is-electron', () => {
  return true;
});

ipcMain.handle('minimize-window', () => {
  const window = BrowserWindow.getFocusedWindow();
  window?.minimize();
});

ipcMain.handle('toggle-auto-launch', () => {
  const newState = toggleAutoLaunch();
  return newState;
});

ipcMain.handle('get-auto-launch', () => {
  return isAutoLaunchEnabled();
});

ipcMain.handle('set-auto-launch', (_event, enable: boolean) => {
  setAutoLaunch(enable);
  return enable;
});

ipcMain.handle('show-notification', (_event, options: { title: string; body: string }) => {
  const notification = new Notification({
    title: options.title,
    body: options.body,
  });
  
  notification.show();
  
  notification.on('click', () => {
    showWindow();
  });
  
  return true;
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Update tray menu when window visibility changes
ipcMain.on('window-visibility-changed', () => {
  updateTrayMenu();
});

