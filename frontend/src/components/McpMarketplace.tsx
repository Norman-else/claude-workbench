import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Download, Check, AlertCircle, ChevronLeft, ChevronRight, Store } from 'lucide-react';
import { saveClaudeConfig } from '../api';
import { McpInstallModal } from './McpInstallModal';
import type { ClaudeConfig, RegistryServer, RegistryPackage, RegistryListResponse } from '../types';

const REGISTRY_BASE = 'https://registry.modelcontextprotocol.io/v0.1';
const PAGE_SIZE = 20;

interface McpMarketplaceProps {
  open: boolean;
  onClose: () => void;
  claudeConfig: ClaudeConfig;
  setClaudeConfig: React.Dispatch<React.SetStateAction<ClaudeConfig>>;
  showNotification: (message: string, type?: 'success' | 'error') => void;
}

function getNpmPackage(server: RegistryServer): RegistryPackage | undefined {
  return server.packages?.find((p) => p.registryType === 'npm');
}

function getServerDisplayName(server: RegistryServer): string {
  return server.title ?? server.name.split('/').pop() ?? server.name;
}

function getInstalledServerName(server: RegistryServer): string {
  // Use the part after the slash, e.g. "io.github.user/weather" → "weather"
  return server.name.split('/').pop() ?? server.name;
}

function ServerIcon({ server }: { server: RegistryServer }) {
  const [imgError, setImgError] = useState(false);
  const icon = server.icons?.[0]?.src;
  const letter = getServerDisplayName(server).charAt(0).toUpperCase();

  if (icon && !imgError) {
    return (
      <img
        src={icon}
        alt={getServerDisplayName(server)}
        className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center flex-shrink-0">
      <span className="text-white font-bold text-sm">{letter}</span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="glass border border-zinc-800 rounded-xl p-4 animate-pulse">
      <div className="flex items-start space-x-3">
        <div className="w-10 h-10 rounded-lg bg-zinc-800 flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 bg-zinc-800 rounded w-1/3" />
          <div className="h-3 bg-zinc-800 rounded w-full" />
          <div className="h-3 bg-zinc-800 rounded w-2/3" />
        </div>
        <div className="w-16 h-8 bg-zinc-800 rounded-lg flex-shrink-0" />
      </div>
    </div>
  );
}

export function McpMarketplace({ open, onClose, claudeConfig, setClaudeConfig, showNotification }: McpMarketplaceProps) {
  const [servers, setServers] = useState<RegistryServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]); // stack of previous cursors
  const [installTarget, setInstallTarget] = useState<RegistryServer | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchServers = useCallback(async (cursor: string | null, search: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ version: 'latest', limit: String(PAGE_SIZE) });
      if (cursor) params.set('cursor', cursor);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`${REGISTRY_BASE}/servers?${params.toString()}`);
      if (!res.ok) throw new Error(`Registry API error: ${res.status}`);

      const data: RegistryListResponse = await res.json();
      const filtered = data.servers
        .map((item) => item.server)
        .filter((s) => getNpmPackage(s) !== undefined);

      setServers(filtered);
      setNextCursor(data.metadata.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load marketplace');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load & re-load when opened
  useEffect(() => {
    if (!open) return;
    setCursorStack([]);
    fetchServers(null, searchQuery);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCursorStack([]);
      fetchServers(null, searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, open, fetchServers]);

  const isInstalled = useCallback(
    (server: RegistryServer): boolean => {
      const npmPkg = getNpmPackage(server);
      if (!npmPkg) return false;
      return Object.values(claudeConfig.mcpServers ?? {}).some(
        (s) => s.args?.includes(npmPkg.identifier)
      );
    },
    [claudeConfig.mcpServers]
  );

  const handleNextPage = () => {
    if (!nextCursor) return;
    // Push current "first item cursor" — we use '' for page 1
    const currentCursor = cursorStack.length === 0 ? null : cursorStack[cursorStack.length - 1];
    setCursorStack((prev) => [...prev, currentCursor ?? '']);
    fetchServers(nextCursor, searchQuery);
  };

  const handlePrevPage = () => {
    if (cursorStack.length === 0) return;
    const newStack = [...cursorStack];
    const prevCursor = newStack.pop() ?? null;
    setCursorStack(newStack);
    fetchServers(prevCursor === '' ? null : prevCursor, searchQuery);
  };

  const installServer = useCallback(
    async (server: RegistryServer, envValues: Record<string, string>) => {
      const npmPkg = getNpmPackage(server);
      if (!npmPkg) return;

      const serverName = getInstalledServerName(server);
      // Deduplicate name if already exists
      let finalName = serverName;
      let counter = 1;
      while (claudeConfig.mcpServers?.[finalName]) {
        finalName = `${serverName}-${counter++}`;
      }

      const newConfig: ClaudeConfig = {
        ...claudeConfig,
        mcpServers: {
          ...claudeConfig.mcpServers,
          [finalName]: {
            command: 'npx',
            args: ['-y', npmPkg.identifier],
            env: Object.keys(envValues).length > 0 ? envValues : undefined,
          },
        },
      };

      await saveClaudeConfig(newConfig);
      setClaudeConfig(newConfig);
      setInstallTarget(null);
      showNotification(`"${getServerDisplayName(server)}" installed successfully!`);
    },
    [claudeConfig, setClaudeConfig, showNotification]
  );

  const handleInstallClick = (server: RegistryServer) => {
    const npmPkg = getNpmPackage(server);
    if (!npmPkg) return;

    const requiredEnvVars = (npmPkg.environmentVariables ?? []).filter((e) => e.isRequired);
    if (requiredEnvVars.length > 0) {
      setInstallTarget(server);
    } else {
      installServer(server, {}).catch(() =>
        showNotification('Failed to install server', 'error')
      );
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-[140]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-[560px] z-[150] flex flex-col glass-dark border-l border-zinc-800 shadow-2xl shadow-black/40">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <Store className="w-5 h-5 text-zinc-300" />
            <h2 className="text-lg font-bold text-white">MCP Marketplace</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-4 border-b border-zinc-800 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search servers..."
              className="w-full glass border border-zinc-800 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:border-zinc-600 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading && (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center h-48 space-y-3">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <p className="text-gray-400 text-sm text-center">{error}</p>
              <button
                onClick={() => fetchServers(null, searchQuery)}
                className="px-4 py-2 rounded-xl glass border border-zinc-700 text-sm text-white hover:border-zinc-500 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && servers.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 space-y-2">
              <Store className="w-10 h-10 text-zinc-600" />
              <p className="text-gray-400 text-sm">
                {searchQuery ? `No servers found for "${searchQuery}"` : 'No servers available'}
              </p>
            </div>
          )}

          {!loading && !error && servers.map((server) => {
            const npmPkg = getNpmPackage(server)!;
            const installed = isInstalled(server);
            const requiredEnvs = (npmPkg.environmentVariables ?? []).filter((e) => e.isRequired);

            return (
              <div key={server.name} className="glass border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
                <div className="flex items-start space-x-3">
                  <ServerIcon server={server} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-sm font-semibold text-white truncate">
                        {getServerDisplayName(server)}
                      </span>
                      <span className="text-xs font-medium text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded flex-shrink-0">
                        npm
                      </span>
                    </div>
                    {server.description && (
                      <p className="text-xs text-zinc-400 line-clamp-2 mb-2">{server.description}</p>
                    )}
                    {requiredEnvs.length > 0 && (
                      <div className="flex items-center space-x-1 text-xs text-amber-400/80">
                        <AlertCircle className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">
                          Requires: {requiredEnvs.map((e) => e.name).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {installed ? (
                      <div className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-green-900/30 border border-green-800/50">
                        <Check className="w-3.5 h-3.5 text-green-400" />
                        <span className="text-xs text-green-400 font-medium">Installed</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleInstallClick(server)}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-lg glass border border-zinc-700 hover:border-zinc-500 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 text-zinc-300" />
                        <span className="text-xs text-zinc-300 font-medium">Install</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {!loading && !error && servers.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 flex-shrink-0">
            <button
              onClick={handlePrevPage}
              disabled={cursorStack.length === 0}
              className="flex items-center space-x-1 px-4 py-2 rounded-xl glass border border-zinc-800 text-sm text-zinc-300 hover:border-zinc-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>
            <span className="text-xs text-zinc-500">
              Page {cursorStack.length + 1}
            </span>
            <button
              onClick={handleNextPage}
              disabled={!nextCursor}
              className="flex items-center space-x-1 px-4 py-2 rounded-xl glass border border-zinc-800 text-sm text-zinc-300 hover:border-zinc-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Install Modal */}
      {installTarget && (() => {
        const npmPkg = getNpmPackage(installTarget)!;
        return (
          <McpInstallModal
            server={installTarget}
            npmPackage={npmPkg}
            onInstall={async (envValues) => {
              await installServer(installTarget, envValues);
            }}
            onClose={() => setInstallTarget(null)}
          />
        );
      })()}
    </>
  );
}
