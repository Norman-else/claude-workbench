import { useState, useEffect } from 'react';
import { Server, Terminal, Command, Save, RefreshCw, Plus, Trash2, Check, X, Eye, EyeOff, ArrowLeft, Edit2, Zap, Code, Play, Square, RotateCw, Activity, FileText, CheckCircle2, Settings } from 'lucide-react';

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

interface McpStatus {
  status: 'running' | 'stopped' | 'stopping' | 'error';
  running: boolean;
  pid?: number;
  startTime?: string;
  error?: string;
}

interface EnvProfile {
  id: string;
  name: string;
  baseUrl: string;
  authToken: string;
  haikuModel: string;
  opusModel: string;
  sonnetModel: string;
  smallFastModel: string;
  createdAt: string;
  updatedAt?: string;
}

type ViewMode = 'list' | 'detail';

// Server Logs Component
function ServerLogs({ serverName }: { serverName: string }) {
  const [logs, setLogs] = useState<Array<{ timestamp: string; type: string; message: string }>>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useState<HTMLDivElement | null>(null)[0];

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/mcp/${serverName}/logs?limit=50`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
          if (autoScroll && logsEndRef) {
            logsEndRef.scrollIntoView({ behavior: 'smooth' });
          }
        }
      } catch (error) {
        console.error('Failed to fetch logs:', error);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [serverName, autoScroll, logsEndRef]);

  const getLogColor = (type: string) => {
    switch (type) {
      case 'error': case 'stderr': return 'text-red-400';
      case 'info': return 'text-blue-400';
      case 'stdout': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      <div className="flex items-center justify-between flex-shrink-0">
        <label className="flex items-center space-x-2 text-sm font-medium text-gray-300">
          <Activity className="w-4 h-4 text-purple-400" />
          <span>Server Logs</span>
        </label>
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded bg-gray-800 border-purple-500/20"
          />
          <span className="text-xs text-gray-400">Auto-scroll</span>
        </label>
      </div>
      <div className="glass border border-purple-500/20 rounded-xl p-4 flex-1 overflow-y-auto font-mono text-xs">
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">No logs yet</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="mb-1">
              <span className="text-gray-600">{new Date(log.timestamp).toLocaleTimeString()}</span>
              {' '}
              <span className={`font-medium ${getLogColor(log.type)}`}>[{log.type}]</span>
              {' '}
              <span className="text-gray-300">{log.message}</span>
            </div>
          ))
        )}
        <div ref={(el) => { if (el) logsEndRef }} />
      </div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState<'mcp' | 'env' | 'commands'>('mcp');
  const [claudeConfig, setClaudeConfig] = useState<ClaudeConfig>({});
  const [commands, setCommands] = useState<CommandFile[]>([]);
  const [showApiKey, setShowApiKey] = useState(false);
  
  // MCP Status Management
  const [mcpStatuses, setMcpStatuses] = useState<Record<string, McpStatus>>({});
  const [isLoadingStatus, setIsLoadingStatus] = useState<Record<string, boolean>>({});
  
  // Environment Profiles Management
  const [envProfiles, setEnvProfiles] = useState<EnvProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [envViewMode, setEnvViewMode] = useState<ViewMode>('list');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<EnvProfile | null>(null);
  const [showAddProfileModal, setShowAddProfileModal] = useState(false);
  
  // View mode state
  const [mcpViewMode, setMcpViewMode] = useState<ViewMode>('list');
  const [commandViewMode, setCommandViewMode] = useState<ViewMode>('list');
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  
  // Modal state
  const [showAddServerModal, setShowAddServerModal] = useState(false);
  const [showAddCommandModal, setShowAddCommandModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logsServerName, setLogsServerName] = useState<string | null>(null);
  
  // Editing state
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);
  const [editingCommand, setEditingCommand] = useState<{ name: string; content: string } | null>(null);
  const [newServerForm, setNewServerForm] = useState({
    name: '',
    command: '',
    args: '',
    env: ''
  });
  const [newProfileForm, setNewProfileForm] = useState({
    name: '',
    baseUrl: '',
    authToken: '',
    haikuModel: '',
    opusModel: '',
    sonnetModel: '',
    smallFastModel: ''
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

  // Poll MCP statuses every 3 seconds
  useEffect(() => {
    const pollStatuses = async () => {
      try {
        const res = await fetch('/api/mcp/status/all');
        if (res.ok) {
          const statuses = await res.json();
          setMcpStatuses(statuses);
      }
    } catch (error) {
        console.error('Failed to poll MCP statuses:', error);
      }
    };

    // Initial poll
    pollStatuses();

    // Set up polling interval
    const interval = setInterval(pollStatuses, 3000);

    return () => clearInterval(interval);
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
      
      // Load environment profiles
      const profilesRes = await fetch('/api/env-profiles');
      if (profilesRes.ok) {
        const data = await profilesRes.json();
        setEnvProfiles(data.profiles || []);
        setActiveProfileId(data.activeProfileId || null);
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

  // Environment Profile functions
  const openProfileDetail = (profileId: string) => {
    const profile = envProfiles.find(p => p.id === profileId);
    if (profile) {
      setSelectedProfileId(profileId);
      setEditingProfile({ ...profile });
      setEnvViewMode('detail');
    }
  };

  const saveProfileDetail = async () => {
    if (!editingProfile) return;
    
    try {
      const response = await fetch(`/api/env-profiles/${editingProfile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingProfile),
      });

      if (response.ok) {
        showNotification('Profile updated successfully!');
        await loadConfig();
        setEnvViewMode('list');
        setEditingProfile(null);
        setSelectedProfileId(null);
      } else {
        const data = await response.json();
        showNotification(data.error || 'Failed to save profile', 'error');
      }
    } catch (error) {
      showNotification('Failed to save profile', 'error');
    }
  };

  const addNewProfile = async () => {
    if (!newProfileForm.name) {
      showNotification('Please fill in profile name', 'error');
      return;
    }

    try {
      const response = await fetch('/api/env-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProfileForm),
      });

      if (response.ok) {
        showNotification('Profile added successfully!');
        await loadConfig();
        setShowAddProfileModal(false);
        setNewProfileForm({ name: '', baseUrl: '', authToken: '', haikuModel: '', opusModel: '', sonnetModel: '', smallFastModel: '' });
      } else {
        const data = await response.json();
        showNotification(data.error || 'Failed to add profile', 'error');
      }
    } catch (error) {
      showNotification('Failed to add profile', 'error');
    }
  };

  const deleteProfile = async (profileId: string) => {
    try {
      const response = await fetch(`/api/env-profiles/${profileId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        showNotification('Profile deleted successfully!');
        await loadConfig();
        setShowDeleteConfirm(false);
        setItemToDelete(null);
      } else {
        const data = await response.json();
        showNotification(data.error || 'Failed to delete profile', 'error');
      }
    } catch (error) {
      showNotification('Failed to delete profile', 'error');
    }
  };

  const activateProfile = async (profileId: string) => {
    try {
      const response = await fetch(`/api/env-profiles/${profileId}/activate`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        showNotification(data.message || 'Profile activated successfully!');
        await loadConfig();
      } else {
        const data = await response.json();
        showNotification(data.error || 'Failed to activate profile', 'error');
      }
    } catch (error) {
      showNotification('Failed to activate profile', 'error');
    }
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

  // MCP Server Control Functions
  const startMcpServer = async (serverName: string) => {
    setIsLoadingStatus(prev => ({ ...prev, [serverName]: true }));
    try {
      const response = await fetch(`/api/mcp/${serverName}/start`, {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (response.ok) {
        showNotification(`Server "${serverName}" started successfully! PID: ${data.pid}`);
        // Update status immediately
        setMcpStatuses(prev => ({
          ...prev,
          [serverName]: { status: 'running', running: true, pid: data.pid }
        }));
      } else {
        showNotification(data.error || 'Failed to start server', 'error');
      }
    } catch (error) {
      showNotification(`Failed to start server: ${error}`, 'error');
    } finally {
      setIsLoadingStatus(prev => ({ ...prev, [serverName]: false }));
    }
  };

  const stopMcpServer = async (serverName: string) => {
    setIsLoadingStatus(prev => ({ ...prev, [serverName]: true }));
    try {
      const response = await fetch(`/api/mcp/${serverName}/stop`, {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (response.ok) {
        showNotification(`Server "${serverName}" stopped`);
        // Update status immediately
        setMcpStatuses(prev => ({
          ...prev,
          [serverName]: { status: 'stopping', running: false }
        }));
    } else {
        showNotification(data.error || 'Failed to stop server', 'error');
      }
    } catch (error) {
      showNotification(`Failed to stop server: ${error}`, 'error');
    } finally {
      setIsLoadingStatus(prev => ({ ...prev, [serverName]: false }));
    }
  };

  const restartMcpServer = async (serverName: string) => {
    setIsLoadingStatus(prev => ({ ...prev, [serverName]: true }));
    try {
      showNotification(`Restarting server "${serverName}"...`, 'success');
      
      const response = await fetch(`/api/mcp/${serverName}/restart`, {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (response.ok) {
        showNotification(`Server "${serverName}" restarted! PID: ${data.pid}`);
    } else {
        showNotification(data.error || 'Failed to restart server', 'error');
      }
    } catch (error) {
      showNotification(`Failed to restart server: ${error}`, 'error');
    } finally {
      setIsLoadingStatus(prev => ({ ...prev, [serverName]: false }));
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 grid-bg opacity-30"></div>
      <div className="fixed inset-0 scan-lines opacity-20"></div>
      
      {/* Particle background */}
      <div className="particles">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 6}s`,
              animationDuration: `${6 + Math.random() * 4}s`
            }}
          />
        ))}
      </div>
      
      {/* Global notification */}
      {notification.show && (
        <div className="fixed top-8 left-1/2 transform -translate-x-1/2 z-[100] animate-slide-down">
          <div className={`glass px-8 py-4 rounded-2xl shadow-2xl flex items-center space-x-3 neon-glow ${
              notification.type === 'success'
              ? 'border-l-4 border-green-500' 
              : 'border-l-4 border-red-500'
          }`}>
            {notification.type === 'success' ? (
              <div className="pulse-ring">
                <Check className="w-6 h-6 text-green-400" />
              </div>
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
                  Claude Code
                </h1>
                <p className="text-xs text-gray-400">Workbench</p>
                </div>
              </div>
              </div>

          {/* Navigation */}
          <div className="space-y-2 flex-1">
                <button
              onClick={() => setActiveTab('mcp')}
              className={`w-full flex items-center space-x-3 px-4 py-4 rounded-xl transition-all group ripple-effect ${
                activeTab === 'mcp'
                  ? 'glass border border-purple-500/50 shadow-lg shadow-purple-500/20 gradient-border'
                  : 'hover:glass border border-transparent hover:border-purple-500/30'
              }`}
            >
              <div className={`p-2 rounded-lg transition-all ${
                activeTab === 'mcp' 
                  ? 'bg-gradient-to-br from-purple-500 to-blue-500 pulse-ring'
                  : 'bg-gray-800 group-hover:bg-purple-900/30'
              }`}>
                <Server className="w-5 h-5 text-white" />
              </div>
              <span className="font-medium text-white">MCP Servers</span>
              {activeTab === 'mcp' && (
                <div className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              )}
                </button>

                <button
              onClick={() => setActiveTab('env')}
              className={`w-full flex items-center space-x-3 px-4 py-4 rounded-xl transition-all group ripple-effect ${
                activeTab === 'env'
                  ? 'glass border border-purple-500/50 shadow-lg shadow-purple-500/20 gradient-border'
                  : 'hover:glass border border-transparent hover:border-purple-500/30'
              }`}
            >
              <div className={`p-2 rounded-lg transition-all ${
                activeTab === 'env' 
                  ? 'bg-gradient-to-br from-purple-500 to-blue-500 pulse-ring'
                  : 'bg-gray-800 group-hover:bg-purple-900/30'
              }`}>
                <Terminal className="w-5 h-5 text-white" />
              </div>
              <span className="font-medium text-white">Environment</span>
              {activeTab === 'env' && (
                <div className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              )}
            </button>

            <button
              onClick={() => setActiveTab('commands')}
              className={`w-full flex items-center space-x-3 px-4 py-4 rounded-xl transition-all group ripple-effect ${
                activeTab === 'commands'
                  ? 'glass border border-purple-500/50 shadow-lg shadow-purple-500/20 gradient-border'
                  : 'hover:glass border border-transparent hover:border-purple-500/30'
              }`}
            >
              <div className={`p-2 rounded-lg transition-all ${
                activeTab === 'commands' 
                  ? 'bg-gradient-to-br from-purple-500 to-blue-500 pulse-ring'
                  : 'bg-gray-800 group-hover:bg-purple-900/30'
              }`}>
                <Command className="w-5 h-5 text-white" />
                </div>
              <span className="font-medium text-white">Commands</span>
              {activeTab === 'commands' && (
                <div className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              )}
            </button>
              </div>

          {/* Refresh button */}
                <button
            onClick={loadConfig}
            className="mt-auto w-full glass hover:border-purple-500/50 border border-purple-500/20 px-4 py-3 rounded-xl flex items-center justify-center space-x-2 transition-all hover:shadow-lg hover:shadow-purple-500/20 ripple-effect group tooltip"
            data-tooltip="Reload configuration from disk"
                >
            <RefreshCw className="w-4 h-4 text-purple-400 group-hover:rotate-180 transition-transform duration-500" />
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
                      className="glass hover:border-purple-500/50 border border-purple-500/20 px-6 py-3 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-purple-500/20 group ripple-effect neon-glow"
              >
                      <Plus className="w-5 h-5 text-purple-400 group-hover:rotate-90 transition-transform duration-300" />
                      <span className="text-white font-medium">Add Server</span>
              </button>
            </div>

                  {/* Server cards */}
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
                        {/* Status indicator - improved display */}
                        <div className="mb-4 flex items-center space-x-2">
                          <div className={`w-2 h-2 rounded-full ${
                            isRunning ? 'bg-green-400 animate-pulse' : 
                            status?.status === 'stopping' ? 'bg-yellow-400 animate-pulse' :
                            status?.status === 'error' ? 'bg-red-400 animate-pulse' :
                            'bg-gray-500'
                          }`}></div>
                          <span className={`text-xs font-medium ${
                            isRunning ? 'text-green-400' : 
                            status?.status === 'stopping' ? 'text-yellow-400' :
                            status?.status === 'error' ? 'text-red-400' :
                            'text-gray-500'
                          }`}>
                            {isRunning ? 'Running' : 
                             status?.status === 'stopping' ? 'Stopping' :
                             status?.status === 'error' ? 'Error' :
                             'Stopped'}
                          </span>
                          {status?.pid && (
                            <span className="text-[10px] text-gray-500 ml-1">PID: {status.pid}</span>
                          )}
                        </div>

                        <div className="flex items-start mb-4">
                          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 group-hover:from-purple-500/30 group-hover:to-blue-500/30 transition-all neon-glow">
                            <Server className="w-6 h-6 text-purple-400" />
                          </div>
                        </div>

                        <h3 
                          className="text-xl font-bold text-white mb-2 transition-all cursor-pointer"
                          onClick={() => openServerDetail(name)}
                        >
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

                        {/* Control buttons */}
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
                                  restartMcpServer(name);
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
                                  stopMcpServer(name);
                                }}
                                disabled={isLoading}
                                className="flex-1 glass hover:border-red-500/50 border border-red-500/20 px-3 py-2 rounded-xl flex items-center justify-center space-x-1 transition-all ripple-effect tooltip text-xs disabled:opacity-50"
                                data-tooltip="Stop server"
                              >
                                <Square className="w-4 h-4 text-red-400" />
                                <span className="text-red-400 hidden sm:inline">Stop</span>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startMcpServer(name);
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
                                  setItemToDelete(name);
                                  setShowDeleteConfirm(true);
                                }}
                                className="p-2 glass hover:border-red-500/50 border border-red-500/20 rounded-xl transition-all tooltip"
                                data-tooltip="Delete server"
                              >
                                <Trash2 className="w-4 h-4 text-red-400" />
                              </button>
                            </>
                          )}
                        </div>

                        {/* Hover border effect - removed background glow for better text readability */}
                      </div>
                      );
                    })}

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

                  {/* Server Logs Section */}
                  {selectedServer && mcpStatuses[selectedServer]?.running && (
                    <div className="mt-6 pt-6 border-t border-purple-500/20">
                      <ServerLogs serverName={selectedServer} />
                    </div>
                  )}

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
            {envViewMode === 'list' ? (
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-2">
                      Environment Profiles
                    </h2>
                    <p className="text-gray-400">Manage your API credential profiles</p>
                  </div>
                  <button
                    onClick={() => setShowAddProfileModal(true)}
                    className="glass hover:border-purple-500/50 border border-purple-500/20 px-6 py-3 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-purple-500/20 group ripple-effect neon-glow"
                  >
                    <Plus className="w-5 h-5 text-purple-400 group-hover:rotate-90 transition-transform duration-300" />
                    <span className="text-white font-medium">Add Profile</span>
                  </button>
                </div>

                {/* Profile cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {envProfiles.map((profile) => {
                    const isActive = profile.id === activeProfileId;
                    return (
                      <div 
                        key={profile.id} 
                        className="glass border border-purple-500/20 rounded-2xl p-6 card-hover cursor-pointer group gradient-border relative h-[320px] flex flex-col"
                        onClick={() => openProfileDetail(profile.id)}
                      >
                        {/* Active indicator */}
                        {isActive && (
                          <div className="absolute top-4 right-4 flex items-center space-x-2 bg-green-500/20 px-3 py-1 rounded-full border border-green-500/50">
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                            <span className="text-xs text-green-400 font-medium">Active</span>
                          </div>
                        )}

                        <div className="flex items-start mb-4">
                          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 group-hover:from-purple-500/30 group-hover:to-blue-500/30 transition-all neon-glow">
                            <Settings className="w-6 h-6 text-purple-400" />
                          </div>
                        </div>

                        <h3 className="text-xl font-bold text-white mb-2">
                          {profile.name}
                        </h3>
                        
                        <div className="space-y-2 text-sm mb-4 flex-1">
                          <div className="flex items-center space-x-2">
                            <Terminal className="w-4 h-4 text-gray-500" />
                            <span className="text-gray-400 font-mono text-xs truncate">
                              {profile.baseUrl || 'No base URL'}
                            </span>
                          </div>
                          {profile.authToken && (
                            <div className="flex items-center space-x-1 ml-6">
                              <div className="px-2 py-1 bg-green-500/10 rounded text-xs text-green-400">
                                API Key Configured
                              </div>
                            </div>
                          )}
                          <div className="text-xs text-gray-500 mt-2">
                            Created: {new Date(profile.createdAt).toLocaleDateString()}
                          </div>
                        </div>

                        {/* Control buttons */}
                        <div className="flex items-center justify-between gap-2 pt-4 border-t border-purple-500/20 mt-auto">
                          {!isActive ? (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  activateProfile(profile.id);
                                }}
                                className="flex-1 glass hover:border-green-500/50 border border-green-500/20 px-4 py-2 rounded-xl flex items-center justify-center space-x-2 transition-all hover:shadow-lg hover:shadow-green-500/20 bg-gradient-to-r from-green-500/10 to-emerald-500/10"
                              >
                                <Play className="w-4 h-4 text-green-400" />
                                <span className="text-xs text-white font-medium">Activate</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openProfileDetail(profile.id);
                                }}
                                className="p-2 glass hover:border-purple-500/50 border border-purple-500/20 rounded-xl transition-all"
                              >
                                <Edit2 className="w-4 h-4 text-purple-400" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setItemToDelete(profile.id);
                                  setShowDeleteConfirm(true);
                                }}
                                className="p-2 glass hover:border-red-500/50 border border-red-500/20 rounded-xl transition-all tooltip"
                                data-tooltip="Delete profile"
                              >
                                <Trash2 className="w-4 h-4 text-red-400" />
                              </button>
                            </>
                          ) : (
                            <div className="w-full text-center">
                              <div className="px-4 py-2 bg-green-500/10 rounded-xl border border-green-500/20">
                                <span className="text-xs text-green-400 font-medium">Currently Active Profile</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Empty state */}
                {envProfiles.length === 0 && (
                  <div className="text-center py-16">
                    <Settings className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400 mb-4">No environment profiles configured yet</p>
                    <button
                      onClick={() => setShowAddProfileModal(true)}
                      className="glass hover:border-purple-500/50 border border-purple-500/20 px-6 py-3 rounded-xl inline-flex items-center space-x-2"
                    >
                      <Plus className="w-5 h-5 text-purple-400" />
                      <span className="text-white font-medium">Add Your First Profile</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Profile Detail View */
              <div>
                <div className="flex items-center space-x-4 mb-8">
                  <button
                    onClick={() => {
                      setEnvViewMode('list');
                      setEditingProfile(null);
                      setSelectedProfileId(null);
                    }}
                    className="p-3 rounded-xl glass hover:border-purple-500/50 border border-purple-500/20 transition-all ripple-effect neon-glow"
                  >
                    <ArrowLeft className="w-6 h-6 text-purple-400" />
                  </button>
                  <div>
                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
                      {editingProfile?.name}
                    </h2>
                    <p className="text-gray-400">Edit profile configuration</p>
                  </div>
                </div>

                <div className="glass border border-purple-500/20 rounded-2xl p-8">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Profile Name</label>
                      <input
                        type="text"
                        value={editingProfile?.name || ''}
                        onChange={(e) => setEditingProfile(prev => prev ? { ...prev, name: e.target.value } : null)}
                        className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-colors"
                        placeholder="e.g., Production, Development"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">ANTHROPIC_BASE_URL</label>
                      <input
                        type="text"
                        value={editingProfile?.baseUrl || ''}
                        onChange={(e) => setEditingProfile(prev => prev ? { ...prev, baseUrl: e.target.value } : null)}
                        className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-colors"
                        placeholder="https://api.anthropic.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">ANTHROPIC_API_KEY</label>
                      <div className="relative">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          value={editingProfile?.authToken || ''}
                          onChange={(e) => setEditingProfile(prev => prev ? { ...prev, authToken: e.target.value } : null)}
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
                          value={editingProfile?.haikuModel || ''}
                          onChange={(e) => setEditingProfile(prev => prev ? { ...prev, haikuModel: e.target.value } : null)}
                          className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white text-sm focus:border-purple-500/50 focus:outline-none transition-colors"
                          placeholder="claude-3-5-haiku-..."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Opus Model</label>
                        <input
                          type="text"
                          value={editingProfile?.opusModel || ''}
                          onChange={(e) => setEditingProfile(prev => prev ? { ...prev, opusModel: e.target.value } : null)}
                          className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white text-sm focus:border-purple-500/50 focus:outline-none transition-colors"
                          placeholder="claude-3-opus-..."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Sonnet Model</label>
                        <input
                          type="text"
                          value={editingProfile?.sonnetModel || ''}
                          onChange={(e) => setEditingProfile(prev => prev ? { ...prev, sonnetModel: e.target.value } : null)}
                          className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white text-sm focus:border-purple-500/50 focus:outline-none transition-colors"
                          placeholder="claude-3-5-sonnet-..."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Small Fast Model</label>
                        <input
                          type="text"
                          value={editingProfile?.smallFastModel || ''}
                          onChange={(e) => setEditingProfile(prev => prev ? { ...prev, smallFastModel: e.target.value } : null)}
                          className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white text-sm focus:border-purple-500/50 focus:outline-none transition-colors"
                          placeholder="claude-3-5-haiku-..."
                        />
                      </div>
                    </div>

                    <div className="flex justify-end space-x-4 pt-6 border-t border-purple-500/20">
                      <button
                        onClick={() => {
                          setEnvViewMode('list');
                          setEditingProfile(null);
                          setSelectedProfileId(null);
                        }}
                        className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveProfileDetail}
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
                      className="glass hover:border-purple-500/50 border border-purple-500/20 px-6 py-3 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-purple-500/20 group ripple-effect neon-glow"
              >
                      <Plus className="w-5 h-5 text-purple-400 group-hover:rotate-90 transition-transform duration-300" />
                      <span className="text-white font-medium">Add Command</span>
              </button>
            </div>

                  {/* Command cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {commands.map((cmd) => (
                  <div 
                    key={cmd.name} 
                        className="glass border border-purple-500/20 rounded-2xl p-6 card-hover cursor-pointer group gradient-border relative h-[280px] flex flex-col"
                        onClick={() => openCommandDetail(cmd.name)}
                      >
                        {/* Status indicator */}
                        <div className="absolute top-4 right-4 flex items-center space-x-2">
                          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                              setItemToDelete(cmd.name);
                              setShowDeleteConfirm(true);
                        }}
                            className="p-2 rounded-lg hover:bg-red-500/20 transition-colors ripple-effect tooltip"
                            data-tooltip="Delete command"
                      >
                            <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>

                        <div className="flex items-start mb-4">
                          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 group-hover:from-purple-500/30 group-hover:to-blue-500/30 transition-all neon-glow">
                            <Command className="w-6 h-6 text-purple-400" />
                          </div>
                    </div>

                        <h3 className="text-xl font-bold text-white mb-2 transition-all">
                          {cmd.name.replace(/\.md$/, '')}
                        </h3>
                        
                        <p className="text-sm text-gray-400 line-clamp-3 mb-4 font-mono flex-1">
                          {cmd.content.substring(0, 100)}...
                        </p>

                        <div className="mt-auto pt-4 border-t border-purple-500/20">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">Click to edit</span>
                            <Edit2 className="w-3 h-3 text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
          </div>

                        {/* Hover border effect - removed background glow for better text readability */}
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
                          className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-purple-500/50 focus:outline-none transition-all input-focus"
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

      {/* Add Command Modal */}
      {showAddCommandModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-dark border border-purple-500/30 rounded-2xl p-8 max-w-2xl w-full animate-slide-up shadow-2xl shadow-purple-500/20 neon-glow">
            <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-6">Add New Command</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Command Name</label>
                    <input
                      type="text"
                  value={newServerForm.name}
                  onChange={(e) => setNewServerForm({ ...newServerForm, name: e.target.value })}
                  className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-all input-focus"
                  placeholder="e.g., deploy.md"
                />
                </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Command Content</label>
                <textarea
                  value={newServerForm.command}
                  onChange={(e) => setNewServerForm({ ...newServerForm, command: e.target.value })}
                  className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-purple-500/50 focus:outline-none transition-all input-focus"
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
                className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-all ripple-effect"
              >
                Cancel
                        </button>
                        <button
                onClick={addNewCommand}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-purple-500/50 transition-all ripple-effect pulse-ring neon-glow"
                  >
                Add Command
                        </button>
                        </div>
            </div>
          </div>
        )}

      {/* Add Profile Modal */}
      {showAddProfileModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-dark border border-purple-500/30 rounded-2xl p-8 max-w-2xl w-full animate-slide-up shadow-2xl shadow-purple-500/20 neon-glow">
            <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-6">Add New Environment Profile</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Profile Name</label>
                <input
                  type="text"
                  value={newProfileForm.name}
                  onChange={(e) => setNewProfileForm({ ...newProfileForm, name: e.target.value })}
                  className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-all input-focus"
                  placeholder="e.g., Production, Development, Testing"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">ANTHROPIC_BASE_URL</label>
                <input
                  type="text"
                  value={newProfileForm.baseUrl}
                  onChange={(e) => setNewProfileForm({ ...newProfileForm, baseUrl: e.target.value })}
                  className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-all input-focus"
                  placeholder="https://api.anthropic.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">ANTHROPIC_API_KEY</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={newProfileForm.authToken}
                    onChange={(e) => setNewProfileForm({ ...newProfileForm, authToken: e.target.value })}
                    className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 pr-12 text-white focus:border-purple-500/50 focus:outline-none transition-all font-mono input-focus"
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
                  <label className="block text-sm font-medium text-gray-300 mb-2">Haiku Model (Optional)</label>
                  <input
                    type="text"
                    value={newProfileForm.haikuModel}
                    onChange={(e) => setNewProfileForm({ ...newProfileForm, haikuModel: e.target.value })}
                    className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white text-sm focus:border-purple-500/50 focus:outline-none transition-all input-focus"
                    placeholder="claude-3-5-haiku-..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Opus Model (Optional)</label>
                  <input
                    type="text"
                    value={newProfileForm.opusModel}
                    onChange={(e) => setNewProfileForm({ ...newProfileForm, opusModel: e.target.value })}
                    className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white text-sm focus:border-purple-500/50 focus:outline-none transition-all input-focus"
                    placeholder="claude-3-opus-..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Sonnet Model (Optional)</label>
                  <input
                    type="text"
                    value={newProfileForm.sonnetModel}
                    onChange={(e) => setNewProfileForm({ ...newProfileForm, sonnetModel: e.target.value })}
                    className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white text-sm focus:border-purple-500/50 focus:outline-none transition-all input-focus"
                    placeholder="claude-3-5-sonnet-..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Small Fast Model (Optional)</label>
                  <input
                    type="text"
                    value={newProfileForm.smallFastModel}
                    onChange={(e) => setNewProfileForm({ ...newProfileForm, smallFastModel: e.target.value })}
                    className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white text-sm focus:border-purple-500/50 focus:outline-none transition-all input-focus"
                    placeholder="claude-3-5-haiku-..."
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-8">
              <button
                onClick={() => {
                  setShowAddProfileModal(false);
                  setNewProfileForm({ name: '', baseUrl: '', authToken: '', haikuModel: '', opusModel: '', sonnetModel: '', smallFastModel: '' });
                }}
                className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-all ripple-effect"
              >
                Cancel
              </button>
              <button
                onClick={addNewProfile}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-purple-500/50 transition-all ripple-effect pulse-ring neon-glow"
              >
                Add Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-dark border border-red-500/30 rounded-2xl p-8 max-w-md w-full animate-slide-up shadow-2xl shadow-red-500/20 neon-glow">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 pulse-ring">
                <Trash2 className="w-8 h-8 text-red-400" />
        </div>
              <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-pink-400 mb-2">Delete {activeTab === 'mcp' ? 'Server' : activeTab === 'env' ? 'Profile' : 'Command'}?</h3>
              <p className="text-gray-400 mb-6">
                Are you sure you want to delete <span className="text-white font-medium">{itemToDelete}</span>? This action cannot be undone.
              </p>
              
              <div className="flex justify-center space-x-4">
              <button
                        onClick={() => {
                    setShowDeleteConfirm(false);
                    setItemToDelete(null);
                  }}
                  className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-all ripple-effect"
                >
                  Cancel
              </button>
                        <button
                          onClick={() => {
                    if (itemToDelete) {
                      if (activeTab === 'mcp') {
                        deleteServer(itemToDelete);
                      } else if (activeTab === 'env') {
                        deleteProfile(itemToDelete);
                      } else {
                        deleteCommand(itemToDelete);
                      }
                    }
                  }}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-red-500 to-pink-500 text-white font-medium hover:shadow-lg hover:shadow-red-500/50 transition-all ripple-effect pulse-ring"
                >
                  Delete
                </button>
              </div>
              </div>
            </div>
        </div>
      )}

      {/* Logs Viewer Modal */}
      {showLogsModal && logsServerName && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-dark border border-blue-500/30 rounded-2xl p-8 max-w-4xl w-full h-[600px] animate-slide-up shadow-2xl shadow-blue-500/20 neon-glow flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center pulse-ring">
                  <FileText className="w-6 h-6 text-blue-400" />
              </div>
                <div>
                  <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                    Server Logs
                  </h3>
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
    </div>
  );
}

export default App;

