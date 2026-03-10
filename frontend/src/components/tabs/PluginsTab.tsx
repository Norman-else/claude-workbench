import { useEffect, useState } from 'react';
import { ArrowLeft, Eye, LayoutGrid, List, Loader2, Package, Plus, Search, Store, Trash2, Zap, Terminal, Users } from 'lucide-react';
import { addMarketplace, installPlugin, uninstallPlugin, updateMarketplace, removeMarketplace, getInstalledPluginDetails } from '../../api';
import type { MarketplaceInfo, InstalledPluginsFile, InstalledPluginDetails } from '../../types';
import { SkillsMarketplace } from '../SkillsMarketplace';
import { AddMarketplaceModal } from '../AddMarketplaceModal';

interface PluginsTabProps {
  marketplaces: MarketplaceInfo[];
  installedPlugins: InstalledPluginsFile;
  showNotification: (message: string, type?: 'success' | 'error') => void;
  loadConfig: (showProgress?: boolean) => Promise<void>;
  onRefreshMarketplaces: () => Promise<void>;
}

export function PluginsTab({ marketplaces, installedPlugins, showNotification, loadConfig: _loadConfig, onRefreshMarketplaces }: PluginsTabProps) {
  const [showMarketplaceDrawer, setShowMarketplaceDrawer] = useState(false);
  const [showAddMarketplaceModal, setShowAddMarketplaceModal] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState<{ key: string; pluginName: string; marketplaceName: string } | null>(null);
  const [uninstallingPlugins, setUninstallingPlugins] = useState<Set<string>>(new Set());
  const [pluginDetails, setPluginDetails] = useState<InstalledPluginDetails[]>([]);
  const [pluginsView, setPluginsView] = useState<'list' | 'detail'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [displayLayout, setDisplayLayout] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    getInstalledPluginDetails().then(setPluginDetails).catch(() => {});
  }, [installedPlugins]);

  const handleAddMarketplace = async (url: string) => {
    await addMarketplace(url);
    await onRefreshMarketplaces();
  };

  const handleInstallPlugin = async (marketplace: string, plugin: string) => {
    await installPlugin(marketplace, plugin);
    await onRefreshMarketplaces();
  };

  const handleUninstallPlugin = async (marketplace: string, plugin: string) => {
    await uninstallPlugin(marketplace, plugin);
    await onRefreshMarketplaces();
  };

  const handleUpdateMarketplace = async (name: string) => {
    await updateMarketplace(name);
    await onRefreshMarketplaces();
  };

  const handleRemoveMarketplace = async (name: string) => {
    await removeMarketplace(name);
    await onRefreshMarketplaces();
  };

  const handleCardUninstall = async (key: string, marketplaceName: string, pluginName: string) => {
    setUninstallingPlugins(prev => new Set(prev).add(key));
    try {
      await handleUninstallPlugin(marketplaceName, pluginName);
      showNotification(`${pluginName} uninstalled successfully!`);
      if (selectedPlugin?.key === key) {
        setSelectedPlugin(null);
        setPluginsView('list');
      }
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Failed to uninstall plugin', 'error');
    } finally {
      setUninstallingPlugins(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <>
      <div className="p-8">
        {pluginsView === 'detail' && selectedPlugin ? (
          <div>
            <div className="flex items-center space-x-4 mb-8 relative z-[60]">
              <button
                onClick={() => {
                  setSelectedPlugin(null);
                  setPluginsView('list');
                }}
                className="p-2 rounded-lg hover:bg-zinc-800 transition-colors titlebar-no-drag"
              >
                <ArrowLeft className="w-6 h-6 text-zinc-100" />
              </button>
              <div>
                <h2 className="text-3xl font-bold text-white">{selectedPlugin.pluginName}</h2>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                    {selectedPlugin.marketplaceName}
                  </span>
                </div>
              </div>
            </div>

            {(() => {
              const marketplace = marketplaces.find(m => m.name === selectedPlugin.marketplaceName);
              const pluginInfo = marketplace?.manifest.plugins?.find(p => p.name === selectedPlugin.pluginName);
              const detail = pluginDetails.find(d => d.key === selectedPlugin.key);

              return (
                <div className="glass border border-zinc-800 rounded-2xl p-8">
                  {pluginInfo ? (
                    <div className="space-y-6">
                      {pluginInfo.description && (
                        <div>
                          <h3 className="text-sm font-medium text-zinc-400 mb-2">Description</h3>
                          <p className="text-white">{pluginInfo.description}</p>
                        </div>
                      )}
                      {pluginInfo.version && (
                        <div>
                          <h3 className="text-sm font-medium text-zinc-400 mb-1">Version</h3>
                          <p className="text-white text-sm">{pluginInfo.version}</p>
                        </div>
                      )}
                      {pluginInfo.category && (
                        <div>
                          <h3 className="text-sm font-medium text-zinc-400 mb-1">Category</h3>
                          <p className="text-white text-sm">{pluginInfo.category}</p>
                        </div>
                      )}
                      {pluginInfo.skills && pluginInfo.skills.length > 0 && (
                        <div>
                          <h3 className="text-sm font-medium text-zinc-400 mb-3">Skills</h3>
                          <div className="space-y-2">
                            {pluginInfo.skills.map((skill) => (
                              <div key={skill} className="flex items-center space-x-3 glass border border-zinc-800 rounded-xl px-4 py-3">
                                <Zap className="w-4 h-4 text-zinc-400" />
                                <span className="text-sm text-white">{skill}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Package className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                      <p className="text-zinc-400">Marketplace info unavailable</p>
                      <p className="text-xs text-zinc-600 mt-1">The marketplace for this plugin may have been removed</p>
                    </div>
                  )}

                  {detail && detail.commands.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-sm font-medium text-zinc-400 mb-3">Commands</h3>
                      <div className="flex flex-wrap gap-2">
                        {detail.commands.map((cmd) => (
                          <span key={cmd.name} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-zinc-800 border border-zinc-700 text-zinc-300">
                            <Terminal className="w-3 h-3 mr-1.5" />
                            {cmd.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {detail && detail.skills.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-sm font-medium text-zinc-400 mb-3">Skills</h3>
                      <div className="flex flex-wrap gap-2">
                        {detail.skills.map((s) => (
                          <span key={s.name} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-zinc-800 border border-zinc-700 text-zinc-300">
                            <Zap className="w-3 h-3 mr-1.5" />
                            {s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {detail && detail.agents.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-sm font-medium text-zinc-400 mb-3">Agents</h3>
                      <div className="flex flex-wrap gap-2">
                        {detail.agents.map((agent) => (
                          <span key={agent.name} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-zinc-800 border border-zinc-700 text-zinc-300">
                            <Users className="w-3 h-3 mr-1.5" />
                            {agent.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-6 border-t border-zinc-800 mt-6">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCardUninstall(selectedPlugin.key, selectedPlugin.marketplaceName, selectedPlugin.pluginName);
                      }}
                      disabled={uninstallingPlugins.has(selectedPlugin.key)}
                      className="px-6 py-3 rounded-xl bg-red-900/30 hover:bg-red-900/50 border border-red-800/50 text-red-400 font-medium transition-all flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {uninstallingPlugins.has(selectedPlugin.key) ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      <span>Uninstall</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-8 titlebar-no-drag">
              <div>
                <h2 className="text-3xl font-bold text-white mb-2">Installed Plugins</h2>
                <p className="text-gray-400">Manage your installed plugins and browse the marketplace</p>
              </div>
              <button
                onClick={() => setShowMarketplaceDrawer(true)}
                className="glass hover:border-zinc-600 border border-zinc-800 px-6 py-3 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-black/20 group titlebar-no-drag shrink-0"
              >
                <Store className="w-5 h-5 text-zinc-100" />
                <span className="text-white font-medium">Browse Marketplace</span>
              </button>
            </div>

            {Object.keys(installedPlugins.plugins).length > 0 && (
              <div className="flex items-center gap-3 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search installed plugins..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full glass border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-white placeholder-zinc-500 focus:border-zinc-600 focus:outline-none text-sm transition-colors"
                  />
                </div>
                <div className="flex items-center glass border border-zinc-800 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setDisplayLayout('grid')}
                    className={`p-2 transition-colors ${displayLayout === 'grid' ? 'bg-zinc-700/60 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                    title="Grid view"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDisplayLayout('list')}
                    className={`p-2 transition-colors ${displayLayout === 'list' ? 'bg-zinc-700/60 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                    title="List view"
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {Object.keys(installedPlugins.plugins).length === 0 ? (
              <div className="glass border border-zinc-800 rounded-2xl p-12 text-center">
                <Store className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 mb-4">No plugins installed</p>
                <button
                  onClick={() => setShowMarketplaceDrawer(true)}
                  className="glass hover:border-zinc-600 border border-zinc-800 px-6 py-3 rounded-xl inline-flex items-center space-x-2"
                >
                  <Plus className="w-5 h-5 text-zinc-100" />
                  <span className="text-white font-medium">Browse Marketplace</span>
                </button>
              </div>
            ) : (() => {
              const q = searchQuery.toLowerCase().trim();
              const entries = Object.entries(installedPlugins.plugins).filter(([key]) => {
                if (!q) return true;
                const [pluginName, marketplaceName] = key.split('@');
                const mp = marketplaces.find(m => m.name === marketplaceName);
                const info = mp?.manifest.plugins?.find(p => p.name === pluginName);
                return (
                  pluginName.toLowerCase().includes(q) ||
                  marketplaceName.toLowerCase().includes(q) ||
                  (info?.description?.toLowerCase().includes(q) ?? false)
                );
              });

              if (entries.length === 0) {
                return (
                  <div className="glass border border-zinc-800 rounded-2xl p-12 text-center">
                    <Search className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-400">No plugins match &ldquo;{searchQuery}&rdquo;</p>
                  </div>
                );
              }

              return displayLayout === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {entries.map(([key]) => {
                    const [pluginName, marketplaceName] = key.split('@');
                    const mp = marketplaces.find(m => m.name === marketplaceName);
                    const info = mp?.manifest.plugins?.find(p => p.name === pluginName);
                    return (
                      <div key={key} className="glass border border-zinc-800 rounded-2xl p-4 flex flex-col" style={{ minHeight: '180px' }}>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2 rounded-lg bg-zinc-800/50 shrink-0">
                            <Package className="w-5 h-5 text-zinc-100" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-bold text-white truncate">{pluginName}</h3>
                              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
                            </div>
                            <p className="text-xs text-zinc-500 truncate">{marketplaceName}</p>
                          </div>
                        </div>
                        {info?.description ? (
                          <p className="text-xs text-gray-400 line-clamp-2 flex-1 mb-3">{info.description}</p>
                        ) : (
                          <div className="flex-1 mb-3" />
                        )}
                        <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-800 mt-auto">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPlugin({ key, pluginName, marketplaceName });
                              setPluginsView('detail');
                            }}
                            className="flex-1 glass hover:border-zinc-600 border border-zinc-800 px-3 py-1.5 rounded-xl flex items-center justify-center space-x-2 transition-all"
                          >
                            <Eye className="w-3.5 h-3.5 text-zinc-100" />
                            <span className="text-xs text-white font-medium">View</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCardUninstall(key, marketplaceName, pluginName);
                            }}
                            disabled={uninstallingPlugins.has(key)}
                            className="p-1.5 glass hover:border-red-700/50 border border-red-900/50 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {uninstallingPlugins.has(key) ? (
                              <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {entries.map(([key]) => {
                    const [pluginName, marketplaceName] = key.split('@');
                    const mp = marketplaces.find(m => m.name === marketplaceName);
                    const info = mp?.manifest.plugins?.find(p => p.name === pluginName);
                    return (
                      <div key={key} className="glass border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-zinc-800/50 shrink-0">
                          <Package className="w-4 h-4 text-zinc-100" />
                        </div>
                        <div className="min-w-0 flex-1 flex items-center gap-3">
                          <h3 className="text-sm font-semibold text-white whitespace-nowrap">{pluginName}</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 whitespace-nowrap shrink-0">{marketplaceName}</span>
                          {info?.description && (
                            <p className="text-xs text-zinc-500 truncate min-w-0">{info.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPlugin({ key, pluginName, marketplaceName });
                              setPluginsView('detail');
                            }}
                            className="glass hover:border-zinc-600 border border-zinc-800 px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all"
                          >
                            <Eye className="w-3.5 h-3.5 text-zinc-100" />
                            <span className="text-xs text-white font-medium">View</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCardUninstall(key, marketplaceName, pluginName);
                            }}
                            disabled={uninstallingPlugins.has(key)}
                            className="p-1.5 glass hover:border-red-700/50 border border-red-900/50 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {uninstallingPlugins.has(key) ? (
                              <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <SkillsMarketplace
        open={showMarketplaceDrawer}
        onClose={() => setShowMarketplaceDrawer(false)}
        marketplaces={marketplaces}
        installedPlugins={installedPlugins}
        onInstall={handleInstallPlugin}
        onUninstall={handleUninstallPlugin}
        onAddMarketplace={() => { setShowMarketplaceDrawer(false); setShowAddMarketplaceModal(true); }}
        onUpdateMarketplace={handleUpdateMarketplace}
        onRemoveMarketplace={handleRemoveMarketplace}
        showNotification={showNotification}
      />

      <AddMarketplaceModal
        open={showAddMarketplaceModal}
        onClose={() => setShowAddMarketplaceModal(false)}
        onAdd={handleAddMarketplace}
        showNotification={showNotification}
      />
    </>
  );
}
