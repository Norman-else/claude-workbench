import { useEffect, useState, useCallback } from 'react';
import { ArrowDownToLine, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';
import type { UpdaterStatus } from '../electron.d';

function sanitizeErrorMessage(message: string): string {
  // 移除可能包含文件路径的部分（以 / 或盘符开头的路径片段）
  const sanitized = message.replace(/([A-Za-z]:\\[^\s,;)]+|\/[^\s,;)]+)/g, '[path]');
  // 如果消息过长，截断并提示
  if (sanitized.length > 100) {
    return sanitized.substring(0, 97) + '...';
  }
  return sanitized;
}

export function UpdateNotification() {
  const [status, setStatus] = useState<UpdaterStatus>({ type: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.electronAPI?.onUpdaterStatus) return;

    // Fetch current status on mount
    window.electronAPI.getUpdaterStatus?.()
      .then(setStatus)
      .catch((err: unknown) => console.warn('[UpdateNotification] Failed to get initial status:', err));

    // Subscribe to live updates
    const unsubscribe = window.electronAPI.onUpdaterStatus((newStatus) => {
      setStatus(newStatus);
      // Re-surface the toast when a meaningful new status arrives
      if (newStatus.type !== 'idle' && newStatus.type !== 'not-available') {
        setDismissed(false);
      }
    });

    return unsubscribe;
  }, []);

  const handleInstall = useCallback(() => {
    window.electronAPI?.installUpdate?.();
  }, []);

  if (dismissed || status.type === 'idle' || status.type === 'not-available') {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-[200] w-80 animate-slide-up">
      <div className="glass-dark border border-zinc-700 rounded-2xl p-4 shadow-2xl shadow-black/40">
        {status.type === 'checking' && (
          <div className="flex items-center space-x-3">
            <Loader2 className="w-5 h-5 text-zinc-400 animate-spin flex-shrink-0" />
            <span className="text-sm text-zinc-300">Checking for updates...</span>
          </div>
        )}

        {status.type === 'available' && (
          <div className="flex items-start space-x-3">
            <ArrowDownToLine className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">Update Available</p>
              <p className="text-xs text-zinc-400 mt-0.5">v{status.version} — Downloading...</p>
            </div>
          </div>
        )}

        {status.type === 'downloading' && (
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <ArrowDownToLine className="w-5 h-5 text-blue-400 flex-shrink-0 animate-bounce" />
              <span className="text-sm font-medium text-white">Downloading Update</span>
              <span className="ml-auto text-xs text-zinc-400">{status.percent}%</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300 ease-out rounded-full"
                style={{ width: `${status.percent}%` }}
              />
            </div>
          </div>
        )}

        {status.type === 'downloaded' && (
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Update Ready!</p>
                <p className="text-xs text-zinc-400 mt-0.5">v{status.version} downloaded. Restart to install.</p>
              </div>
              <button
                onClick={() => setDismissed(true)}
                className="text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={handleInstall}
              className="w-full py-2 px-4 rounded-xl bg-green-900/50 border border-green-700 text-green-300 text-sm font-medium hover:bg-green-800/50 transition-all"
            >
              Restart Now
            </button>
          </div>
        )}

        {status.type === 'error' && (
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">Update Error</p>
              <p className="text-xs text-zinc-400 mt-0.5">{sanitizeErrorMessage(status.message)}</p>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
