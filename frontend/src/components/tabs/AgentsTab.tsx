import { useEffect, useState } from 'react';
import { ArrowLeft, Edit2, Eye, LayoutGrid, List, Package, Plus, Save, Search, Trash2, Users } from 'lucide-react';
import { saveAgent, getInstalledPluginDetails, getPluginAgentContent } from '../../api';
import type { Agent, ViewMode, InstalledPluginsFile, InstalledPluginDetails, PluginContentFile, ConfigScope } from '../../types';

interface AgentsTabProps {
  agents: Agent[];
  showNotification: (message: string, type?: 'success' | 'error') => void;
  loadConfig: (showProgress?: boolean) => Promise<void>;
  requestDelete: (name: string) => void;
  installedPlugins?: InstalledPluginsFile;
  projectPath?: string;
  scope?: ConfigScope;
}

export function AgentsTab({ agents, showNotification, loadConfig, requestDelete, installedPlugins = { version: 1, plugins: {} }, projectPath, scope }: AgentsTabProps) {
  const [agentsView, setAgentsView] = useState<'user' | 'plugin'>('user');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAgentForm, setNewAgentForm] = useState<{ name: string; content: string }>({ name: '', content: '' });
  const [pluginDetails, setPluginDetails] = useState<InstalledPluginDetails[]>([]);
  const [selectedPluginAgent, setSelectedPluginAgent] = useState<{ installPath: string; filename: string; name: string; pluginName: string; marketplaceName: string } | null>(null);
  const [pluginAgentContent, setPluginAgentContent] = useState('');
  const [pluginViewMode, setPluginViewMode] = useState<'list' | 'detail'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [displayLayout, setDisplayLayout] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    getInstalledPluginDetails().then(setPluginDetails).catch(() => {});
  }, [installedPlugins]);

  // Reset to non-plugin view when in project scope
  useEffect(() => {
    if (scope === 'project') { setAgentsView('user'); setSelectedPluginAgent(null); setPluginViewMode('list'); }
  }, [scope]);

  const openAgentDetail = (agent: Agent) => {
    setEditingAgent(agent);
    setViewMode('detail');
  };

  const saveAgentDetail = async () => {
    if (!editingAgent) return;

    const nameRegex = /^[a-z0-9-]{1,64}$/;
    if (!nameRegex.test(editingAgent.name)) {
      showNotification('Invalid agent name. Must use lowercase letters, numbers, and hyphens only (max 64 characters)', 'error');
      return;
    }

    try {
      await saveAgent({ name: editingAgent.name, content: editingAgent.content }, projectPath);
      showNotification('Agent saved successfully!');
      await loadConfig();
      setViewMode('list');
      setEditingAgent(null);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Failed to save agent', 'error');
    }
  };

  const addNewAgent = async () => {
    if (!newAgentForm.name || !newAgentForm.content) {
      showNotification('Please fill in agent name and content', 'error');
      return;
    }

    const nameRegex = /^[a-z0-9-]{1,64}$/;
    if (!nameRegex.test(newAgentForm.name)) {
      showNotification('Invalid agent name. Must use lowercase letters, numbers, and hyphens only (max 64 characters)', 'error');
      return;
    }

    try {
      await saveAgent({ name: newAgentForm.name, content: newAgentForm.content }, projectPath);
      showNotification('Agent created successfully!');
      await loadConfig();
      setShowAddModal(false);
      setNewAgentForm({ name: '', content: '' });
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Failed to create agent', 'error');
    }
  };

  const useAgentTemplate = () => {
    const template = `---
name: ${newAgentForm.name || 'agent-name'}
description: Brief description of what this Agent does
---

# ${newAgentForm.name ? newAgentForm.name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Agent Name'}

## Role
Describe the agent's role and capabilities.

## Instructions
Provide clear, step-by-step guidance for the agent.

## Constraints
List any limitations or rules the agent should follow.
`;
    setNewAgentForm({ ...newAgentForm, content: template });
  };

  const openPluginAgentDetail = async (detail: InstalledPluginDetails, agent: PluginContentFile) => {
    setSelectedPluginAgent({
      installPath: detail.installPath,
      filename: agent.filename,
      name: agent.name,
      pluginName: detail.pluginName,
      marketplaceName: detail.marketplaceName,
    });
    setPluginAgentContent('');
    setPluginViewMode('detail');
    try {
      const result = await getPluginAgentContent(detail.installPath, agent.filename);
      setPluginAgentContent(result.content);
    } catch {
      setPluginAgentContent('Failed to load agent content.');
    }
  };

  return (
    <>
      <div className="p-8">
        {/* Tab switcher */}
        {scope !== 'project' && (
        <div className="flex items-center space-x-1 glass border border-zinc-800 rounded-xl p-1 mb-6 titlebar-no-drag w-fit">
          <button
            onClick={() => { setAgentsView('user'); setSelectedPluginAgent(null); setPluginViewMode('list'); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${agentsView === 'user' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}
          >
            User Agents
          </button>
          <button
            onClick={() => { setAgentsView('plugin'); setSelectedPluginAgent(null); setPluginViewMode('list'); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${agentsView === 'plugin' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}
          >
            Plugin Agents
          </button>
        </div>
        )}

        {agentsView === 'user' ? (
          <>
            {viewMode === 'list' ? (
              <div>
                <div className="flex items-center justify-between mb-6 titlebar-no-drag">
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-2">User Agents</h2>
                    <p className="text-gray-400">Create and manage your Claude Code agents</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search agents..."
                        className="glass border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:border-zinc-600 focus:outline-none w-56 transition-all"
                      />
                    </div>
                    <div className="flex items-center glass border border-zinc-800 rounded-xl p-0.5">
                      <button
                        onClick={() => setDisplayLayout('grid')}
                        className={`p-1.5 rounded-lg transition-all ${displayLayout === 'grid' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDisplayLayout('list')}
                        className={`p-1.5 rounded-lg transition-all ${displayLayout === 'list' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        <List className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="glass hover:border-zinc-600 border border-zinc-800 px-5 py-2 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-black/20 group titlebar-no-drag"
                    >
                      <Plus className="w-4 h-4 text-zinc-100 group-hover:rotate-90 transition-transform duration-300" />
                      <span className="text-sm text-white font-medium">Add Agent</span>
                    </button>
                  </div>
                </div>

                {(() => {
                  const q = searchQuery.toLowerCase();
                  const filtered = q ? agents.filter(a => a.name.toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q) || a.content.toLowerCase().includes(q) || (a.model || '').toLowerCase().includes(q)) : agents;

                  if (filtered.length === 0 && agents.length > 0) {
                    return (
                      <div className="glass border border-zinc-800 rounded-2xl p-12 text-center">
                        <Search className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                        <p className="text-gray-400">No agents match "{searchQuery}"</p>
                      </div>
                    );
                  }

                  if (filtered.length === 0) {
                    return (
                      <div className="glass border border-zinc-800 rounded-2xl p-12 text-center">
                        <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400 mb-4">No agents yet</p>
                        <button
                          onClick={() => setShowAddModal(true)}
                          className="glass hover:border-zinc-600 border border-zinc-800 px-6 py-3 rounded-xl inline-flex items-center space-x-2"
                        >
                          <Plus className="w-5 h-5 text-zinc-100" />
                          <span className="text-white font-medium">Create Your First Agent</span>
                        </button>
                      </div>
                    );
                  }

                  if (displayLayout === 'list') {
                    return (
                      <div className="space-y-2">
                        {filtered.map((agent) => (
                          <div
                            key={agent.name}
                            className="glass border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4 card-hover cursor-pointer group transition-all"
                            onClick={() => openAgentDetail(agent)}
                          >
                            <div className="p-2 rounded-lg bg-zinc-800/50 group-hover:bg-zinc-700/50 transition-all shrink-0">
                              <Users className="w-4 h-4 text-zinc-100" />
                            </div>
                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
                            <h3 className="text-sm font-semibold text-white whitespace-nowrap">{agent.name}</h3>
                            {agent.model && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-purple-500/10 border border-purple-500/20 text-purple-400 shrink-0">
                                {agent.model}
                              </span>
                            )}
                            <p className="text-xs text-zinc-500 truncate flex-1 min-w-0">{agent.description || agent.content.substring(0, 120)}</p>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); openAgentDetail(agent); }}
                                className="p-1.5 glass hover:border-zinc-600 border border-zinc-800 rounded-lg transition-all tooltip"
                                data-tooltip="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-zinc-300" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); requestDelete(agent.name); }}
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filtered.map((agent) => (
                        <div
                          key={agent.name}
                          className="glass border border-zinc-800 rounded-2xl p-4 card-hover cursor-pointer group relative h-[180px] flex flex-col"
                          onClick={() => openAgentDetail(agent)}
                        >
                          <div className="flex items-center space-x-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-[11px] font-medium text-zinc-400">Agent</span>
                            {agent.model && (
                              <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-purple-500/10 border border-purple-500/20 text-purple-400">
                                {agent.model}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2.5 mb-2">
                            <div className="p-2 rounded-lg bg-zinc-800/50 group-hover:bg-zinc-700/50 transition-all">
                              <Users className="w-4 h-4 text-zinc-100" />
                            </div>
                            <h3 className="text-base font-bold text-white truncate">{agent.name}</h3>
                          </div>
                          <p className="text-xs text-zinc-500 line-clamp-2 flex-1">{agent.description || agent.content.substring(0, 100) + '...'}</p>
                          <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-800 mt-auto">
                            <button
                              onClick={(e) => { e.stopPropagation(); openAgentDetail(agent); }}
                              className="flex-1 glass hover:border-zinc-600 border border-zinc-800 px-3 py-1.5 rounded-lg flex items-center justify-center space-x-1.5 transition-all"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-zinc-100" />
                              <span className="text-xs text-white font-medium">Edit</span>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); requestDelete(agent.name); }}
                              className="p-1.5 glass hover:border-red-700/50 border border-red-900/50 rounded-lg transition-all tooltip"
                              data-tooltip="Delete agent"
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
                      setViewMode('list');
                      setEditingAgent(null);
                    }}
                    className="p-2 rounded-lg hover:bg-zinc-800 transition-colors titlebar-no-drag"
                  >
                    <ArrowLeft className="w-6 h-6 text-zinc-100" />
                  </button>
                  <div>
                    <h2 className="text-3xl font-bold  text-white">{editingAgent?.name}</h2>
                    <p className="text-gray-400">Edit agent content</p>
                  </div>
                </div>

                <div className="glass border border-zinc-800 rounded-2xl p-8">
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-300">Agent Name</label>
                        <span className="text-xs text-gray-500">lowercase, numbers, hyphens only (max 64 chars)</span>
                      </div>
                      <input
                        type="text"
                        value={editingAgent?.name || ''}
                        disabled
                        className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-gray-500 bg-zinc-900/50 cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Agent Content</label>
                      <textarea
                        value={editingAgent?.content || ''}
                        onChange={(e) => setEditingAgent((prev) => (prev ? { ...prev, content: e.target.value } : null))}
                        className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-zinc-600 focus:outline-none transition-all input-focus"
                        rows={20}
                        placeholder="---
name: agent-name
description: Brief description of what this Agent does
---

# Agent Name

## Role
Describe the agent's role and capabilities.

## Instructions
Provide clear, step-by-step guidance for the agent.

## Constraints
List any limitations or rules the agent should follow."
                      />
                    </div>

                    <div className="flex justify-end space-x-4 pt-6 border-t border-zinc-800">
                      <button
                        onClick={() => {
                          setViewMode('list');
                          setEditingAgent(null);
                        }}
                        className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveAgentDetail}
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
            {pluginViewMode === 'list' ? (
              <div>
                <div className="flex items-center justify-between mb-6 titlebar-no-drag">
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Plugin Agents</h2>
                    <p className="text-gray-400">Agents provided by installed plugins</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search plugins..."
                        className="glass border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:border-zinc-600 focus:outline-none w-56 transition-all"
                      />
                    </div>
                    <div className="flex items-center glass border border-zinc-800 rounded-xl p-0.5">
                      <button
                        onClick={() => setDisplayLayout('grid')}
                        className={`p-1.5 rounded-lg transition-all ${displayLayout === 'grid' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDisplayLayout('list')}
                        className={`p-1.5 rounded-lg transition-all ${displayLayout === 'list' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        <List className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {(() => {
                  const pluginAgents: { detail: InstalledPluginDetails; agent: PluginContentFile }[] = [];
                  for (const detail of pluginDetails) {
                    for (const agent of detail.agents) {
                      pluginAgents.push({ detail, agent });
                    }
                  }

                  const q = searchQuery.toLowerCase();
                  const filtered = q ? pluginAgents.filter(({ detail, agent }) => agent.name.toLowerCase().includes(q) || detail.pluginName.toLowerCase().includes(q) || (agent.model || '').toLowerCase().includes(q) || detail.marketplaceName.toLowerCase().includes(q)) : pluginAgents;

                  if (filtered.length === 0 && pluginAgents.length > 0) {
                    return (
                      <div className="glass border border-zinc-800 rounded-2xl p-12 text-center">
                        <Search className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                        <p className="text-gray-400">No plugin agents match "{searchQuery}"</p>
                      </div>
                    );
                  }

                  if (filtered.length === 0) {
                    return (
                      <div className="glass border border-zinc-800 rounded-2xl p-12 text-center">
                        <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400 mb-4">No plugin agents installed</p>
                      </div>
                    );
                  }

                  if (displayLayout === 'list') {
                    return (
                      <div className="space-y-2">
                        {filtered.map(({ detail, agent }) => (
                          <div
                            key={`${detail.key}-${agent.filename}`}
                            className="glass border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4 card-hover cursor-pointer group transition-all"
                            onClick={() => openPluginAgentDetail(detail, agent)}
                          >
                            <div className="p-2 rounded-lg bg-zinc-800/50 group-hover:bg-zinc-700/50 transition-all shrink-0">
                              <Package className="w-4 h-4 text-zinc-100" />
                            </div>
                            <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse shrink-0" />
                            <h3 className="text-sm font-semibold text-white whitespace-nowrap">{agent.name}</h3>
                            {agent.model && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-purple-500/10 border border-purple-500/20 text-purple-400 shrink-0">
                                {agent.model}
                              </span>
                            )}
                            <p className="text-xs text-zinc-500 truncate flex-1 min-w-0">{detail.marketplaceName}/{detail.pluginName}</p>
                            <button
                              onClick={(e) => { e.stopPropagation(); openPluginAgentDetail(detail, agent); }}
                              className="p-1.5 glass hover:border-zinc-600 border border-zinc-800 rounded-lg transition-all tooltip shrink-0"
                              data-tooltip="View"
                            >
                              <Eye className="w-3.5 h-3.5 text-zinc-300" />
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filtered.map(({ detail, agent }) => (
                        <div
                          key={`${detail.key}-${agent.filename}`}
                          className="glass border border-zinc-800 rounded-2xl p-4 h-[180px] flex flex-col card-hover cursor-pointer group transition-all"
                          onClick={() => openPluginAgentDetail(detail, agent)}
                        >
                          <div className="flex items-center space-x-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                            <span className="text-[11px] font-medium text-zinc-400">Plugin</span>
                            {agent.model && (
                              <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-purple-500/10 border border-purple-500/20 text-purple-400">
                                {agent.model}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2.5 mb-2">
                            <div className="p-2 rounded-lg bg-zinc-800/50 group-hover:bg-zinc-700/50 transition-all">
                              <Package className="w-4 h-4 text-zinc-100" />
                            </div>
                            <h3 className="text-base font-bold text-white truncate">{agent.name}</h3>
                          </div>
                          <p className="text-xs text-zinc-500 truncate">{detail.marketplaceName}/{detail.pluginName}</p>
                          <div className="flex-1" />
                          <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-800 mt-auto">
                            <button
                              onClick={(e) => { e.stopPropagation(); openPluginAgentDetail(detail, agent); }}
                              className="flex-1 glass hover:border-zinc-600 border border-zinc-800 px-3 py-1.5 rounded-lg flex items-center justify-center space-x-1.5 transition-all"
                            >
                              <Eye className="w-3.5 h-3.5 text-zinc-100" />
                              <span className="text-xs text-white font-medium">View</span>
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
                      setSelectedPluginAgent(null);
                      setPluginViewMode('list');
                    }}
                    className="p-2 rounded-lg hover:bg-zinc-800 transition-colors titlebar-no-drag"
                  >
                    <ArrowLeft className="w-6 h-6 text-zinc-100" />
                  </button>
                  <div>
                    <h2 className="text-3xl font-bold text-white">{selectedPluginAgent?.name}</h2>
                    <p className="text-sm text-zinc-400 mt-1">{selectedPluginAgent?.marketplaceName}/{selectedPluginAgent?.pluginName}</p>
                  </div>
                </div>

                <div className="glass border border-zinc-800 rounded-2xl p-8">
                  <pre className="glass border border-zinc-800 rounded-xl p-6 text-white font-mono text-sm whitespace-pre-wrap">
                    {pluginAgentContent || 'Loading...'}
                  </pre>

                  <div className="flex justify-end pt-6 border-t border-zinc-800 mt-6">
                    <button
                      onClick={() => {
                        setSelectedPluginAgent(null);
                        setPluginViewMode('list');
                      }}
                      className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
                    >
                      Back
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-dark border border-zinc-700 rounded-2xl p-8 max-w-2xl w-full animate-slide-up shadow-2xl shadow-black/20 ">
            <h3 className="text-2xl font-bold  text-white mb-6">Add New Agent</h3>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-300">Agent Name</label>
                  <span className="text-xs text-gray-500">lowercase, numbers, hyphens only (max 64 chars)</span>
                </div>
                <input
                  type="text"
                  value={newAgentForm.name}
                  onChange={(e) => setNewAgentForm({ ...newAgentForm, name: e.target.value })}
                  className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-zinc-600 focus:outline-none transition-all input-focus"
                  placeholder="e.g., code-reviewer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-300">Agent Content</label>
                  <button onClick={useAgentTemplate} className="text-xs text-zinc-100 hover:text-purple-300 transition-colors">
                    Use Template
                  </button>
                </div>
                <textarea
                  value={newAgentForm.content}
                  onChange={(e) => setNewAgentForm({ ...newAgentForm, content: e.target.value })}
                  className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-zinc-600 focus:outline-none transition-all input-focus"
                  rows={15}
                  placeholder="---
name: agent-name
description: Brief description of what this Agent does
---

# Agent Name

## Role
Describe the agent's role and capabilities.

## Instructions
Provide clear, step-by-step guidance for the agent.

## Constraints
List any limitations or rules the agent should follow."
                />
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-8">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewAgentForm({ name: '', content: '' });
                }}
                className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-zinc-800 transition-all "
              >
                Cancel
              </button>
              <button
                onClick={addNewAgent}
                className="px-6 py-3 rounded-xl bg-white text-black hover:bg-zinc-200 font-medium hover:shadow-lg hover:shadow-black/40 transition-all  pulse-ring "
              >
                Add Agent
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
