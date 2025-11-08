import { BrowserWindow, app } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;

export function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false, // Don't show until ready
    backgroundColor: '#1a1a2e',
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js'),
      webSecurity: true,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  // Load the app
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  
  console.log('[Window] Loading app...');
  console.log('[Window] Is development:', isDev);
  console.log('[Window] Is packaged:', app.isPackaged);
  console.log('[Window] __dirname:', __dirname);
  console.log('[Window] App path:', app.getAppPath());
  
  if (isDev) {
    // Development mode: load from dev server
    console.log('[Window] Loading from dev server: http://localhost:3000');
    mainWindow.loadURL('http://localhost:3000');
    // Uncomment the next line if you want to open DevTools in development
    // mainWindow.webContents.openDevTools();
  } else {
    // Production mode: load from backend server (which serves frontend)
    console.log('[Window] Loading from backend server: http://localhost:3001');
    mainWindow.loadURL('http://localhost:3001');
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // Handle window close (minimize to tray instead)
  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function getWindow(): BrowserWindow | null {
  return mainWindow;
}

export function showWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  }
}

export function hideWindow(): void {
  mainWindow?.hide();
}

export function toggleWindow(): void {
  if (mainWindow?.isVisible()) {
    hideWindow();
  } else {
    showWindow();
  }
}

function getIconPath(): string {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  return path.join(__dirname, '../assets', iconName);
}

