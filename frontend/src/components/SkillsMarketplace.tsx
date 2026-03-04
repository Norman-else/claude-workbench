import { useState, useEffect, useRef } from 'react';
import { X, Store, Package, ChevronDown, ChevronUp, RefreshCw, Trash2, Download, Plus, Check } from 'lucide-react';
import type { MarketplaceInfo, InstalledPluginsFile } from '../types';

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
  const [operatingPlugin, setOperatingPlugin] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && marketplaces.length > 0 && !selectedName) {
      setSelectedName(marketplaces[0].name);
    }
    if (!open) {
      setSelectedName(null);
      setExpanded({});
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

  const toggleExpanded = (pluginName: string) => {
    setExpanded((prev) => ({ ...prev, [pluginName]: !prev[pluginName] }));
  };

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
            <h2 className="text-lg font-bold text-white">Skills Marketplace</h2>
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
                  <span className="truncate">{selectedName}</span>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-150 ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {dropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 glass border border-zinc-700 rounded-xl shadow-xl z-[200] overflow-hidden">
                    {marketplaces.map((m) => (
                      <button
                        key={m.name}
                        type="button"
                        onClick={() => { setSelectedName(m.name); setDropdownOpen(false); }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm text-white text-left hover:bg-zinc-800 transition-colors ${m.name === selectedName ? 'bg-zinc-800' : ''}`}
                      >
                        <span className="truncate">{m.name}</span>
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

          {/* Plugin cards */}
          {selected && selected.manifest.plugins.map((plugin) => {
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
                      {plugin.skills && plugin.skills.length > 0 && (
                        <span className="text-xs text-zinc-500 bg-zinc-800/80 px-1.5 py-0.5 rounded">
                          {plugin.skills.length} skills
                        </span>
                      )}
                    </div>

                    {plugin.description && (
                      <p className="text-xs text-zinc-400 line-clamp-2 mb-2 ml-6">{plugin.description}</p>
                    )}

                    {plugin.skills && plugin.skills.length > 0 && (
                      <button
                        onClick={() => toggleExpanded(plugin.name)}
                        className="ml-6 flex items-center space-x-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                        <span>{isExpanded ? 'Hide skills' : 'Show skills'}</span>
                      </button>
                    )}

                    {isExpanded && plugin.skills && (
                      <div className="ml-6 mt-2 space-y-1">
                        {plugin.skills.map((skill) => (
                          <div key={skill} className="text-xs text-zinc-500 font-mono">
                            {skill.replace(/^\.\/skills\//, '').replace(/^\.\//, '')}
                          </div>
                        ))}
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
