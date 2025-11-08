import { app } from 'electron';

export function isAutoLaunchEnabled(): boolean {
  const loginItemSettings = app.getLoginItemSettings();
  return loginItemSettings.openAtLogin;
}

export function setAutoLaunch(enable: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: false,
  });
}

export function toggleAutoLaunch(): boolean {
  const currentState = isAutoLaunchEnabled();
  setAutoLaunch(!currentState);
  return !currentState;
}

