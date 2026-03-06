import { useEffect, useState } from 'react';
import { ArrowLeft, Edit2, Eye, Package, Plus, Save, Trash2, Users } from 'lucide-react';
import { saveAgent, getInstalledPluginDetails, getPluginAgentContent } from '../../api';
import type { Agent, ViewMode, InstalledPluginsFile, InstalledPluginDetails, PluginContentFile } from '../../types';

interface AgentsTabProps {
  agents: Agent[];
  showNotification: (message: string, type?: 'success' | 'error') => void;
  loadConfig: (showProgress?: boolean) => Promise<void>;
  requestDelete: (name: string) => void;
  installedPlugins?: InstalledPluginsFile;
}

export function AgentsTab({ agents, showNotification, loadConfig, requestDelete, installedPlugins = { version: 1, plugins: {} } }: AgentsTabProps) {
  const [agentsView, setAgentsView] = useState<'user' | 'plugin'>('user');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAgentForm, setNewAgentForm] = useState<{ name: string; content: string }>({ name: '', content: '' });
  const [pluginDetails, setPluginDetails] = useState<InstalledPluginDetails[]>([]);
  const [selectedPluginAgent, setSelectedPluginAgent] = useState<{ installPath: string; filename: string; name: string; pluginName: string; marketplaceName: string } | null>(null);
  const [pluginAgentContent, setPluginAgentContent] = useState('');
  const [pluginViewMode, setPluginViewMode] = useState<'list' | 'detail'>('list');

  useEffect(() => {
    getInstalledPluginDetails().then(setPluginDetails).catch(() => {});
  }, [installedPlugins]);

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
      await saveAgent({ name: editingAgent.name, content: editingAgent.content });
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
      await saveAgent({ name: newAgentForm.name, content: newAgentForm.content });
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

        {agentsView === 'user' ? (
          <>
            {viewMode === 'list' ? (
              <div>
                <div className="flex items-center justify-between mb-8 titlebar-no-drag">
                  <div>
                    <h2 className="text-3xl font-bold  text-white mb-2">
                      User Agents
                    </h2>
                    <p className="text-gray-400">Create and manage your Claude Code agents</p>
                  </div>
                  <div>
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="glass hover:border-zinc-600 border border-zinc-800 px-6 py-3 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-black/20 group   titlebar-no-drag"
                    >
                      <Plus className="w-5 h-5 text-zinc-100 group-hover:rotate-90 transition-transform duration-300" />
                      <span className="text-white font-medium">Add Agent</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {agents.map((agent) => (
                    <div
                      key={agent.name}
                      className="glass border border-zinc-800 rounded-2xl p-6 card-hover cursor-pointer group  relative h-[320px] flex flex-col"
                      onClick={() => openAgentDetail(agent)}
                    >
                      <div className="flex items-center space-x-2 mb-4">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                        <span className="text-xs font-medium text-zinc-300">Agent</span>
                        {agent.model && (
                          <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-500/10 border border-purple-500/20 text-purple-400">
                            {agent.model}
                          </span>
                        )}
                      </div>

                      <div className="flex items-start mb-4">
                        <div className="p-3 rounded-xl bg-zinc-800/50 group-hover:bg-zinc-700/50 transition-all ">
                          <Users className="w-6 h-6 text-zinc-100" />
                        </div>
                      </div>

                      <h3 className="text-xl font-bold text-white mb-2 transition-all cursor-pointer">{agent.name}</h3>

                      <div className="space-y-2 text-sm mb-4 flex-1">
                        <p className="text-gray-400 line-clamp-3 text-xs">{agent.description || agent.content.substring(0, 100) + '...'}</p>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-4 border-t border-zinc-800 mt-auto">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openAgentDetail(agent);
                          }}
                          className="flex-1 glass hover:border-zinc-600 border border-zinc-800 px-4 py-2 rounded-xl flex items-center justify-center space-x-2 transition-all"
                        >
                          <Edit2 className="w-4 h-4 text-zinc-100" />
                          <span className="text-xs text-white font-medium">Edit</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            requestDelete(agent.name);
                          }}
                          className="p-2 glass hover:border-red-700/50 border border-red-900/50 rounded-xl transition-all tooltip"
                          data-tooltip="Delete agent"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {agents.length === 0 && (
                    <div className="col-span-full glass border border-zinc-800 rounded-2xl p-12 text-center">
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
                  )}
                </div>
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
                <div className="flex items-center justify-between mb-8 titlebar-no-drag">
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Plugin Agents</h2>
                    <p className="text-gray-400">Agents provided by installed plugins</p>
                  </div>
                </div>

                {(() => {
                  const pluginAgents: { detail: InstalledPluginDetails; agent: PluginContentFile }[] = [];
                  for (const detail of pluginDetails) {
                    for (const agent of detail.agents) {
                      pluginAgents.push({ detail, agent });
                    }
                  }

                  if (pluginAgents.length === 0) {
                    return (
                      <div className="glass border border-zinc-800 rounded-2xl p-12 text-center">
                        <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400 mb-4">No plugin agents installed</p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {pluginAgents.map(({ detail, agent }) => (
                        <div
                          key={`${detail.key}-${agent.filename}`}
                          className="glass border border-zinc-800 rounded-2xl p-6 h-[320px] flex flex-col"
                        >
                          <div className="flex items-center space-x-2 mb-4">
                            <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></div>
                            <span className="text-xs font-medium text-zinc-300">Plugin</span>
                            {agent.model && (
                              <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-500/10 border border-purple-500/20 text-purple-400">
                                {agent.model}
                              </span>
                            )}
                          </div>

                          <div className="flex items-start mb-4">
                            <div className="p-3 rounded-xl bg-zinc-800/50">
                              <Package className="w-6 h-6 text-zinc-100" />
                            </div>
                          </div>

                          <h3 className="text-xl font-bold text-white mb-2">{agent.name}</h3>
                          <p className="text-xs text-zinc-500 mb-2">{detail.marketplaceName}/{detail.pluginName}</p>

                          <div className="flex-1" />

                          <div className="flex items-center justify-between gap-2 pt-4 border-t border-zinc-800 mt-auto">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openPluginAgentDetail(detail, agent);
                              }}
                              className="flex-1 glass hover:border-zinc-600 border border-zinc-800 px-4 py-2 rounded-xl flex items-center justify-center space-x-2 transition-all"
                            >
                              <Eye className="w-4 h-4 text-zinc-100" />
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
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-xs text-zinc-500">{selectedPluginAgent?.pluginName}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {selectedPluginAgent?.marketplaceName}
                      </span>
                    </div>
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
