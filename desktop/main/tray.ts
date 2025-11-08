import { Tray, Menu, nativeImage, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { showWindow, toggleWindow, getWindow } from './window.js';

let tray: Tray | null = null;

export function createTray(): Tray {
  const iconPath = getTrayIconPath();
  
  console.log('[Tray] Loading icon from:', iconPath);
  console.log('[Tray] Icon file exists:', fs.existsSync(iconPath));
  
  const icon = nativeImage.createFromPath(iconPath);
  
  // Resize icon for better display on different platforms
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }
  
  tray = new Tray(icon);
  
  tray.setToolTip('Claude Workbench');
  
  updateTrayMenu();
  
  // Click on tray icon toggles window
  tray.on('click', () => {
    toggleWindow();
  });
  
  return tray;
}

export function updateTrayMenu(): void {
  if (!tray) return;
  
  const window = getWindow();
  const isVisible = window?.isVisible() ?? false;
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isVisible ? 'Hide Window' : 'Show Window',
      click: () => toggleWindow(),
    },
    {
      type: 'separator',
    },
    {
      label: 'Quit Claude Workbench',
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      },
    },
  ]);
  
  tray.setContextMenu(contextMenu);
}

export function getTray(): Tray | null {
  return tray;
}

function getTrayIconPath(): string {
  // Use Template image for macOS (monochrome icon that adapts to system theme)
  // Use PNG for Windows/Linux (PNG works better than ICO in Electron tray)
  let iconName: string;
  
  if (process.platform === 'darwin') {
    iconName = 'tray-iconTemplate.png';
  } else if (process.platform === 'win32') {
    iconName = 'tray-icon.png';  // Changed from .ico to .png
  } else {
    iconName = 'tray-icon.png';
  }
  
  // Try multiple possible paths for the icon
  const possiblePaths = [
    // Development path: desktop/dist/main/../assets
    path.join(__dirname, '../assets', iconName),
    // Packaged app path (when asar is disabled): app/desktop/dist/main/../assets
    path.join(process.resourcesPath, 'app', 'desktop', 'assets', iconName),
    // Alternative packaged path
    path.join(app.getAppPath(), 'desktop', 'assets', iconName),
  ];
  
  for (const possiblePath of possiblePaths) {
    console.log('[Tray] Checking path:', possiblePath);
    if (fs.existsSync(possiblePath)) {
      console.log('[Tray] Found icon at:', possiblePath);
      return possiblePath;
    }
  }
  
  // Log debug info for troubleshooting
  console.log('[Tray] Icon search failed. Debug info:');
  console.log('[Tray] __dirname:', __dirname);
  console.log('[Tray] process.resourcesPath:', process.resourcesPath);
  console.log('[Tray] app.getAppPath():', app.getAppPath());
  console.log('[Tray] app.isPackaged:', app.isPackaged);
  console.log('[Tray] Checked paths:', possiblePaths.join(', '));
  
  // Fallback to first path (will show default icon)
  console.log('[Tray] WARNING: Icon file not found! Using fallback path');
  return possiblePaths[0];
}

