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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

