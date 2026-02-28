// Type definitions for Electron API exposed via preload script

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
    electronAPI?: ElectronAPI;
  }
}

export {};

