import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform detection
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  isElectron: () => ipcRenderer.invoke('is-electron'),
  
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  
  // Auto-launch
  toggleAutoLaunch: () => ipcRenderer.invoke('toggle-auto-launch'),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunch: (enable: boolean) => ipcRenderer.invoke('set-auto-launch', enable),
  
  // Notifications
  showNotification: (options: { title: string; body: string }) => 
    ipcRenderer.invoke('show-notification', options),

  // App version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Auto-update
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getUpdaterStatus: () => ipcRenderer.invoke('get-updater-status'),
  onUpdaterStatus: (callback: (status: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: any) => callback(status);
    ipcRenderer.on('updater-status', handler);
    return () => ipcRenderer.removeListener('updater-status', handler);
  },
});

// Type definitions for TypeScript
export interface ElectronAPI {
  getPlatform: () => Promise<string>;
  isElectron: () => Promise<boolean>;
  minimizeWindow: () => Promise<void>;
  toggleAutoLaunch: () => Promise<boolean>;
  getAutoLaunch: () => Promise<boolean>;
  setAutoLaunch: (enable: boolean) => Promise<boolean>;
  showNotification: (options: { title: string; body: string }) => Promise<boolean>;
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  getUpdaterStatus: () => Promise<any>;
  onUpdaterStatus: (callback: (status: any) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}


