import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Store, Package, ChevronDown, ChevronUp, RefreshCw, Trash2, Download, Plus, Check, Search, Terminal, Zap, Users, Loader2, Server } from 'lucide-react';
import type { MarketplaceInfo, InstalledPluginsFile, MarketplacePluginDetails } from '../types';
import { getMarketplacePluginDetails } from '../api';

interface SkillsMarketplaceProps {
  open: boolean;
  onClose: () => void;
  marketplaces: MarketplaceInfo[];
  installedPlugins: InstalledPluginsFile;
  onInstall: (marketplace: string, plugin: string) => Promise<void>;
  onUninstall: (marketplace: string, plugin: string) => Promise<void>;
  onAddMarketplace: () => void;
  onUpdateMarketplace: (name: string) => Promise<void>;
  onRemoveMarketplace: (name: string) => Promise<void>;
  showNotification: (message: string, type?: 'success' | 'error') => void;
}

export function SkillsMarketplace({
  open,
  onClose,
  marketplaces,
  installedPlugins,
  onInstall,
  onUninstall,
  onAddMarketplace,
  onUpdateMarketplace,
  onRemoveMarketplace,
  showNotification,
}: SkillsMarketplaceProps) {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pluginDetails, setPluginDetails] = useState<Record<string, MarketplacePluginDetails>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const [operatingPlugin, setOperatingPlugin] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && marketplaces.length > 0 && !selectedName) {
      setSelectedName(marketplaces[0].name);
    }
    if (!open) {
      setSelectedName(null);
      setExpanded({});
      setPluginDetails({});
      setLoadingDetails({});
      setSearchQuery('');
    }
  }, [open, marketplaces]);

  // Close marketplace dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const selected = marketplaces.find((m) => m.name === selectedName) ?? null;

  const isInstalled = (marketplace: string, plugin: string): boolean => {
    const key = `${plugin}@${marketplace}`;
    const records = installedPlugins.plugins[key];
    return !!(records && records.length > 0);
  };

  const toggleExpanded = useCallback(async (pluginName: string) => {
    const wasExpanded = expanded[pluginName] ?? false;
    setExpanded((prev) => ({ ...prev, [pluginName]: !prev[pluginName] }));

    // Fetch details on first expand
    if (!wasExpanded && !pluginDetails[pluginName] && !loadingDetails[pluginName] && selected) {
      setLoadingDetails((prev) => ({ ...prev, [pluginName]: true }));
      try {
        const details = await getMarketplacePluginDetails(selected.name, pluginName);
        setPluginDetails((prev) => ({ ...prev, [pluginName]: details }));
      } catch {
        // Silently fail — will show "no details" state
      } finally {
        setLoadingDetails((prev) => ({ ...prev, [pluginName]: false }));
      }
    }
  }, [expanded, pluginDetails, loadingDetails, selected]);

  const handleInstall = async (marketplace: string, plugin: string) => {
    setOperatingPlugin(plugin);
    try {
      await onInstall(marketplace, plugin);
      showNotification(`Plugin "${plugin}" installed successfully!`);
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Failed to install plugin', 'error');
    } finally {
      setOperatingPlugin(null);
    }
  };

  const handleUninstall = async (marketplace: string, plugin: string) => {
    setOperatingPlugin(plugin);
    try {
      await onUninstall(marketplace, plugin);
      showNotification(`Plugin "${plugin}" uninstalled.`);
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Failed to uninstall plugin', 'error');
    } finally {
      setOperatingPlugin(null);
    }
  };

  const handleUpdate = async () => {
    if (!selected) return;
    setUpdating(true);
    try {
      await onUpdateMarketplace(selected.name);
      showNotification(`Marketplace "${selected.name}" updated!`);
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Failed to update', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleRemove = async () => {
    if (!selected) return;
    setRemoving(true);
    try {
      await onRemoveMarketplace(selected.name);
      setSelectedName(null);
      showNotification(`Marketplace "${selected.name}" removed.`);
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Failed to remove', 'error');
    } finally {
      setRemoving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-[140]" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-[560px] z-[150] flex flex-col glass-dark border-l border-zinc-800 shadow-2xl shadow-black/40">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <Store className="w-5 h-5 text-zinc-300" />
            <h2 className="text-lg font-bold text-white">Plugin Marketplace</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Marketplace selector */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 flex-shrink-0">
          {marketplaces.length === 0 ? (
            <span className="text-sm text-zinc-500">No marketplaces added</span>
          ) : (
            <>
              <div ref={dropdownRef} className="relative flex-1 mr-3">
                <button
                  type="button"
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 glass border border-zinc-700 rounded-xl text-white text-sm hover:border-zinc-600 transition-colors"
                >
                  <span className="truncate">{selected ? selected.source.repo : selectedName}</span>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-150 ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {dropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 glass border border-zinc-700 rounded-xl shadow-xl z-[200] overflow-hidden">
                    {marketplaces.map((m) => (
                      <button
                        key={m.name}
                        type="button"
                        onClick={() => { setSelectedName(m.name); setDropdownOpen(false); setSearchQuery(''); }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm text-white text-left hover:bg-zinc-800 transition-colors ${m.name === selectedName ? 'bg-zinc-800' : ''}`}
                      >
                        <span className="truncate">{m.source.repo}</span>
                        {m.name === selectedName && <Check className="w-3.5 h-3.5 shrink-0 text-blue-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={handleUpdate}
                  disabled={updating}
                  title="Update marketplace"
                  className="p-2 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 text-zinc-400 ${updating ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  title="Remove marketplace"
                  className="p-2 rounded-lg hover:bg-zinc-800 transition-colors text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Search */}
        {selected && selected.manifest.plugins.length > 0 && (
          <div className="px-6 py-3 border-b border-zinc-800 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 z-10 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search plugins..."
                className="w-full glass border border-zinc-800 rounded-xl pl-9 pr-9 py-2.5 text-white text-sm focus:border-zinc-600 focus:outline-none transition-colors"
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
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* No marketplaces empty state */}
          {marketplaces.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 space-y-3">
              <Store className="w-10 h-10 text-zinc-600" />
              <p className="text-gray-400 text-sm text-center">Add a marketplace to get started</p>
              <button
                onClick={onAddMarketplace}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl glass border border-zinc-700 text-sm text-white hover:border-zinc-500 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add Marketplace</span>
              </button>
            </div>
          )}

          {/* No plugins empty state */}
          {selected && selected.manifest.plugins.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 space-y-2">
              <Package className="w-10 h-10 text-zinc-600" />
              <p className="text-gray-400 text-sm">No plugins in this marketplace</p>
            </div>
          )}

          {/* Filtered no results */}
          {selected && selected.manifest.plugins.length > 0 && searchQuery && selected.manifest.plugins.filter((p) => {
            const q = searchQuery.toLowerCase();
            return p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q);
          }).length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 space-y-2">
              <Search className="w-10 h-10 text-zinc-600" />
              <p className="text-gray-400 text-sm">No plugins found for "{searchQuery}"</p>
            </div>
          )}

          {/* Plugin cards */}
          {selected && selected.manifest.plugins.filter((p) => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q);
          }).map((plugin) => {
            const installed = isInstalled(selected.name, plugin.name);
            const operating = operatingPlugin === plugin.name;
            const isExpanded = expanded[plugin.name] ?? false;

            return (
              <div
                key={plugin.name}
                className="glass border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-1">
                      <Package className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                      <span className="text-sm font-semibold text-white">{plugin.name}</span>
                      {installed && (
                        <span className="text-xs font-medium text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded">
                          Installed
                        </span>
                      )}
                      {plugin.version && (
                        <span className="text-xs text-zinc-500 bg-zinc-800/80 px-1.5 py-0.5 rounded">
                          v{plugin.version}
                        </span>
                      )}
                      {plugin.lspServers && Object.keys(plugin.lspServers).length > 0 && (
                        <span className="text-xs font-medium text-cyan-400 bg-cyan-900/30 px-1.5 py-0.5 rounded">
                          LSP
                        </span>
                      )}
                    </div>

                    {plugin.description && (
                      <p className="text-xs text-zinc-400 line-clamp-2 mb-2 ml-6">{plugin.description}</p>
                    )}

                    <button
                      onClick={() => toggleExpanded(plugin.name)}
                      className="ml-6 flex items-center space-x-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                      <span>{isExpanded ? 'Hide details' : 'View details'}</span>
                    </button>

                    {isExpanded && (
                      <div className="ml-6 mt-3 space-y-3">
                        {loadingDetails[plugin.name] && (
                          <div className="flex items-center space-x-2 text-xs text-zinc-500">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Loading details...</span>
                          </div>
                        )}

                        {pluginDetails[plugin.name] && (() => {
                          const details = pluginDetails[plugin.name];
                          const hasContent = details.commands.length > 0 || details.skills.length > 0 || details.agents.length > 0 || details.lspServers.length > 0;

                          if (!hasContent && details.sourceType === 'remote') {
                            return (
                              <p className="text-xs text-zinc-500 italic">Remote plugin — install to view details</p>
                            );
                          }

                          if (!hasContent) {
                            return (
                              <p className="text-xs text-zinc-600 italic">No commands, skills, agents, or LSP servers found</p>
                            );
                          }

                          return (
                            <>
                              {details.lspServers.length > 0 && (
                                <div>
                                  <div className="flex items-center space-x-1.5 mb-1.5">
                                    <Server className="w-3 h-3 text-cyan-400" />
                                    <span className="text-xs font-medium text-cyan-400">LSP Servers ({details.lspServers.length})</span>
                                  </div>
                                  <div className="space-y-1 ml-4.5">
                                    {details.lspServers.map((lsp) => (
                                      <div key={lsp.name} className="text-xs">
                                        <span className="text-zinc-400 font-mono">{lsp.command}</span>
                                        {lsp.extensions.length > 0 && (
                                          <div className="flex flex-wrap gap-1 mt-0.5">
                                            {lsp.extensions.map((ext) => (
                                              <span key={ext} className="text-[10px] text-zinc-500 bg-zinc-800/80 px-1 py-0.5 rounded">
                                                {ext}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {details.commands.length > 0 && (
                                <div>
                                  <div className="flex items-center space-x-1.5 mb-1.5">
                                    <Terminal className="w-3 h-3 text-blue-400" />
                                    <span className="text-xs font-medium text-blue-400">Commands ({details.commands.length})</span>
                                  </div>
                                  <div className="space-y-0.5 ml-4.5">
                                    {details.commands.map((cmd) => (
                                      <div key={cmd.name} className="text-xs text-zinc-400 font-mono">
                                        /{cmd.name}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {details.skills.length > 0 && (
                                <div>
                                  <div className="flex items-center space-x-1.5 mb-1.5">
                                    <Zap className="w-3 h-3 text-amber-400" />
                                    <span className="text-xs font-medium text-amber-400">Skills ({details.skills.length})</span>
                                  </div>
                                  <div className="space-y-0.5 ml-4.5">
                                    {details.skills.map((skill) => (
                                      <div key={skill.name} className="text-xs text-zinc-400 font-mono">
                                        {skill.name}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {details.agents.length > 0 && (
                                <div>
                                  <div className="flex items-center space-x-1.5 mb-1.5">
                                    <Users className="w-3 h-3 text-purple-400" />
                                    <span className="text-xs font-medium text-purple-400">Agents ({details.agents.length})</span>
                                  </div>
                                  <div className="space-y-0.5 ml-4.5">
                                    {details.agents.map((agent) => (
                                      <div key={agent.name} className="flex items-center space-x-2 text-xs text-zinc-400 font-mono">
                                        <span>{agent.name}</span>
                                        {agent.model && (
                                          <span className="text-zinc-600 text-[10px] bg-zinc-800/80 px-1 py-0.5 rounded">
                                            {agent.model}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}

                        {!loadingDetails[plugin.name] && !pluginDetails[plugin.name] && (
                          <p className="text-xs text-zinc-600 italic">Failed to load details</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action button */}
                  <div className="flex-shrink-0 ml-3">
                    {installed ? (
                      <button
                        onClick={() => handleUninstall(selected.name, plugin.name)}
                        disabled={operating}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-lg glass border border-red-900/50 hover:border-red-700/50 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-xs text-red-400 font-medium">
                          {operating ? 'Removing...' : 'Uninstall'}
                        </span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleInstall(selected.name, plugin.name)}
                        disabled={operating}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-lg glass border border-zinc-700 hover:border-zinc-500 transition-colors disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5 text-zinc-300" />
                        <span className="text-xs text-zinc-300 font-medium">
                          {operating ? 'Installing...' : 'Install'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex-shrink-0">
          <button
            onClick={onAddMarketplace}
            className="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-xl glass border border-zinc-700 text-sm text-white hover:border-zinc-500 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Marketplace</span>
          </button>
        </div>
      </div>
    </>
  );
}
