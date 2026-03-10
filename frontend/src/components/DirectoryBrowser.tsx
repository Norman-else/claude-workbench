import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FolderOpen,
  FolderGit2,
  Home,
  Monitor,
  FileText,
  Download,
  ArrowLeft,
  HardDrive,
  ChevronRight,
  Loader2,
  AlertCircle,
  Check,
  FolderRoot,
} from 'lucide-react';
import { listFiles, getDefaultPaths } from '../api';
import type { FileEntry, DefaultPaths } from '../api';

interface DirectoryBrowserProps {
  onSelect: (path: string) => void;
  onClose: () => void;
}

const QUICK_PATH_ICONS: Record<string, React.ReactNode> = {
  home: <Home className="w-3.5 h-3.5" />,
  desktop: <Monitor className="w-3.5 h-3.5" />,
  documents: <FileText className="w-3.5 h-3.5" />,
  downloads: <Download className="w-3.5 h-3.5" />,
  root: <FolderRoot className="w-3.5 h-3.5" />,
};

export default function DirectoryBrowser({ onSelect, onClose }: DirectoryBrowserProps) {
  const [defaults, setDefaults] = useState<DefaultPaths | null>(null);
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Load defaults on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const paths = await getDefaultPaths();
        if (cancelled) return;
        setDefaults(paths);
        setCurrentPath(paths.homeDir);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load default paths');
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load directory contents when path changes
  const loadDirectory = useCallback(async (dir: string) => {
    if (!dir) return;
    setLoading(true);
    setError('');
    try {
      const result = await listFiles(dir);
      setEntries(result.files);
      setCurrentPath(result.directory);
      // Scroll to top on navigation
      if (listRef.current) listRef.current.scrollTop = 0;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot read directory');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentPath) loadDirectory(currentPath);
  }, [currentPath, loadDirectory]);

  // Derive breadcrumb segments
  const isWindows = defaults?.platform === 'windows';

  const breadcrumbs = (() => {
    if (!currentPath) return [];
    if (isWindows) {
      // e.g. C:\Users\foo -> ["C:", "Users", "foo"]
      const parts = currentPath.split('\\').filter(Boolean);
      const crumbs: { label: string; path: string }[] = [];
      let accumulated = '';
      for (const part of parts) {
        accumulated = accumulated ? `${accumulated}\\${part}` : `${part}\\`;
        crumbs.push({ label: part, path: accumulated });
      }
      return crumbs;
    } else {
      // /Users/foo -> ["/", "Users", "foo"]
      const parts = currentPath.split('/').filter(Boolean);
      const crumbs: { label: string; path: string }[] = [{ label: '/', path: '/' }];
      let accumulated = '';
      for (const part of parts) {
        accumulated = `${accumulated}/${part}`;
        crumbs.push({ label: part, path: accumulated });
      }
      return crumbs;
    }
  })();

  // Parent directory
  const getParent = () => {
    if (!currentPath) return null;
    if (isWindows) {
      const lastSep = currentPath.lastIndexOf('\\');
      if (lastSep <= 2) return null; // at drive root like C:\
      return currentPath.slice(0, lastSep);
    } else {
      if (currentPath === '/') return null;
      const lastSep = currentPath.lastIndexOf('/');
      return lastSep === 0 ? '/' : currentPath.slice(0, lastSep);
    }
  };


  const directories = entries.filter((e) => e.isDirectory).sort((a, b) => a.name.localeCompare(b.name));
  const currentHasGit = entries.some((e) => e.name === '.git');

  const parentPath = getParent();

  return (
    <div className="directory-browser mt-3 glass border border-zinc-800 rounded-xl overflow-hidden animate-slide-up">
      {/* Quick access bar */}
      {defaults && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800">
          {Object.entries(defaults.quickPaths).map(([key, path]) => (
            <button
              key={key}
              onClick={() => setCurrentPath(path)}
              className={`dir-browser-quick-btn flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                currentPath === path
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              {QUICK_PATH_ICONS[key] || <FolderOpen className="w-3.5 h-3.5" />}
              <span className="capitalize">{key}</span>
            </button>
          ))}
          {/* Windows drives */}
          {defaults.drives?.map((drive) => (
            <button
              key={drive}
              onClick={() => setCurrentPath(drive)}
              className={`dir-browser-quick-btn flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                currentPath.startsWith(drive)
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>{drive}</span>
            </button>
          ))}
        </div>
      )}

      {/* Breadcrumb bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-zinc-800 min-h-[36px]">
        <button
          onClick={() => parentPath && setCurrentPath(parentPath)}
          disabled={!parentPath}
          className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
          title="Parent directory"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0 text-xs scrollbar-none">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-0.5 flex-shrink-0">
              {i > 0 && <ChevronRight className="w-3 h-3 text-zinc-600 flex-shrink-0" />}
              <button
                onClick={() => setCurrentPath(crumb.path)}
                className={`px-1 py-0.5 rounded hover:bg-zinc-800/50 transition-all truncate max-w-[120px] ${
                  i === breadcrumbs.length - 1
                    ? 'text-white font-medium'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {crumb.label}
              </button>
            </span>
          ))}
          {currentHasGit && (
            <span className="ml-1.5 flex items-center gap-0.5 text-emerald-400 flex-shrink-0">
              <FolderGit2 className="w-3 h-3" />
              <span className="text-[10px] font-medium">git</span>
            </span>
          )}
        </div>
      </div>

      {/* Directory listing */}
      <div ref={listRef} className="dir-browser-list max-h-[280px] overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 text-zinc-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-sm">Loading…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-2 px-3 py-4 text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {!loading && !error && directories.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-zinc-500">
            No subdirectories
          </div>
        )}

        {!loading && !error && directories.map((entry) => (
          <button
            key={entry.path}
            onClick={() => setCurrentPath(entry.path)}
            className="dir-browser-item w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all hover:bg-zinc-800/50 group/dir"
          >
            <FolderOpen className="w-4 h-4 text-zinc-400 group-hover/dir:text-amber-400 transition-colors flex-shrink-0" />
            <span className="text-sm text-zinc-300 group-hover/dir:text-white transition-colors truncate">
              {entry.name}
            </span>
          </button>
        ))}
      </div>

      {/* Footer with select button */}
      <div className="flex items-center justify-between px-3 py-2.5 border-t border-zinc-800">
        <span className="text-xs text-zinc-500 truncate mr-3 max-w-[60%]">
          {currentPath}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onSelect(currentPath);
              onClose();
            }}
            disabled={!currentPath}
            className="dir-browser-select-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-black hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-3.5 h-3.5" />
            Select This Directory
          </button>
        </div>
      </div>
    </div>
  );
}
