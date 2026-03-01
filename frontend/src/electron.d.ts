// Type definitions for Electron API exposed via preload script

export type UpdaterStatus =
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'available'; version: string; releaseNotes?: string }
  | { type: 'not-available' }
  | { type: 'downloading'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string };

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
  getUpdaterStatus: () => Promise<UpdaterStatus>;
  onUpdaterStatus: (callback: (status: UpdaterStatus) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
