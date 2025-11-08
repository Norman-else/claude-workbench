import { Tray, Menu, nativeImage, app } from 'electron';
import * as path from 'path';
import { showWindow, toggleWindow, getWindow } from './window.js';

let tray: Tray | null = null;

export function createTray(): Tray {
  const iconPath = getTrayIconPath();
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
  // Use regular icon for Windows/Linux
  let iconName: string;
  
  if (process.platform === 'darwin') {
    iconName = 'tray-iconTemplate.png';
  } else if (process.platform === 'win32') {
    iconName = 'tray-icon.ico';
  } else {
    iconName = 'tray-icon.png';
  }
  
  return path.join(__dirname, '../assets', iconName);
}

