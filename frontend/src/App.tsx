import { useState, useEffect } from 'react';
import { Server, Terminal, Command, Save, RefreshCw, Plus, Trash2, Check, X, Eye, EyeOff, ArrowLeft, Edit2, Zap, Code } from 'lucide-react';

interface McpServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface ClaudeConfig {
  mcpServers?: Record<string, McpServer>;
}

interface CommandFile {
  name: string;
  content: string;
}

type ViewMode = 'list' | 'detail';

function App() {
  const [activeTab, setActiveTab] = useState<'mcp' | 'env' | 'commands'>('mcp');
  const [claudeConfig, setClaudeConfig] = useState<ClaudeConfig>({});
  const [envVars, setEnvVars] = useState({ 
    baseUrl: '', 
    authToken: '', 
    haikuModel: '', 
    opusModel: '', 
    sonnetModel: '' 
  });
  const [commands, setCommands] = useState<CommandFile[]>([]);
  const [showApiKey, setShowApiKey] = useState(false);
  
  // View mode state
  const [mcpViewMode, setMcpViewMode] = useState<ViewMode>('list');
  const [commandViewMode, setCommandViewMode] = useState<ViewMode>('list');
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  
  // Modal state
  const [showAddServerModal, setShowAddServerModal] = useState(false);
  const [showAddCommandModal, setShowAddCommandModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  
  // Editing state
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);
  const [editingCommand, setEditingCommand] = useState<{ name: string; content: string } | null>(null);
  const [newServerForm, setNewServerForm] = useState({
    name: '',
    command: '',
    args: '',
    env: ''
  });
  
  // Notification state
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error';
  }>({ show: false, message: '', type: 'success' });

  useEffect(() => {
    loadConfig();
  }, []);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: '', type: 'success' });
    }, 3000);
  };

  const loadConfig = async () => {
    try {
      // Load Claude config
      const configRes = await fetch('/api/claude-config');
      if (configRes.ok) {
        const config = await configRes.json();
        setClaudeConfig(config);
      }

      // Load env vars
      const envRes = await fetch('/api/env-vars');
      if (envRes.ok) {
        const data = await envRes.json();
        setEnvVars({
          baseUrl: data.baseUrl || '',
          authToken: data.authToken || '',
          haikuModel: data.haikuModel || '',
          opusModel: data.opusModel || '',
          sonnetModel: data.sonnetModel || ''
        });
      }

      // Load commands
      const cmdRes = await fetch('/api/commands');
      if (cmdRes.ok) {
        const data = await cmdRes.json();
        setCommands(data);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      showNotification('Failed to load configuration', 'error');
    }
  };

  const saveEnvVars = async () => {
    try {
      const response = await fetch('/api/env-vars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envVars),
      });

      if (response.ok) {
        const data = await response.json();
        showNotification(data.message || 'Environment variables saved!');
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      showNotification('Failed to save environment variables', 'error');
    }
  };

  // MCP Server functions
  const openServerDetail = (serverName: string) => {
    setSelectedServer(serverName);
    setEditingServer(claudeConfig.mcpServers?.[serverName] || { command: '', args: [], env: {} });
    setMcpViewMode('detail');
  };

  const saveServerDetail = () => {
    if (!selectedServer || !editingServer) return;
    
    const newConfig = {
      ...claudeConfig,
      mcpServers: {
        ...claudeConfig.mcpServers,
        [selectedServer]: editingServer
      }
    };
    
    setClaudeConfig(newConfig);
    setMcpViewMode('list');
    setSelectedServer(null);
    setEditingServer(null);
    
    // Auto-save
    fetch('/api/claude-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    }).then(res => {
      if (res.ok) showNotification('Server updated successfully!');
    });
  };

  const addNewServer = () => {
    if (!newServerForm.name || !newServerForm.command) {
      showNotification('Please fill in server name and command', 'error');
      return;
    }

    const newServer: McpServer = {
      command: newServerForm.command,
      args: newServerForm.args ? newServerForm.args.split(',').map(a => a.trim()) : [],
      env: newServerForm.env ? JSON.parse(newServerForm.env) : {}
    };

    const newConfig = {
      ...claudeConfig,
      mcpServers: {
        ...claudeConfig.mcpServers,
        [newServerForm.name]: newServer
      }
    };

    setClaudeConfig(newConfig);
    setShowAddServerModal(false);
    setNewServerForm({ name: '', command: '', args: '', env: '' });
    
    // Auto-save
    fetch('/api/claude-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    }).then(res => {
      if (res.ok) showNotification('Server added successfully!');
    });
  };

  const deleteServer = (serverName: string) => {
    const newServers = { ...claudeConfig.mcpServers };
    delete newServers[serverName];
    
    const newConfig = {
      ...claudeConfig,
      mcpServers: newServers
    };
    
    setClaudeConfig(newConfig);
    setShowDeleteConfirm(false);
    setItemToDelete(null);
    
    // Auto-save
    fetch('/api/claude-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    }).then(res => {
      if (res.ok) showNotification('Server deleted successfully!');
    });
  };

  // Command functions
  const openCommandDetail = (commandName: string) => {
    const cmd = commands.find(c => c.name === commandName);
    if (cmd) {
      setEditingCommand({ name: cmd.name, content: cmd.content });
      setCommandViewMode('detail');
    }
  };

  const saveCommandDetail = async () => {
    if (!editingCommand) return;

    try {
      const response = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingCommand),
      });

      if (response.ok) {
        showNotification('Command updated successfully!');
        await loadConfig();
        setCommandViewMode('list');
        setEditingCommand(null);
      }
    } catch (error) {
      showNotification('Failed to save command', 'error');
    }
  };

  const addNewCommand = async () => {
    if (!newServerForm.name || !newServerForm.command) {
      showNotification('Please fill in command name and content', 'error');
      return;
    }

    try {
      const response = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newServerForm.name,
          content: newServerForm.command
        }),
      });

      if (response.ok) {
        showNotification('Command added successfully!');
        await loadConfig();
        setShowAddCommandModal(false);
        setNewServerForm({ name: '', command: '', args: '', env: '' });
      }
    } catch (error) {
      showNotification('Failed to add command', 'error');
    }
  };

  const deleteCommand = async (commandName: string) => {
    try {
      const response = await fetch(`/api/commands/${commandName}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        showNotification('Command deleted successfully!');
        await loadConfig();
        setShowDeleteConfirm(false);
        setItemToDelete(null);
      }
    } catch (error) {
      showNotification('Failed to delete command', 'error');
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 grid-bg opacity-30"></div>
      <div className="fixed inset-0 scan-lines opacity-20"></div>
      
      {/* Global notification */}
      {notification.show && (
        <div className="fixed top-8 left-1/2 transform -translate-x-1/2 z-[100] animate-slide-down">
          <div className={`glass px-8 py-4 rounded-2xl shadow-2xl flex items-center space-x-3 ${
            notification.type === 'success' 
              ? 'border-l-4 border-green-500' 
              : 'border-l-4 border-red-500'
          }`}>
            {notification.type === 'success' ? (
              <Check className="w-6 h-6 text-green-400" />
            ) : (
              <X className="w-6 h-6 text-red-400" />
            )}
            <span className="text-white font-medium">{notification.message}</span>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="flex h-screen">
        {/* Sidebar */}
        <nav className="w-72 glass-dark border-r border-purple-500/20 flex flex-col p-6 relative z-10">
          {/* Logo */}
          <div className="mb-12 animate-float">
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center animate-glow-pulse">
                <Zap className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
                  Claude
                </h1>
                <p className="text-xs text-gray-400">Workbench v2.0</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="space-y-2 flex-1">
            <button
              onClick={() => setActiveTab('mcp')}
              className={`w-full flex items-center space-x-3 px-4 py-4 rounded-xl transition-all group ${
                activeTab === 'mcp'
                  ? 'glass border border-purple-500/50 shadow-lg shadow-purple-500/20'
                  : 'hover:glass hover:border hover:border-purple-500/30'
              }`}
            >
              <div className={`p-2 rounded-lg ${
                activeTab === 'mcp' 
                  ? 'bg-gradient-to-br from-purple-500 to-blue-500'
                  : 'bg-gray-800 group-hover:bg-purple-900/30'
              }`}>
                <Server className="w-5 h-5 text-white" />
              </div>
              <span className="font-medium text-white">MCP Servers</span>
            </button>

            <button
              onClick={() => setActiveTab('env')}
              className={`w-full flex items-center space-x-3 px-4 py-4 rounded-xl transition-all group ${
                activeTab === 'env'
                  ? 'glass border border-purple-500/50 shadow-lg shadow-purple-500/20'
                  : 'hover:glass hover:border hover:border-purple-500/30'
              }`}
            >
              <div className={`p-2 rounded-lg ${
                activeTab === 'env' 
                  ? 'bg-gradient-to-br from-purple-500 to-blue-500'
                  : 'bg-gray-800 group-hover:bg-purple-900/30'
              }`}>
                <Terminal className="w-5 h-5 text-white" />
              </div>
              <span className="font-medium text-white">Environment</span>
            </button>

            <button
              onClick={() => setActiveTab('commands')}
              className={`w-full flex items-center space-x-3 px-4 py-4 rounded-xl transition-all group ${
                activeTab === 'commands'
                  ? 'glass border border-purple-500/50 shadow-lg shadow-purple-500/20'
                  : 'hover:glass hover:border hover:border-purple-500/30'
              }`}
            >
              <div className={`p-2 rounded-lg ${
                activeTab === 'commands' 
                  ? 'bg-gradient-to-br from-purple-500 to-blue-500'
                  : 'bg-gray-800 group-hover:bg-purple-900/30'
              }`}>
                <Command className="w-5 h-5 text-white" />
              </div>
              <span className="font-medium text-white">Commands</span>
            </button>
          </div>

          {/* Refresh button */}
          <button
            onClick={loadConfig}
            className="mt-auto w-full glass hover:border-purple-500/50 border border-purple-500/20 px-4 py-3 rounded-xl flex items-center justify-center space-x-2 transition-all hover:shadow-lg hover:shadow-purple-500/20"
          >
            <RefreshCw className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-gray-300">Refresh Config</span>
          </button>
        </nav>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto relative z-10">
          {/* MCP Servers Tab */}
          {activeTab === 'mcp' && (
            <div className="p-8">
              {mcpViewMode === 'list' ? (
                <div>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-2">
                        MCP Servers
                      </h2>
                      <p className="text-gray-400">Manage your Model Context Protocol servers</p>
                    </div>
                    <button
                      onClick={() => setShowAddServerModal(true)}
                      className="glass hover:border-purple-500/50 border border-purple-500/20 px-6 py-3 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-purple-500/20 group"
                    >
                      <Plus className="w-5 h-5 text-purple-400 group-hover:rotate-90 transition-transform" />
                      <span className="text-white font-medium">Add Server</span>
                    </button>
                  </div>

                  {/* Server cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Object.entries(claudeConfig.mcpServers || {}).map(([name, server]) => (
                      <div
                        key={name}
                        className="glass border border-purple-500/20 rounded-2xl p-6 card-hover cursor-pointer group"
                        onClick={() => openServerDetail(name)}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 group-hover:from-purple-500/30 group-hover:to-blue-500/30 transition-all">
                            <Server className="w-6 h-6 text-purple-400" />
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setItemToDelete(name);
                              setShowDeleteConfirm(true);
                            }}
                            className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        </div>
                        
                        <h3 className="text-xl font-bold text-white mb-2 group-hover:text-purple-400 transition-colors">
                          {name}
                        </h3>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center space-x-2">
                            <Code className="w-4 h-4 text-gray-500" />
                            <span className="text-gray-400 font-mono">{server.command}</span>
                          </div>
                          {server.args && server.args.length > 0 && (
                            <div className="text-xs text-gray-500 ml-6">
                              {server.args.length} argument(s)
                            </div>
                          )}
                        </div>

                        <div className="mt-4 pt-4 border-t border-purple-500/20">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">Click to edit</span>
                            <Edit2 className="w-3 h-3 text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Empty state */}
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
                /* Server Detail View */
                <div>
                  <div className="flex items-center space-x-4 mb-8">
                    <button
                      onClick={() => {
                        setMcpViewMode('list');
                        setSelectedServer(null);
                        setEditingServer(null);
                      }}
                      className="p-2 rounded-lg hover:bg-purple-500/20 transition-colors"
                    >
                      <ArrowLeft className="w-6 h-6 text-purple-400" />
                    </button>
                    <div>
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
                          onChange={(e) => setEditingServer(prev => prev ? { ...prev, command: e.target.value } : null)}
                          className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-colors"
                          placeholder="e.g., npx"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Arguments (comma-separated)</label>
                        <input
                          type="text"
                          value={editingServer?.args?.join(', ') || ''}
                          onChange={(e) => setEditingServer(prev => prev ? { 
                            ...prev, 
                            args: e.target.value.split(',').map(a => a.trim()).filter(a => a)
                          } : null)}
                          className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-colors"
                          placeholder="e.g., -y, @modelcontextprotocol/server-filesystem"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Environment Variables (JSON)</label>
                        <textarea
                          value={JSON.stringify(editingServer?.env || {}, null, 2)}
                          onChange={(e) => {
                            try {
                              const env = JSON.parse(e.target.value);
                              setEditingServer(prev => prev ? { ...prev, env } : null);
                            } catch (err) {
                              // Invalid JSON, ignore
                            }
                          }}
                          className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-purple-500/50 focus:outline-none transition-colors"
                          rows={6}
                          placeholder='{\n  "KEY": "value"\n}'
                        />
                      </div>

                      <div className="flex justify-end space-x-4 pt-6 border-t border-purple-500/20">
                        <button
                          onClick={() => {
                            setMcpViewMode('list');
                            setSelectedServer(null);
                            setEditingServer(null);
                          }}
                          className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                        >
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
          )}

          {/* Environment Tab */}
          {activeTab === 'env' && (
            <div className="p-8">
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-2">
                  Environment Variables
                </h2>
                <p className="text-gray-400">Configure your API credentials and settings</p>
              </div>

              <div className="glass border border-purple-500/20 rounded-2xl p-8">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">ANTHROPIC_BASE_URL</label>
                    <input
                      type="text"
                      value={envVars.baseUrl}
                      onChange={(e) => setEnvVars({ ...envVars, baseUrl: e.target.value })}
                      className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-colors"
                      placeholder="https://api.anthropic.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">ANTHROPIC_API_KEY</label>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={envVars.authToken}
                        onChange={(e) => setEnvVars({ ...envVars, authToken: e.target.value })}
                        className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 pr-12 text-white focus:border-purple-500/50 focus:outline-none transition-colors font-mono"
                        placeholder="sk-ant-..."
                      />
                      <button
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-purple-500/20 transition-colors"
                      >
                        {showApiKey ? (
                          <EyeOff className="w-4 h-4 text-gray-400" />
                        ) : (
                          <Eye className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Haiku Model</label>
                      <input
                        type="text"
                        value={envVars.haikuModel}
                        onChange={(e) => setEnvVars({ ...envVars, haikuModel: e.target.value })}
                        className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white text-sm focus:border-purple-500/50 focus:outline-none transition-colors"
                        placeholder="claude-3-5-haiku-..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Opus Model</label>
                      <input
                        type="text"
                        value={envVars.opusModel}
                        onChange={(e) => setEnvVars({ ...envVars, opusModel: e.target.value })}
                        className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white text-sm focus:border-purple-500/50 focus:outline-none transition-colors"
                        placeholder="claude-3-opus-..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Sonnet Model</label>
                      <input
                        type="text"
                        value={envVars.sonnetModel}
                        onChange={(e) => setEnvVars({ ...envVars, sonnetModel: e.target.value })}
                        className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white text-sm focus:border-purple-500/50 focus:outline-none transition-colors"
                        placeholder="claude-3-5-sonnet-..."
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-6 border-t border-purple-500/20">
                    <button
                      onClick={saveEnvVars}
                      className="px-8 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-purple-500/50 transition-all flex items-center space-x-2"
                    >
                      <Save className="w-5 h-5" />
                      <span>Save Environment Variables</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Commands Tab */}
          {activeTab === 'commands' && (
            <div className="p-8">
              {commandViewMode === 'list' ? (
                <div>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-2">
                        Custom Commands
                      </h2>
                      <p className="text-gray-400">Manage your custom command scripts</p>
                    </div>
                    <button
                      onClick={() => setShowAddCommandModal(true)}
                      className="glass hover:border-purple-500/50 border border-purple-500/20 px-6 py-3 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-purple-500/20 group"
                    >
                      <Plus className="w-5 h-5 text-purple-400 group-hover:rotate-90 transition-transform" />
                      <span className="text-white font-medium">Add Command</span>
                    </button>
                  </div>

                  {/* Command cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {commands.map((cmd) => (
                      <div
                        key={cmd.name}
                        className="glass border border-purple-500/20 rounded-2xl p-6 card-hover cursor-pointer group"
                        onClick={() => openCommandDetail(cmd.name)}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 group-hover:from-purple-500/30 group-hover:to-blue-500/30 transition-all">
                            <Command className="w-6 h-6 text-purple-400" />
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setItemToDelete(cmd.name);
                              setShowDeleteConfirm(true);
                            }}
                            className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        </div>
                        
                        <h3 className="text-xl font-bold text-white mb-2 group-hover:text-purple-400 transition-colors">
                          {cmd.name.replace(/\.md$/, '')}
                        </h3>
                        
                        <p className="text-sm text-gray-400 line-clamp-3 mb-4">
                          {cmd.content.substring(0, 100)}...
                        </p>

                        <div className="mt-4 pt-4 border-t border-purple-500/20">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">Click to edit</span>
                            <Edit2 className="w-3 h-3 text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Empty state */}
                    {commands.length === 0 && (
                      <div className="col-span-full glass border border-purple-500/20 rounded-2xl p-12 text-center">
                        <Command className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400 mb-4">No custom commands yet</p>
                        <button
                          onClick={() => setShowAddCommandModal(true)}
                          className="glass hover:border-purple-500/50 border border-purple-500/20 px-6 py-3 rounded-xl inline-flex items-center space-x-2"
                        >
                          <Plus className="w-5 h-5 text-purple-400" />
                          <span className="text-white font-medium">Create Your First Command</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Command Detail View */
                <div>
                  <div className="flex items-center space-x-4 mb-8">
                    <button
                      onClick={() => {
                        setCommandViewMode('list');
                        setEditingCommand(null);
                      }}
                      className="p-2 rounded-lg hover:bg-purple-500/20 transition-colors"
                    >
                      <ArrowLeft className="w-6 h-6 text-purple-400" />
                    </button>
                    <div>
                      <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
                        {editingCommand?.name.replace(/\.md$/, '')}
                      </h2>
                      <p className="text-gray-400">Edit command content</p>
                    </div>
                  </div>

                  <div className="glass border border-purple-500/20 rounded-2xl p-8">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Command Content</label>
                        <textarea
                          value={editingCommand?.content || ''}
                          onChange={(e) => setEditingCommand(prev => prev ? { ...prev, content: e.target.value } : null)}
                          className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-purple-500/50 focus:outline-none transition-colors"
                          rows={20}
                          placeholder="Enter your command script here..."
                        />
                      </div>

                      <div className="flex justify-end space-x-4 pt-6 border-t border-purple-500/20">
                        <button
                        onClick={() => {
                          setCommandViewMode('list');
                          setEditingCommand(null);
                        }}
                          className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveCommandDetail}
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
          )}
        </div>
      </div>

      {/* Add Server Modal */}
      {showAddServerModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-dark border border-purple-500/30 rounded-2xl p-8 max-w-2xl w-full animate-fade-in shadow-2xl shadow-purple-500/20">
            <h3 className="text-2xl font-bold text-white mb-6">Add New Server</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Server Name</label>
                <input
                  type="text"
                  value={newServerForm.name}
                  onChange={(e) => setNewServerForm({ ...newServerForm, name: e.target.value })}
                  className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-colors"
                  placeholder="e.g., mcp-filesystem"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Command</label>
                <input
                  type="text"
                  value={newServerForm.command}
                  onChange={(e) => setNewServerForm({ ...newServerForm, command: e.target.value })}
                  className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-colors"
                  placeholder="e.g., npx"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Arguments (comma-separated)</label>
                <input
                  type="text"
                  value={newServerForm.args}
                  onChange={(e) => setNewServerForm({ ...newServerForm, args: e.target.value })}
                  className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-colors"
                  placeholder="e.g., -y, @modelcontextprotocol/server-filesystem"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Environment Variables (JSON)</label>
                <textarea
                  value={newServerForm.env}
                  onChange={(e) => setNewServerForm({ ...newServerForm, env: e.target.value })}
                  className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-purple-500/50 focus:outline-none transition-colors"
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
                className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addNewServer}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-purple-500/50 transition-all"
              >
                Add Server
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Command Modal */}
      {showAddCommandModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-dark border border-purple-500/30 rounded-2xl p-8 max-w-2xl w-full animate-fade-in shadow-2xl shadow-purple-500/20">
            <h3 className="text-2xl font-bold text-white mb-6">Add New Command</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Command Name</label>
                <input
                  type="text"
                  value={newServerForm.name}
                  onChange={(e) => setNewServerForm({ ...newServerForm, name: e.target.value })}
                  className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-colors"
                  placeholder="e.g., deploy.md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Command Content</label>
                <textarea
                  value={newServerForm.command}
                  onChange={(e) => setNewServerForm({ ...newServerForm, command: e.target.value })}
                  className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-purple-500/50 focus:outline-none transition-colors"
                  rows={12}
                  placeholder="Enter your command script here..."
                />
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-8">
              <button
                onClick={() => {
                  setShowAddCommandModal(false);
                  setNewServerForm({ name: '', command: '', args: '', env: '' });
                }}
                className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addNewCommand}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-purple-500/50 transition-all"
              >
                Add Command
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-dark border border-red-500/30 rounded-2xl p-8 max-w-md w-full animate-fade-in shadow-2xl shadow-red-500/20">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Delete {activeTab === 'mcp' ? 'Server' : 'Command'}?</h3>
              <p className="text-gray-400 mb-6">
                Are you sure you want to delete <span className="text-white font-medium">{itemToDelete}</span>? This action cannot be undone.
              </p>
              
              <div className="flex justify-center space-x-4">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setItemToDelete(null);
                  }}
                  className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (itemToDelete) {
                      if (activeTab === 'mcp') {
                        deleteServer(itemToDelete);
                      } else {
                        deleteCommand(itemToDelete);
                      }
                    }
                  }}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-red-500 to-pink-500 text-white font-medium hover:shadow-lg hover:shadow-red-500/50 transition-all"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

