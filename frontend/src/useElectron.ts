import { useState, useEffect } from 'react';

interface ElectronHook {
  isElectron: boolean;
  platform: string | null;
  autoLaunchEnabled: boolean;
  setAutoLaunch: (enabled: boolean) => Promise<void>;
  showNotification: (title: string, body: string) => Promise<void>;
}

export function useElectron(): ElectronHook {
  const [isElectron, setIsElectron] = useState(false);
  const [platform, setPlatform] = useState<string | null>(null);
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState(false);

  useEffect(() => {
    // Check if running in Electron
    const checkElectron = async () => {
      if (window.electronAPI) {
        try {
          const result = await window.electronAPI.isElectron();
          setIsElectron(result);
          
          if (result) {
            // Get platform
            const platformResult = await window.electronAPI.getPlatform();
            setPlatform(platformResult);
            
            // Get auto-launch status
            const autoLaunch = await window.electronAPI.getAutoLaunch();
            setAutoLaunchEnabled(autoLaunch);
          }
        } catch (error) {
          console.error('Error checking Electron status:', error);
        }
      }
    };

    checkElectron();
  }, []);

  const setAutoLaunch = async (enabled: boolean) => {
    if (window.electronAPI) {
      try {
        const result = await window.electronAPI.setAutoLaunch(enabled);
        setAutoLaunchEnabled(result);
      } catch (error) {
        console.error('Error setting auto-launch:', error);
        throw error;
      }
    }
  };

  const showNotification = async (title: string, body: string) => {
    if (window.electronAPI) {
      try {
        await window.electronAPI.showNotification({ title, body });
      } catch (error) {
        console.error('Error showing notification:', error);
      }
    }
  };

  return {
    isElectron,
    platform,
    autoLaunchEnabled,
    setAutoLaunch,
    showNotification,
  };
}

