import { useEffect, useState, useRef, useCallback } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  ArrowDownToLine,
  AlertCircle,
  ExternalLink,
  X,
  Loader2,
} from 'lucide-react';
import type { UpdaterStatus } from '../electron.d';

function sanitizeErrorMessage(message: string): string {
  const sanitized = message.replace(/([A-Za-z]:\\[^\s,;)]+|\/[^\s,;)]+)/g, '[path]');
  if (sanitized.length > 120) {
    return sanitized.substring(0, 117) + '...';
  }
  return sanitized;
}

interface VersionBadgeProps {
  appVersion: string;
  isElectron: boolean;
}

export function VersionBadge({ appVersion, isElectron }: VersionBadgeProps) {
  const [status, setStatus] = useState<UpdaterStatus>({ type: 'idle' });
  const [isOpen, setIsOpen] = useState(false);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // IPC wiring — mirrors old UpdateNotification exactly

  useEffect(() => {
    if (!window.electronAPI?.onUpdaterStatus) return;

    window.electronAPI.getUpdaterStatus?.().then(setStatus);

    const unsubscribe = window.electronAPI.onUpdaterStatus((newStatus) => {
      setStatus(newStatus);
    });

    return unsubscribe;
  }, []);

  // Click-outside-to-close
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popupRef.current &&
        !popupRef.current.contains(target) &&
        badgeRef.current &&
        !badgeRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleCheck = useCallback(() => {
    window.electronAPI?.checkForUpdates?.();
  }, []);

  const handleInstall = useCallback(() => {
    window.electronAPI?.installUpdate?.();
  }, []);

  // Don't render anything outside Electron or without version
  if (!isElectron || !appVersion) return null;

  // Determine badge dot state
  const dotClass = (() => {
    switch (status.type) {
      case 'available':
      case 'downloading':
      case 'checking':
        return 'version-badge-dot version-badge-dot--active';
      case 'downloaded':
        return 'version-badge-dot version-badge-dot--ready';
      case 'error':
        return 'version-badge-dot version-badge-dot--error';
      default:
        return '';
    }
  })();

  // Display version for "new version" states
  const newVersion =
    status.type === 'available'
      ? status.version
      : status.type === 'downloaded'
        ? status.version
        : null;

  return (
    <div className="relative mt-2.5">
      {/* Badge pill */}
      <button
        ref={badgeRef}
        onClick={() => setIsOpen((prev) => !prev)}
        className="version-badge group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer select-none"
        title="版本管理"
      >
        <span className="version-badge-text">v{appVersion}</span>
        {dotClass && <span className={dotClass} />}
      </button>

      {/* Floating popup */}
      {isOpen && (
        <div
          ref={popupRef}
          id="version-popup"
          className="absolute top-full left-0 mt-2 w-72 z-[200] version-popup"
        >
          {/* ─── Idle / Not-Available (up to date) ─── */}
          {(status.type === 'idle' || status.type === 'not-available') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide uppercase version-popup-label">
                  当前版本
                </span>
                <button
                  onClick={handleCheck}
                  className="version-popup-icon-btn p-1 rounded-md transition-colors"
                  title="检查更新"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <span className="text-lg font-bold version-popup-version">v{appVersion}</span>
              </div>

              <p className="text-xs version-popup-secondary">已是最新版本</p>

              <div className="pt-2 border-t version-popup-divider">
                <a
                  href="https://github.com/Norman-else/claude-workbench/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs version-popup-link transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  查看发布
                </a>
              </div>
            </div>
          )}

          {/* ─── Checking ─── */}
          {status.type === 'checking' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin version-popup-secondary" />
                <span className="text-xs font-semibold tracking-wide uppercase version-popup-label">
                  检查中
                </span>
              </div>
              <p className="text-sm version-popup-secondary">正在检查更新...</p>
            </div>
          )}

          {/* ─── Available / Downloading ─── */}
          {(status.type === 'available' || status.type === 'downloading') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide uppercase version-popup-label">
                  发现新版本
                </span>
                <button
                  onClick={() => setIsOpen(false)}
                  className="version-popup-icon-btn p-1 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2.5">
                <ArrowDownToLine className="w-5 h-5 text-blue-400 flex-shrink-0" />
                <span className="text-lg font-bold version-popup-version">
                  v{newVersion}
                </span>
              </div>

              {status.type === 'downloading' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs version-popup-secondary">
                    <span>正在下载...</span>
                    <span>{Math.round(status.percent)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden version-popup-progress-track">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${status.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {status.type === 'available' && (
                <p className="text-xs version-popup-secondary">正在准备下载...</p>
              )}
            </div>
          )}

          {/* ─── Downloaded (ready to install) ─── */}
          {status.type === 'downloaded' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide uppercase version-popup-label">
                  更新已就绪
                </span>
                <button
                  onClick={() => setIsOpen(false)}
                  className="version-popup-icon-btn p-1 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <span className="text-lg font-bold version-popup-version">
                  v{newVersion}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleInstall}
                  className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all version-popup-primary-btn"
                >
                  立即重启
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="py-2 px-3 rounded-lg text-sm transition-all version-popup-ghost-btn"
                >
                  稍后
                </button>
              </div>
            </div>
          )}

          {/* ─── Error ─── */}
          {status.type === 'error' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="text-xs font-semibold tracking-wide uppercase version-popup-label">
                    更新出错
                  </span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="version-popup-icon-btn p-1 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-xs version-popup-error-text leading-relaxed">
                {sanitizeErrorMessage(status.message)}
              </p>

              <button
                onClick={handleCheck}
                className="w-full py-2 px-3 rounded-lg text-sm font-medium transition-all version-popup-retry-btn"
              >
                重试
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
