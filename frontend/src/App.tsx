import { useEffect, useState } from 'react';
import { Check, Command, RefreshCw, Server, Settings, Terminal, Trash2, X, Zap } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { useElectron } from './useElectron';
import {
  deleteCommand,
  deleteEnvProfile,
  deleteSkill,
  getAllMcpStatuses,
  getClaudeConfig,
  getCommands,
  getEnvProfiles,
  getSkills,
  saveClaudeConfig,
} from './api';
import type { ClaudeConfig, CommandFile, EnvProfile, McpStatus, RefreshProgress, Skill, TabType } from './types';
import { McpTab } from './components/tabs/McpTab';
import { EnvTab } from './components/tabs/EnvTab';
import { CommandsTab } from './components/tabs/CommandsTab';
import { SkillsTab } from './components/tabs/SkillsTab';

function App() {
  const electron = useElectron();

  useEffect(() => {
    document.title = 'Claude Workbench';
  }, []);

  const [activeTab, setActiveTab] = useState<TabType>('mcp');
  const [claudeConfig, setClaudeConfig] = useState<ClaudeConfig>({});
  const [commands, setCommands] = useState<CommandFile[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [envProfiles, setEnvProfiles] = useState<EnvProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  const [mcpStatuses, setMcpStatuses] = useState<Record<string, McpStatus>>({});
  const [isLoadingStatus, setIsLoadingStatus] = useState<Record<string, boolean>>({});
  const [isRefreshingConfig, setIsRefreshingConfig] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [showRefreshModal, setShowRefreshModal] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<RefreshProgress>({
    mcpConfig: 'pending',
    envProfiles: 'pending',
    commands: 'pending',
    skills: 'pending',
  });

  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error';
  }>({ show: false, message: '', type: 'success' });

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: '', type: 'success' });
    }, 3000);

    if (electron.isElectron) {
      const title = type === 'success' ? 'Claude Workbench' : 'Error';
      electron.showNotification(title, message);
    }
  };

  const loadConfig = async (showProgress = false) => {
    setIsRefreshingConfig(true);

    if (showProgress) {
      setShowRefreshModal(true);
      setRefreshProgress({ mcpConfig: 'pending', envProfiles: 'pending', commands: 'pending', skills: 'pending' });
    }

    try {
      if (showProgress) setRefreshProgress((prev) => ({ ...prev, mcpConfig: 'loading' }));
      try {
        const config = await getClaudeConfig();
        setClaudeConfig(config);
        if (showProgress) setRefreshProgress((prev) => ({ ...prev, mcpConfig: 'done' }));
      } catch {
        if (showProgress) setRefreshProgress((prev) => ({ ...prev, mcpConfig: 'error' }));
      }

      if (showProgress) setRefreshProgress((prev) => ({ ...prev, envProfiles: 'loading' }));
      try {
        const data = await getEnvProfiles();
        setEnvProfiles(data.profiles);
        setActiveProfileId(data.activeProfileId);
        if (showProgress) setRefreshProgress((prev) => ({ ...prev, envProfiles: 'done' }));
      } catch {
        if (showProgress) setRefreshProgress((prev) => ({ ...prev, envProfiles: 'error' }));
      }

      if (showProgress) setRefreshProgress((prev) => ({ ...prev, commands: 'loading' }));
      try {
        const cmdData = await getCommands();
        setCommands(cmdData);
        if (showProgress) setRefreshProgress((prev) => ({ ...prev, commands: 'done' }));
      } catch {
        if (showProgress) setRefreshProgress((prev) => ({ ...prev, commands: 'error' }));
      }

      if (showProgress) setRefreshProgress((prev) => ({ ...prev, skills: 'loading' }));
      try {
        const skillData = await getSkills();
        setSkills(skillData);
        if (showProgress) setRefreshProgress((prev) => ({ ...prev, skills: 'done' }));
      } catch {
        if (showProgress) setRefreshProgress((prev) => ({ ...prev, skills: 'error' }));
      }

      if (showProgress) {
        setTimeout(() => {
          setShowRefreshModal(false);
        }, 1500);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      showNotification('Failed to load configuration', 'error');
      if (showProgress) {
        setTimeout(() => {
          setShowRefreshModal(false);
        }, 2000);
      }
    } finally {
      setIsRefreshingConfig(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    const pollStatuses = async () => {
      try {
        const statuses = await getAllMcpStatuses();
        setMcpStatuses(statuses);
      } catch (error) {
        console.error('Failed to poll MCP statuses:', error);
      }
    };

    pollStatuses();
    const interval = setInterval(pollStatuses, 3000);
    return () => clearInterval(interval);
  }, []);

  const requestDelete = (itemNameOrId: string) => {
    setItemToDelete(itemNameOrId);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      if (activeTab === 'mcp') {
        const newServers = { ...claudeConfig.mcpServers };
        delete newServers[itemToDelete];
        const newConfig = { ...claudeConfig, mcpServers: newServers };
        setClaudeConfig(newConfig);
        await saveClaudeConfig(newConfig);
        showNotification('Server deleted successfully!');
      } else if (activeTab === 'env') {
        await deleteEnvProfile(itemToDelete);
        showNotification('Profile deleted successfully!');
        await loadConfig();
      } else if (activeTab === 'commands') {
        await deleteCommand(itemToDelete);
        showNotification('Command deleted successfully!');
        await loadConfig();
      } else if (activeTab === 'skills') {
        await deleteSkill(itemToDelete);
        showNotification('Skill deleted successfully!');
        await loadConfig();
      }
    } catch (error) {
      const fallback =
        activeTab === 'mcp'
          ? 'Failed to delete server'
          : activeTab === 'env'
            ? 'Failed to delete profile'
            : activeTab === 'commands'
              ? 'Failed to delete command'
              : 'Failed to delete skill';
      showNotification(error instanceof Error ? error.message : fallback, 'error');
    } finally {
      setShowDeleteConfirm(false);
      setItemToDelete(null);
    }
  };

  const getDeleteItemDisplayName = (): string => {
    if (!itemToDelete) return '';
    if (activeTab === 'env') {
      const profile = envProfiles.find((p) => p.id === itemToDelete);
      return profile?.name || itemToDelete;
    }
    return itemToDelete;
  };


  return (
    <div className="min-h-screen relative overflow-hidden">
      {notification.show && (
        <div className="fixed top-8 left-1/2 transform -translate-x-1/2 z-[100] animate-slide-down">
          <div
            className={`glass px-8 py-4 rounded-2xl shadow-2xl flex items-center space-x-3  ${
              notification.type === 'success' ? 'border-l-4 border-green-500' : 'border-l-4 border-red-500'
            }`}
          >
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

      <div className="flex h-screen">
        <nav className="w-72 glass-dark border-r border-zinc-800 flex flex-col p-6 relative z-10 titlebar-no-drag">
          {electron.isElectron && <div className="titlebar-drag absolute top-0 left-0 right-0 h-20 z-50 pointer-events-auto" />}

          <div className="mb-12 mt-8  relative z-10 titlebar-no-drag">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center ">
                <Zap className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold  text-white">
                  Claude Code
                </h1>
                <p className="text-xs text-gray-400">Workbench</p>
              </div>
            </div>
          </div>

          <div className="space-y-2 flex-1">
            <button
              onClick={() => setActiveTab('mcp')}
              className={`w-full flex items-center space-x-3 px-4 py-4 rounded-xl transition-all group  ${
                activeTab === 'mcp'
                  ? 'glass border border-zinc-600 shadow-lg shadow-black/20 '
                  : 'hover:glass border border-transparent hover:border-zinc-700'
              }`}
            >
              <div
                className={`p-2 rounded-lg transition-all ${
                  activeTab === 'mcp' ? 'bg-zinc-700 pulse-ring' : 'bg-zinc-900 group-hover:bg-zinc-800/50'
                }`}
              >
                <Server className="w-5 h-5 text-white" />
              </div>
              <span className="font-medium text-white">MCP Servers</span>
              {activeTab === 'mcp' && <div className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>}
            </button>

            <button
              onClick={() => setActiveTab('env')}
              className={`w-full flex items-center space-x-3 px-4 py-4 rounded-xl transition-all group  ${
                activeTab === 'env'
                  ? 'glass border border-zinc-600 shadow-lg shadow-black/20 '
                  : 'hover:glass border border-transparent hover:border-zinc-700'
              }`}
            >
              <div
                className={`p-2 rounded-lg transition-all ${
                  activeTab === 'env' ? 'bg-zinc-700 pulse-ring' : 'bg-zinc-900 group-hover:bg-zinc-800/50'
                }`}
              >
                <Terminal className="w-5 h-5 text-white" />
              </div>
              <span className="font-medium text-white">Environment</span>
              {activeTab === 'env' && <div className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>}
            </button>

            <button
              onClick={() => setActiveTab('commands')}
              className={`w-full flex items-center space-x-3 px-4 py-4 rounded-xl transition-all group  ${
                activeTab === 'commands'
                  ? 'glass border border-zinc-600 shadow-lg shadow-black/20 '
                  : 'hover:glass border border-transparent hover:border-zinc-700'
              }`}
            >
              <div
                className={`p-2 rounded-lg transition-all ${
                  activeTab === 'commands' ? 'bg-zinc-700 pulse-ring' : 'bg-zinc-900 group-hover:bg-zinc-800/50'
                }`}
              >
                <Command className="w-5 h-5 text-white" />
              </div>
              <span className="font-medium text-white">Commands</span>
              {activeTab === 'commands' && <div className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>}
            </button>

            <button
              onClick={() => setActiveTab('skills')}
              className={`w-full flex items-center space-x-3 px-4 py-4 rounded-xl transition-all group  ${
                activeTab === 'skills'
                  ? 'glass border border-zinc-600 shadow-lg shadow-black/20 '
                  : 'hover:glass border border-transparent hover:border-zinc-700'
              }`}
            >
              <div
                className={`p-2 rounded-lg transition-all ${
                  activeTab === 'skills' ? 'bg-zinc-700 pulse-ring' : 'bg-zinc-900 group-hover:bg-zinc-800/50'
                }`}
              >
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="font-medium text-white">Skills</span>
              {activeTab === 'skills' && <div className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>}
            </button>
          </div>

          <button
            onClick={() => loadConfig(true)}
            disabled={isRefreshingConfig}
            className="mt-auto w-full glass hover:border-zinc-600 border border-zinc-800 px-4 py-3 rounded-xl flex items-center justify-center space-x-2 transition-all hover:shadow-lg hover:shadow-black/20  group tooltip disabled:opacity-50 disabled:cursor-not-allowed"
            data-tooltip={isRefreshingConfig ? 'Refreshing...' : 'Reload configuration from disk'}
          >
            <RefreshCw className={`w-4 h-4 text-zinc-100 transition-transform duration-500 ${isRefreshingConfig ? 'animate-spin' : 'group-hover:rotate-180'}`} />
            <span className="text-sm text-gray-300">{isRefreshingConfig ? 'Refreshing...' : 'Refresh Config'}</span>
          </button>

          <div className="mt-4">
            <ThemeToggle />
          </div>

          {electron.isElectron && (
            <div className="mt-4 p-3 glass border border-zinc-800 rounded-lg">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center space-x-2">
                  <Settings className="w-4 h-4 text-zinc-100" />
                  <span className="text-sm text-gray-300">Launch at Startup</span>
                </div>
                <input
                  type="checkbox"
                  checked={electron.autoLaunchEnabled}
                  onChange={async (e) => {
                    try {
                      await electron.setAutoLaunch(e.target.checked);
                      showNotification(e.target.checked ? 'Auto-launch enabled' : 'Auto-launch disabled', 'success');
                    } catch {
                      showNotification('Failed to update auto-launch setting', 'error');
                    }
                  }}
                  className="rounded bg-zinc-900 border-zinc-800 text-purple-500 focus:ring-purple-500"
                />
              </label>
              <p className="text-xs text-gray-500 mt-1 ml-6">Start Claude Workbench when you log in</p>
            </div>
          )}

          {electron.isElectron && <div className="mt-4 text-xs text-center text-zinc-100/60">Desktop App v1.0</div>}
        </nav>

        <div className="flex-1 overflow-y-auto relative z-10 titlebar-no-drag">

          {activeTab === 'mcp' && (
            <McpTab
              claudeConfig={claudeConfig}
              setClaudeConfig={setClaudeConfig}
              mcpStatuses={mcpStatuses}
              setMcpStatuses={setMcpStatuses}
              isLoadingStatus={isLoadingStatus}
              setIsLoadingStatus={setIsLoadingStatus}
              showNotification={showNotification}
              loadConfig={loadConfig}
              requestDelete={requestDelete}
            />
          )}

          {activeTab === 'env' && (
            <EnvTab
              envProfiles={envProfiles}
              activeProfileId={activeProfileId}
              showNotification={showNotification}
              loadConfig={loadConfig}
              requestDelete={requestDelete}
            />
          )}

          {activeTab === 'commands' && (
            <CommandsTab
              commands={commands}
              showNotification={showNotification}
              loadConfig={loadConfig}
              requestDelete={requestDelete}
            />
          )}

          {activeTab === 'skills' && (
            <SkillsTab
              skills={skills}
              showNotification={showNotification}
              loadConfig={loadConfig}
              requestDelete={requestDelete}
            />
          )}
        </div>

        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="glass-dark border border-red-800/50 rounded-2xl p-8 max-w-md w-full animate-slide-up shadow-2xl shadow-black/20 ">
              <div className="text-center">
                <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 pulse-ring">
                  <Trash2 className="w-8 h-8 text-red-400" />
                </div>
                <h3 className="text-2xl font-bold  text-white mb-2">
                  Delete {activeTab === 'mcp' ? 'Server' : activeTab === 'env' ? 'Profile' : activeTab === 'commands' ? 'Command' : 'Skill'}?
                </h3>
                <p className="text-gray-400 mb-6">
                  Are you sure you want to delete <span className="text-white font-medium">{getDeleteItemDisplayName()}</span>? This action cannot be undone.
                </p>

                <div className="flex justify-center space-x-4">
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setItemToDelete(null);
                    }}
                    className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-zinc-800 transition-all "
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="px-6 py-3 rounded-xl bg-red-900 text-red-100 hover:bg-red-800 text-white font-medium hover:shadow-lg hover:shadow-black/40 transition-all  pulse-ring"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showRefreshModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="glass-dark border border-zinc-700 rounded-2xl p-8 max-w-md w-full animate-slide-up shadow-2xl shadow-black/20 ">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4 pulse-ring">
                  <RefreshCw className="w-8 h-8 text-zinc-100 animate-spin" />
                </div>
                <h3 className="text-2xl font-bold  text-white mb-2">
                  Refreshing Configuration
                </h3>
                <p className="text-gray-400 text-sm">Loading configuration from disk...</p>
              </div>

              <div className="space-y-4">
                {(
                  [
                    ['mcpConfig', 'MCP Servers Configuration'],
                    ['envProfiles', 'Environment Profiles'],
                    ['commands', 'Custom Commands'],
                    ['skills', 'Personal Skills'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      {refreshProgress[key] === 'pending' && <div className="w-6 h-6 rounded-full border-2 border-gray-600"></div>}
                      {refreshProgress[key] === 'loading' && (
                        <div className="w-6 h-6 rounded-full border-2 border-purple-400 border-t-transparent animate-spin"></div>
                      )}
                      {refreshProgress[key] === 'done' && (
                        <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                      {refreshProgress[key] === 'error' && (
                        <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                          <X className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div
                        className={`text-sm font-medium ${
                          refreshProgress[key] === 'done'
                            ? 'text-green-400'
                            : refreshProgress[key] === 'error'
                              ? 'text-red-400'
                              : refreshProgress[key] === 'loading'
                                ? 'text-zinc-100'
                                : 'text-gray-400'
                        }`}
                      >
                        {label}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white text-black hover:bg-zinc-200 transition-all duration-500 ease-out"
                    style={{
                      width: `${
                        ((refreshProgress.mcpConfig === 'done' || refreshProgress.mcpConfig === 'error' ? 1 : 0) +
                          (refreshProgress.envProfiles === 'done' || refreshProgress.envProfiles === 'error' ? 1 : 0) +
                          (refreshProgress.commands === 'done' || refreshProgress.commands === 'error' ? 1 : 0) +
                          (refreshProgress.skills === 'done' || refreshProgress.skills === 'error' ? 1 : 0)) /
                        4 *
                        100
                      }%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
