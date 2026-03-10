import { useState, useEffect } from 'react';
import { ArrowLeft, Command, Edit2, Eye, LayoutGrid, List, Package, Plus, Save, Search, Trash2 } from 'lucide-react';
import { saveCommand, getInstalledPluginDetails, getPluginCommandContent } from '../../api';
import type { CommandFile, InstalledPluginDetails, InstalledPluginsFile, ViewMode } from '../../types';

interface CommandsTabProps {
  commands: CommandFile[];
  showNotification: (message: string, type?: 'success' | 'error') => void;
  loadConfig: (showProgress?: boolean) => Promise<void>;
  requestDelete: (name: string) => void;
  installedPlugins?: InstalledPluginsFile;
}

export function CommandsTab({ commands, showNotification, loadConfig, requestDelete, installedPlugins }: CommandsTabProps) {
  const [commandViewMode, setCommandViewMode] = useState<ViewMode>('list');
  const [editingCommand, setEditingCommand] = useState<CommandFile | null>(null);
  const [showAddCommandModal, setShowAddCommandModal] = useState(false);
  const [newCommandForm, setNewCommandForm] = useState<{ name: string; content: string }>({ name: '', content: '' });
  const [commandsView, setCommandsView] = useState<'my' | 'plugin'>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const [displayLayout, setDisplayLayout] = useState<'grid' | 'list'>('grid');
  const [pluginDetails, setPluginDetails] = useState<InstalledPluginDetails[]>([]);
  const [viewingPluginCommand, setViewingPluginCommand] = useState<{
    pluginKey: string;
    pluginName: string;
    marketplaceName: string;
    name: string;
    content: string;
  } | null>(null);

  useEffect(() => {
    getInstalledPluginDetails().then(setPluginDetails).catch(() => {});
  }, [installedPlugins]);

  const openCommandDetail = (commandName: string) => {
    const cmd = commands.find((c) => c.name === commandName);
    if (cmd) {
      setEditingCommand({ name: cmd.name, content: cmd.content });
      setCommandViewMode('detail');
    }
  };

  const saveCommandDetail = async () => {
    if (!editingCommand) return;
    try {
      await saveCommand(editingCommand);
      showNotification('Command updated successfully!');
      await loadConfig();
      setCommandViewMode('list');
      setEditingCommand(null);
    } catch {
      showNotification('Failed to save command', 'error');
    }
  };

  const addNewCommand = async () => {
    if (!newCommandForm.name || !newCommandForm.content) {
      showNotification('Please fill in command name and content', 'error');
      return;
    }

    try {
      await saveCommand(newCommandForm);
      showNotification('Command added successfully!');
      await loadConfig();
      setShowAddCommandModal(false);
      setNewCommandForm({ name: '', content: '' });
    } catch {
      showNotification('Failed to add command', 'error');
    }
  };

  const handleViewPluginCommand = async (detail: InstalledPluginDetails, cmd: { name: string; filename: string }) => {
    try {
      const { content } = await getPluginCommandContent(detail.installPath, cmd.filename);
      setViewingPluginCommand({
        pluginKey: detail.key,
        pluginName: detail.pluginName,
        marketplaceName: detail.marketplaceName,
        name: cmd.name,
        content,
      });
    } catch {
      showNotification('Failed to load command content', 'error');
    }
  };

  return (
    <>
      <div className="p-8">
        {/* Tab switcher */}
        <div className="flex items-center space-x-1 glass border border-zinc-800 rounded-xl p-1 mb-6 titlebar-no-drag w-fit">
          <button
            onClick={() => setCommandsView('my')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${commandsView === 'my' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}
          >
            My Commands
          </button>
          <button
            onClick={() => setCommandsView('plugin')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${commandsView === 'plugin' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}
          >
            Plugin Commands
          </button>
        </div>

        {commandsView === 'my' ? (
          <>
            {commandViewMode === 'list' ? (
              <div>
                <div className="flex items-center justify-between mb-6 titlebar-no-drag">
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-1">
                      Custom Commands
                    </h2>
                    <p className="text-gray-400 text-sm">Manage your custom command scripts</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search commands..."
                        className="glass border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-white text-sm placeholder-zinc-500 focus:border-zinc-600 focus:outline-none w-56 transition-all"
                      />
                    </div>
                    <div className="flex items-center glass border border-zinc-800 rounded-xl p-0.5">
                      <button
                        onClick={() => setDisplayLayout('grid')}
                        className={`p-2 rounded-lg transition-all ${displayLayout === 'grid' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDisplayLayout('list')}
                        className={`p-2 rounded-lg transition-all ${displayLayout === 'list' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        <List className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => setShowAddCommandModal(true)}
                      className="glass hover:border-zinc-600 border border-zinc-800 px-5 py-2 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-black/20 group titlebar-no-drag"
                    >
                      <Plus className="w-4 h-4 text-zinc-100 group-hover:rotate-90 transition-transform duration-300" />
                      <span className="text-white text-sm font-medium">Add Command</span>
                    </button>
                  </div>
                </div>

                {(() => {
                  const filtered = commands.filter((cmd) => {
                    if (!searchQuery) return true;
                    const q = searchQuery.toLowerCase();
                    return cmd.name.toLowerCase().includes(q) || cmd.content.toLowerCase().includes(q);
                  });

                  if (filtered.length === 0 && commands.length > 0) {
                    return (
                      <div className="glass border border-zinc-800 rounded-2xl p-12 text-center">
                        <Search className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                        <p className="text-zinc-400">No commands matching &ldquo;{searchQuery}&rdquo;</p>
                      </div>
                    );
                  }

                  if (filtered.length === 0) {
                    return (
                      <div className="glass border border-zinc-800 rounded-2xl p-12 text-center">
                        <Command className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400 mb-4">No custom commands yet</p>
                        <button
                          onClick={() => setShowAddCommandModal(true)}
                          className="glass hover:border-zinc-600 border border-zinc-800 px-6 py-3 rounded-xl inline-flex items-center space-x-2"
                        >
                          <Plus className="w-5 h-5 text-zinc-100" />
                          <span className="text-white font-medium">Create Your First Command</span>
                        </button>
                      </div>
                    );
                  }

                  if (displayLayout === 'list') {
                    return (
                      <div className="space-y-2">
                        {filtered.map((cmd) => (
                          <div
                            key={cmd.name}
                            className="glass border border-zinc-800 rounded-xl px-4 py-3 card-hover cursor-pointer group flex items-center gap-4 transition-all"
                            onClick={() => openCommandDetail(cmd.name)}
                          >
                            <div className="p-2 rounded-lg bg-zinc-800/50 group-hover:bg-zinc-700/50 transition-all shrink-0">
                              <Command className="w-4 h-4 text-zinc-100" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-semibold text-white truncate">{cmd.name.replace(/\.md$/, '')}</h3>
                              <p className="text-xs text-zinc-500 truncate font-mono">{cmd.content.substring(0, 80)}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); openCommandDetail(cmd.name); }}
                                className="p-1.5 glass hover:border-zinc-600 border border-zinc-800 rounded-lg transition-all tooltip"
                                data-tooltip="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-zinc-300" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); requestDelete(cmd.name); }}
                                className="p-1.5 glass hover:border-red-700/50 border border-red-900/50 rounded-lg transition-all tooltip"
                                data-tooltip="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filtered.map((cmd) => (
                        <div
                          key={cmd.name}
                          className="glass border border-zinc-800 rounded-2xl p-5 card-hover cursor-pointer group relative h-[180px] flex flex-col"
                          onClick={() => openCommandDetail(cmd.name)}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></div>
                              <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Command</span>
                            </div>
                            <div className="p-2 rounded-lg bg-zinc-800/50 group-hover:bg-zinc-700/50 transition-all">
                              <Command className="w-4 h-4 text-zinc-300" />
                            </div>
                          </div>
                          <h3 className="text-base font-bold text-white mb-1.5 truncate">{cmd.name.replace(/\.md$/, '')}</h3>
                          <p className="text-gray-500 line-clamp-2 font-mono text-[11px] leading-relaxed flex-1">{cmd.content.substring(0, 100)}</p>
                          <div className="flex items-center gap-2 pt-3 border-t border-zinc-800/60 mt-auto">
                            <button
                              onClick={(e) => { e.stopPropagation(); openCommandDetail(cmd.name); }}
                              className="flex-1 glass hover:border-zinc-600 border border-zinc-800 px-3 py-1.5 rounded-lg flex items-center justify-center space-x-1.5 transition-all"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-zinc-300" />
                              <span className="text-[11px] text-zinc-300 font-medium">Edit</span>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); requestDelete(cmd.name); }}
                              className="p-1.5 glass hover:border-red-700/50 border border-red-900/50 rounded-lg transition-all tooltip"
                              data-tooltip="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div>
                <div className="flex items-center space-x-4 mb-8 relative z-[60]">
                  <button
                    onClick={() => {
                      setCommandViewMode('list');
                      setEditingCommand(null);
                    }}
                    className="p-2 rounded-lg hover:bg-zinc-800 transition-colors titlebar-no-drag"
                  >
                    <ArrowLeft className="w-6 h-6 text-zinc-100" />
                  </button>
                  <div>
                    <h2 className="text-3xl font-bold  text-white">
                      {editingCommand?.name.replace(/\.md$/, '')}
                    </h2>
                    <p className="text-gray-400">Edit command content</p>
                  </div>
                </div>

                <div className="glass border border-zinc-800 rounded-2xl p-8">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Command Content</label>
                      <textarea
                        value={editingCommand?.content || ''}
                        onChange={(e) => setEditingCommand((prev) => (prev ? { ...prev, content: e.target.value } : null))}
                        className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-zinc-600 focus:outline-none transition-all input-focus"
                        rows={20}
                        placeholder="Enter your command script here..."
                      />
                    </div>

                    <div className="flex justify-end space-x-4 pt-6 border-t border-zinc-800">
                      <button
                        onClick={() => {
                          setCommandViewMode('list');
                          setEditingCommand(null);
                        }}
                        className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveCommandDetail}
                        className="px-6 py-3 rounded-xl bg-white text-black hover:bg-zinc-200 font-medium hover:shadow-lg hover:shadow-black/40 transition-all flex items-center space-x-2"
                      >
                        <Save className="w-4 h-4" />
                        <span>Save Changes</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {viewingPluginCommand === null ? (
              <div>
                <div className="flex items-center justify-between mb-6 titlebar-no-drag">
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-1">
                      Plugin Commands
                    </h2>
                    <p className="text-gray-400 text-sm">Commands from installed plugins</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search plugin commands..."
                        className="glass border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-white text-sm placeholder-zinc-500 focus:border-zinc-600 focus:outline-none w-56 transition-all"
                      />
                    </div>
                    <div className="flex items-center glass border border-zinc-800 rounded-xl p-0.5">
                      <button
                        onClick={() => setDisplayLayout('grid')}
                        className={`p-2 rounded-lg transition-all ${displayLayout === 'grid' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDisplayLayout('list')}
                        className={`p-2 rounded-lg transition-all ${displayLayout === 'list' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        <List className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {(() => {
                  const allPluginCmds = pluginDetails.flatMap((detail) =>
                    detail.commands.map((cmd) => ({ detail, cmd }))
                  );
                  const filtered = allPluginCmds.filter(({ detail, cmd }) => {
                    if (!searchQuery) return true;
                    const q = searchQuery.toLowerCase();
                    return cmd.name.toLowerCase().includes(q) || detail.pluginName.toLowerCase().includes(q);
                  });

                  if (filtered.length === 0 && allPluginCmds.length > 0) {
                    return (
                      <div className="glass border border-zinc-800 rounded-2xl p-12 text-center">
                        <Search className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                        <p className="text-zinc-400">No plugin commands matching &ldquo;{searchQuery}&rdquo;</p>
                      </div>
                    );
                  }

                  if (filtered.length === 0) {
                    return (
                      <div className="glass border border-zinc-800 rounded-2xl p-12 text-center">
                        <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400 mb-4">No plugin commands installed</p>
                      </div>
                    );
                  }

                  if (displayLayout === 'list') {
                    return (
                      <div className="space-y-2">
                        {filtered.map(({ detail, cmd }) => (
                          <div
                            key={`${detail.key}-${cmd.filename}`}
                            className="glass border border-zinc-800 rounded-xl px-4 py-3 card-hover cursor-pointer group flex items-center gap-4 transition-all"
                            onClick={() => handleViewPluginCommand(detail, cmd)}
                          >
                            <div className="p-2 rounded-lg bg-zinc-800/50 group-hover:bg-zinc-700/50 transition-all shrink-0">
                              <Package className="w-4 h-4 text-zinc-100" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-semibold text-white truncate">{cmd.name}</h3>
                              <p className="text-xs text-zinc-500 truncate">{detail.pluginName}@{detail.marketplaceName}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleViewPluginCommand(detail, cmd); }}
                                className="p-1.5 glass hover:border-zinc-600 border border-zinc-800 rounded-lg transition-all tooltip"
                                data-tooltip="View"
                              >
                                <Eye className="w-3.5 h-3.5 text-zinc-300" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filtered.map(({ detail, cmd }) => (
                        <div
                          key={`${detail.key}-${cmd.filename}`}
                          className="glass border border-zinc-800 rounded-2xl p-5 card-hover cursor-pointer group relative h-[180px] flex flex-col"
                          onClick={() => handleViewPluginCommand(detail, cmd)}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                              <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Plugin</span>
                            </div>
                            <div className="p-2 rounded-lg bg-zinc-800/50 group-hover:bg-zinc-700/50 transition-all">
                              <Package className="w-4 h-4 text-zinc-300" />
                            </div>
                          </div>
                          <h3 className="text-base font-bold text-white mb-1 truncate">{cmd.name}</h3>
                          <span className="text-[11px] text-zinc-500 mb-1.5">{detail.pluginName}@{detail.marketplaceName}</span>
                          <p className="text-gray-500 line-clamp-1 font-mono text-[11px] flex-1">{detail.pluginName}</p>
                          <div className="flex items-center gap-2 pt-3 border-t border-zinc-800/60 mt-auto">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleViewPluginCommand(detail, cmd); }}
                              className="flex-1 glass hover:border-zinc-600 border border-zinc-800 px-3 py-1.5 rounded-lg flex items-center justify-center space-x-1.5 transition-all"
                            >
                              <Eye className="w-3.5 h-3.5 text-zinc-300" />
                              <span className="text-[11px] text-zinc-300 font-medium">View</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div>
                <div className="flex items-center space-x-4 mb-8 relative z-[60]">
                  <button
                    onClick={() => setViewingPluginCommand(null)}
                    className="p-2 rounded-lg hover:bg-zinc-800 transition-colors titlebar-no-drag"
                  >
                    <ArrowLeft className="w-6 h-6 text-zinc-100" />
                  </button>
                  <div>
                    <h2 className="text-3xl font-bold  text-white">
                      {viewingPluginCommand.name}
                    </h2>
                    <span className="text-xs text-zinc-500">{viewingPluginCommand.pluginName}@{viewingPluginCommand.marketplaceName}</span>
                    <p className="text-gray-400">Plugin command (read-only)</p>
                  </div>
                </div>

                <div className="glass border border-zinc-800 rounded-2xl p-8">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Command Content</label>
                      <textarea
                        value={viewingPluginCommand.content}
                        readOnly
                        className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-zinc-600 focus:outline-none transition-all"
                        rows={20}
                      />
                    </div>

                    <div className="flex justify-end pt-6 border-t border-zinc-800">
                      <button
                        onClick={() => setViewingPluginCommand(null)}
                        className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showAddCommandModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-dark border border-zinc-700 rounded-2xl p-8 max-w-2xl w-full animate-slide-up shadow-2xl shadow-black/20 ">
            <h3 className="text-2xl font-bold  text-white mb-6">Add New Command</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Command Name</label>
                <input
                  type="text"
                  value={newCommandForm.name}
                  onChange={(e) => setNewCommandForm({ ...newCommandForm, name: e.target.value })}
                  className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-zinc-600 focus:outline-none transition-all input-focus"
                  placeholder="e.g., deploy.md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Command Content</label>
                <textarea
                  value={newCommandForm.content}
                  onChange={(e) => setNewCommandForm({ ...newCommandForm, content: e.target.value })}
                  className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-zinc-600 focus:outline-none transition-all input-focus"
                  rows={12}
                  placeholder="Enter your command script here..."
                />
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-8">
              <button
                onClick={() => {
                  setShowAddCommandModal(false);
                  setNewCommandForm({ name: '', content: '' });
                }}
                className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-zinc-800 transition-all "
              >
                Cancel
              </button>
              <button
                onClick={addNewCommand}
                className="px-6 py-3 rounded-xl bg-white text-black hover:bg-zinc-200 font-medium hover:shadow-lg hover:shadow-black/40 transition-all  pulse-ring "
              >
                Add Command
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
