import * as path from 'path';
import { app } from 'electron';

let backendServer: any = null;

export async function startBackend(): Promise<void> {
  console.log('[Backend] Starting backend server...');
  console.log('[Backend] App path:', app.getAppPath());
  console.log('[Backend] __dirname:', __dirname);
  
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  console.log('[Backend] Is development mode:', isDev);
  console.log('[Backend] Is packaged:', app.isPackaged);
  
  if (isDev) {
    // In development, the backend is already running via npm run dev
    console.log('[Backend] Development mode: Backend should already be running on port 3001');
    return;
  }
  
  // Production mode: dynamically import and start the backend server
  try {
    // In production, the backend is bundled in app.asar
    // We need to use dynamic import to load the ES module
    const backendPath = path.join(app.getAppPath(), 'backend/src/server.js');
    console.log('[Backend] Loading backend from:', backendPath);
    
    // Dynamic import to load ES module from asar
    const backendModule = await import(backendPath);
    backendServer = backendModule.default || backendModule;
    
    console.log('[Backend] Backend server started successfully on port 3001');
  } catch (error) {
    console.error('[Backend] Failed to start backend:', error);
    console.error('[Backend] Error details:', error instanceof Error ? error.stack : String(error));
    throw error;
  }
}

export function stopBackend(): void {
  if (backendServer && typeof backendServer.close === 'function') {
    backendServer.close();
    backendServer = null;
    console.log('[Backend] Backend server stopped');
  }
}

