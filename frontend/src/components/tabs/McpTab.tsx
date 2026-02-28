import { useState } from 'react';
import { ArrowLeft, Code, Copy, Edit2, FileText, Play, Plus, RotateCw, Save, Server, Square, Trash2, X } from 'lucide-react';
import { saveClaudeConfig, restartMcpServer, startMcpServer, stopMcpServer } from '../../api';
import { ServerLogs } from '../ServerLogs';
import type { ClaudeConfig, McpServer, McpStatus, ViewMode } from '../../types';

interface McpTabProps {
  claudeConfig: ClaudeConfig;
  setClaudeConfig: React.Dispatch<React.SetStateAction<ClaudeConfig>>;
  mcpStatuses: Record<string, McpStatus>;
  setMcpStatuses: React.Dispatch<React.SetStateAction<Record<string, McpStatus>>>;
  isLoadingStatus: Record<string, boolean>;
  setIsLoadingStatus: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  showNotification: (message: string, type?: 'success' | 'error') => void;
  loadConfig: (showProgress?: boolean) => Promise<void>;
  requestDelete: (itemName: string) => void;
}

export function McpTab({
  claudeConfig,
  setClaudeConfig,
  mcpStatuses,
  setMcpStatuses,
  isLoadingStatus,
  setIsLoadingStatus,
  showNotification,
  requestDelete,
}: McpTabProps) {
  const [mcpViewMode, setMcpViewMode] = useState<ViewMode>('list');
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);
  const [editingServerArgsInput, setEditingServerArgsInput] = useState('');
  const [editingServerEnvInput, setEditingServerEnvInput] = useState('');

  const [showAddServerModal, setShowAddServerModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logsServerName, setLogsServerName] = useState<string | null>(null);
  const [showImportJsonModal, setShowImportJsonModal] = useState(false);
  const [importJsonContent, setImportJsonContent] = useState('');
  const [newServerForm, setNewServerForm] = useState({ name: '', command: '', args: '', env: '' });

  const openServerDetail = (serverName: string) => {
    setSelectedServer(serverName);
    const server = claudeConfig.mcpServers?.[serverName] || { command: '', args: [], env: {} };
    setEditingServer(server);
    setEditingServerArgsInput(server.args?.join(', ') || '');
    setEditingServerEnvInput(JSON.stringify(server.env || {}, null, 2));
    setMcpViewMode('detail');
  };

  const closeServerDetail = () => {
    setMcpViewMode('list');
    setSelectedServer(null);
    setEditingServer(null);
    setEditingServerArgsInput('');
    setEditingServerEnvInput('');
  };

  const saveServerDetail = async () => {
    if (!selectedServer || !editingServer) return;

    let argsArray: string[] = [];
    if (editingServerArgsInput.trim() !== '') {
      argsArray = editingServerArgsInput.split(',').map((a) => a.trim()).filter((a) => a !== '');
      const hasInvalidArgs = editingServerArgsInput.split(',').some((a) => a.trim() === '');
      if (hasInvalidArgs) {
        showNotification('Arguments cannot contain empty values. Please remove extra commas.', 'error');
        return;
      }
    }

    let envObject: Record<string, string> = {};
    if (editingServerEnvInput.trim() !== '') {
      try {
        envObject = JSON.parse(editingServerEnvInput);
        if (typeof envObject !== 'object' || envObject === null || Array.isArray(envObject)) {
          throw new Error('Environment variables must be a valid JSON object');
        }
      } catch (error) {
        showNotification(`Invalid JSON format: ${error instanceof Error ? error.message : 'Unable to parse JSON'}`, 'error');
        return;
      }
    }

    const cleanedServer: McpServer = { ...editingServer, args: argsArray, env: envObject };
    const newConfig = {
      ...claudeConfig,
      mcpServers: {
        ...claudeConfig.mcpServers,
        [selectedServer]: cleanedServer,
      },
    };

    setClaudeConfig(newConfig);
    closeServerDetail();

    try {
      await saveClaudeConfig(newConfig);
      showNotification('Server updated successfully!');
    } catch {
      showNotification('Failed to save server update', 'error');
    }
  };

  const addNewServer = async () => {
    if (!newServerForm.name || !newServerForm.command) {
      showNotification('Please fill in server name and command', 'error');
      return;
    }

    let envObject: Record<string, string> = {};
    if (newServerForm.env) {
      try {
        envObject = JSON.parse(newServerForm.env);
        if (typeof envObject !== 'object' || envObject === null) {
          throw new Error('Environment variables must be a valid JSON object');
        }
      } catch (error) {
        showNotification(`Invalid JSON format: ${error instanceof Error ? error.message : 'Unable to parse JSON'}`, 'error');
        return;
      }
    }

    const newServer: McpServer = {
      command: newServerForm.command,
      args: newServerForm.args ? newServerForm.args.split(',').map((a) => a.trim()) : [],
      env: envObject,
    };

    const newConfig = {
      ...claudeConfig,
      mcpServers: {
        ...claudeConfig.mcpServers,
        [newServerForm.name]: newServer,
      },
    };

    setClaudeConfig(newConfig);
    setShowAddServerModal(false);
    setNewServerForm({ name: '', command: '', args: '', env: '' });

    try {
      await saveClaudeConfig(newConfig);
      showNotification('Server added successfully!');
    } catch {
      showNotification('Failed to save new server', 'error');
    }
  };

  const startServer = async (serverName: string) => {
    setIsLoadingStatus((prev) => ({ ...prev, [serverName]: true }));
    try {
      const data = await startMcpServer(serverName);
      showNotification(`Server "${serverName}" started successfully! PID: ${data.pid}`);
      setMcpStatuses((prev) => ({ ...prev, [serverName]: { status: 'running', running: true, pid: data.pid } }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showNotification(`❌ Failed to start "${serverName}": ${errorMessage}`, 'error');
      setMcpStatuses((prev) => ({
        ...prev,
        [serverName]: { status: 'error', running: false, error: errorMessage },
      }));
    } finally {
      setIsLoadingStatus((prev) => ({ ...prev, [serverName]: false }));
    }
  };

  const stopServer = async (serverName: string) => {
    setIsLoadingStatus((prev) => ({ ...prev, [serverName]: true }));
    try {
      await stopMcpServer(serverName);
      showNotification(`Server "${serverName}" stopped`);
      setMcpStatuses((prev) => ({ ...prev, [serverName]: { status: 'stopping', running: false } }));
    } catch (error) {
      showNotification(`Failed to stop server: ${error}`, 'error');
    } finally {
      setIsLoadingStatus((prev) => ({ ...prev, [serverName]: false }));
    }
  };

  const restartServer = async (serverName: string) => {
    setIsLoadingStatus((prev) => ({ ...prev, [serverName]: true }));
    try {
      showNotification(`Restarting server "${serverName}"...`, 'success');
      const data = await restartMcpServer(serverName);
      showNotification(`Server "${serverName}" restarted! PID: ${data.pid}`);
    } catch (error) {
      showNotification(`Failed to restart server: ${error}`, 'error');
    } finally {
      setIsLoadingStatus((prev) => ({ ...prev, [serverName]: false }));
    }
  };

  const importMcpConfigFromJson = async () => {
    if (!importJsonContent.trim()) {
      showNotification('Please enter JSON content', 'error');
      return;
    }

    try {
      const importedServers = JSON.parse(importJsonContent);
      if (typeof importedServers !== 'object' || importedServers === null) {
        throw new Error('JSON must be an object');
      }

      const validatedServers: Record<string, McpServer> = {};
      for (const [name, serverConfig] of Object.entries(importedServers)) {
        if (typeof serverConfig !== 'object' || serverConfig === null) {
          throw new Error(`Server "${name}" must be a valid object`);
        }

        const server = serverConfig as { command?: string; args?: string[]; env?: Record<string, string> };
        if (!server.command || typeof server.command !== 'string') {
          throw new Error(`Server "${name}" must have a valid "command" field`);
        }

        validatedServers[name] = {
          command: server.command,
          args: Array.isArray(server.args) ? server.args : [],
          env: typeof server.env === 'object' && server.env !== null ? server.env : {},
        };
      }

      const newConfig = {
        ...claudeConfig,
        mcpServers: {
          ...claudeConfig.mcpServers,
          ...validatedServers,
        },
      };

      setClaudeConfig(newConfig);
      setShowImportJsonModal(false);
      setImportJsonContent('');

      await saveClaudeConfig(newConfig);
      showNotification(`Successfully imported ${Object.keys(validatedServers).length} server(s)!`);
    } catch (error) {
      showNotification(`Invalid JSON format: ${error instanceof Error ? error.message : 'Unable to parse JSON'}`, 'error');
    }
  };

  return (
    <>
      <div className="p-8">
        {mcpViewMode === 'list' ? (
          <div>
            <div className="flex items-center justify-between mb-8 titlebar-no-drag">
              <div>
                <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-2">
                  MCP Servers
                </h2>
                <p className="text-gray-400">Manage your Model Context Protocol servers</p>
              </div>
              <div className="flex space-x-4 titlebar-no-drag">
                <button
                  onClick={() => setShowAddServerModal(true)}
                  className="glass hover:border-purple-500/50 border border-purple-500/20 px-6 py-3 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-purple-500/20 group ripple-effect neon-glow titlebar-no-drag"
                >
                  <Plus className="w-5 h-5 text-purple-400 group-hover:rotate-90 transition-transform duration-300" />
                  <span className="text-white font-medium">Add Server</span>
                </button>
                <button
                  onClick={() => setShowImportJsonModal(true)}
                  className="glass hover:border-blue-500/50 border border-blue-500/20 px-6 py-3 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-blue-500/20 group ripple-effect titlebar-no-drag"
                >
                  <Code className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform duration-300" />
                  <span className="text-white font-medium">Import JSON</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(claudeConfig.mcpServers || {}).map(([name, server]) => {
                const status = mcpStatuses[name];
                const isRunning = status?.running || false;
                const isLoading = isLoadingStatus[name] || false;

                return (
                  <div
                    key={name}
                    className="glass border border-purple-500/20 rounded-2xl p-6 group gradient-border relative h-[320px] flex flex-col card-hover cursor-pointer"
                  >
                    <div className="mb-4 flex items-center space-x-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isRunning
                            ? 'bg-green-400 animate-pulse'
                            : status?.status === 'stopping'
                              ? 'bg-yellow-400 animate-pulse'
                              : status?.status === 'error'
                                ? 'bg-red-400 animate-pulse'
                                : 'bg-gray-500'
                        }`}
                      ></div>
                      <span
                        className={`text-xs font-medium ${
                          isRunning
                            ? 'text-green-400'
                            : status?.status === 'stopping'
                              ? 'text-yellow-400'
                              : status?.status === 'error'
                                ? 'text-red-400'
                                : 'text-gray-500'
                        }`}
                      >
                        {isRunning
                          ? 'Running'
                          : status?.status === 'stopping'
                            ? 'Stopping'
                            : status?.status === 'error'
                              ? 'Error'
                              : 'Stopped'}
                      </span>
                      {status?.pid && <span className="text-[10px] text-gray-500 ml-1">PID: {status.pid}</span>}
                    </div>

                    <div className="flex items-start mb-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 group-hover:from-purple-500/30 group-hover:to-blue-500/30 transition-all neon-glow">
                        <Server className="w-6 h-6 text-purple-400" />
                      </div>
                    </div>

                    <h3 className="text-xl font-bold text-white mb-2 transition-all cursor-pointer" onClick={() => openServerDetail(name)}>
                      {name}
                    </h3>

                    <div className="space-y-2 text-sm mb-4 flex-1">
                      <div className="flex items-center space-x-2">
                        <Code className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-400 font-mono text-xs truncate">{server.command}</span>
                      </div>
                      {server.args && server.args.length > 0 && (
                        <div className="flex items-center space-x-1 ml-6">
                          <div className="px-2 py-1 bg-purple-500/10 rounded text-xs text-purple-400">
                            {server.args.length} arg{server.args.length > 1 ? 's' : ''}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-4 border-t border-purple-500/20 mt-auto">
                      {isRunning ? (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setLogsServerName(name);
                              setShowLogsModal(true);
                            }}
                            className="flex-1 glass hover:border-blue-500/50 border border-blue-500/20 px-3 py-2 rounded-xl flex items-center justify-center space-x-1 transition-all ripple-effect tooltip text-xs"
                            data-tooltip="View logs"
                          >
                            <FileText className="w-4 h-4 text-blue-400" />
                            <span className="text-blue-400 hidden sm:inline">Logs</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              restartServer(name);
                            }}
                            disabled={isLoading}
                            className="flex-1 glass hover:border-yellow-500/50 border border-yellow-500/20 px-3 py-2 rounded-xl flex items-center justify-center space-x-1 transition-all ripple-effect tooltip text-xs disabled:opacity-50"
                            data-tooltip="Restart server"
                          >
                            <RotateCw className={`w-4 h-4 text-yellow-400 ${isLoading ? 'animate-spin' : ''}`} />
                            <span className="text-yellow-400 hidden sm:inline">Restart</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              stopServer(name);
                            }}
                            disabled={isLoading}
                            className="flex-1 glass hover:border-red-500/50 border border-red-500/20 px-3 py-2 rounded-xl flex items-center justify-center space-x-1 transition-all ripple-effect tooltip text-xs disabled:opacity-50"
                            data-tooltip="Stop server"
                          >
                            <Square className="w-4 h-4 text-red-400" />
                            <span className="text-red-400 hidden sm:inline">Stop</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const serverJson = JSON.stringify({ [name]: server }, null, 2);
                              navigator.clipboard.writeText(serverJson);
                              showNotification('MCP configuration copied to clipboard!');
                            }}
                            className="p-2 glass hover:border-cyan-500/50 border border-cyan-500/20 rounded-xl transition-all tooltip"
                            data-tooltip="Copy JSON"
                          >
                            <Copy className="w-4 h-4 text-cyan-400" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startServer(name);
                            }}
                            disabled={isLoading}
                            className="flex-1 bg-gradient-to-r from-green-500/20 to-emerald-500/20 hover:from-green-500/30 hover:to-emerald-500/30 border border-green-500/20 px-3 py-2 rounded-xl flex items-center justify-center space-x-1 transition-all ripple-effect text-xs"
                          >
                            <Play className={`w-4 h-4 text-green-400 ${isLoading ? 'animate-pulse' : ''}`} />
                            <span className="text-green-400 font-medium">{isLoading ? 'Starting...' : 'Start'}</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const serverJson = JSON.stringify({ [name]: server }, null, 2);
                              navigator.clipboard.writeText(serverJson);
                              showNotification('MCP configuration copied to clipboard!');
                            }}
                            className="p-2 glass hover:border-cyan-500/50 border border-cyan-500/20 rounded-xl transition-all tooltip"
                            data-tooltip="Copy JSON"
                          >
                            <Copy className="w-4 h-4 text-cyan-400" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openServerDetail(name);
                            }}
                            className="p-2 glass hover:border-purple-500/50 border border-purple-500/20 rounded-xl transition-all tooltip"
                            data-tooltip="Edit server"
                          >
                            <Edit2 className="w-4 h-4 text-purple-400" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              requestDelete(name);
                            }}
                            className="p-2 glass hover:border-red-500/50 border border-red-500/20 rounded-xl transition-all tooltip"
                            data-tooltip="Delete server"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {Object.keys(claudeConfig.mcpServers || {}).length === 0 && (
                <div className="col-span-full glass border border-purple-500/20 rounded-2xl p-12 text-center">
                  <Server className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 mb-4">No MCP servers configured yet</p>
                  <button
                    onClick={() => setShowAddServerModal(true)}
                    className="glass hover:border-purple-500/50 border border-purple-500/20 px-6 py-3 rounded-xl inline-flex items-center space-x-2"
                  >
                    <Plus className="w-5 h-5 text-purple-400" />
                    <span className="text-white font-medium">Add Your First Server</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center space-x-4 mb-8 relative z-[60]">
              <button onClick={closeServerDetail} className="p-2 rounded-lg hover:bg-purple-500/20 transition-colors titlebar-no-drag">
                <ArrowLeft className="w-6 h-6 text-purple-400" />
              </button>
              <div className="flex-1">
                <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
                  {selectedServer}
                </h2>
                <p className="text-gray-400">Edit server configuration</p>
              </div>
            </div>

            <div className="glass border border-purple-500/20 rounded-2xl p-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Command</label>
                  <input
                    type="text"
                    value={editingServer?.command || ''}
                    onChange={(e) => setEditingServer((prev) => (prev ? { ...prev, command: e.target.value } : null))}
                    className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-colors"
                    placeholder="e.g., npx"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Arguments (comma-separated)</label>
                  <input
                    type="text"
                    value={editingServerArgsInput}
                    onChange={(e) => setEditingServerArgsInput(e.target.value)}
                    className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-colors"
                    placeholder="e.g., -y, @modelcontextprotocol/server-filesystem"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Environment Variables (JSON)</label>
                  <textarea
                    value={editingServerEnvInput}
                    onChange={(e) => setEditingServerEnvInput(e.target.value)}
                    className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-purple-500/50 focus:outline-none transition-colors"
                    rows={6}
                    placeholder={'{\n  "KEY": "value"\n}'}
                  />
                  <p className="text-xs text-gray-500 mt-1">Enter a valid JSON object. Validation will occur when you save.</p>
                </div>

                {selectedServer && mcpStatuses[selectedServer]?.running && (
                  <div className="mt-6 pt-6 border-t border-purple-500/20">
                    <ServerLogs serverName={selectedServer} />
                  </div>
                )}

                <div className="flex justify-end space-x-4 pt-6 border-t border-purple-500/20">
                  <button onClick={closeServerDetail} className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={saveServerDetail}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-purple-500/50 transition-all flex items-center space-x-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save Changes</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showAddServerModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-dark border border-purple-500/30 rounded-2xl p-8 max-w-2xl w-full animate-slide-up shadow-2xl shadow-purple-500/20 neon-glow">
            <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-6">Add New Server</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Server Name</label>
                <input
                  type="text"
                  value={newServerForm.name}
                  onChange={(e) => setNewServerForm({ ...newServerForm, name: e.target.value })}
                  className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-all input-focus"
                  placeholder="e.g., mcp-filesystem"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Command</label>
                <input
                  type="text"
                  value={newServerForm.command}
                  onChange={(e) => setNewServerForm({ ...newServerForm, command: e.target.value })}
                  className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-all input-focus"
                  placeholder="e.g., npx"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Arguments (comma-separated)</label>
                <input
                  type="text"
                  value={newServerForm.args}
                  onChange={(e) => setNewServerForm({ ...newServerForm, args: e.target.value })}
                  className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-all input-focus"
                  placeholder="e.g., -y, @modelcontextprotocol/server-filesystem"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Environment Variables (JSON)</label>
                <textarea
                  value={newServerForm.env}
                  onChange={(e) => setNewServerForm({ ...newServerForm, env: e.target.value })}
                  className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-purple-500/50 focus:outline-none transition-all input-focus"
                  rows={4}
                  placeholder='{"KEY": "value"}'
                />
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-8">
              <button
                onClick={() => {
                  setShowAddServerModal(false);
                  setNewServerForm({ name: '', command: '', args: '', env: '' });
                }}
                className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-all ripple-effect"
              >
                Cancel
              </button>
              <button
                onClick={addNewServer}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-purple-500/50 transition-all ripple-effect pulse-ring neon-glow"
              >
                Add Server
              </button>
            </div>
          </div>
        </div>
      )}

      {showLogsModal && logsServerName && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-dark border border-blue-500/30 rounded-2xl p-8 max-w-4xl w-full h-[600px] animate-slide-up shadow-2xl shadow-blue-500/20 neon-glow flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center pulse-ring">
                  <FileText className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">Server Logs</h3>
                  <p className="text-gray-400 text-sm">{logsServerName}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowLogsModal(false);
                  setLogsServerName(null);
                }}
                className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden">
              <ServerLogs serverName={logsServerName} />
            </div>

            <div className="flex justify-end pt-4 border-t border-blue-500/20 mt-4">
              <button
                onClick={() => {
                  setShowLogsModal(false);
                  setLogsServerName(null);
                }}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all ripple-effect"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportJsonModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-dark border border-blue-500/30 rounded-2xl p-8 max-w-2xl w-full animate-slide-up shadow-2xl shadow-blue-500/20 neon-glow">
            <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 mb-6">Import MCP Servers from JSON</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">MCP Configuration (JSON)</label>
                <textarea
                  value={importJsonContent}
                  onChange={(e) => setImportJsonContent(e.target.value)}
                  className="w-full glass border border-blue-500/20 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-blue-500/50 focus:outline-none transition-all input-focus"
                  rows={10}
                  placeholder={`{
  "server-name-1": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem"],
    "env": {}
  },
  "server-name-2": {
    "command": "node",
    "args": ["path/to/server.js"],
    "env": {"DEBUG": "true"}
  }
}`}
                />
                <p className="text-xs text-gray-500 mt-2">Each server must have a "command" field. "args" and "env" are optional.</p>
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-8">
              <button
                onClick={() => {
                  setShowImportJsonModal(false);
                  setImportJsonContent('');
                }}
                className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-all ripple-effect"
              >
                Cancel
              </button>
              <button
                onClick={importMcpConfigFromJson}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all ripple-effect neon-glow"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
