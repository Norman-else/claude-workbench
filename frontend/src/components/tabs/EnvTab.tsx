import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Copy, Edit2, Eye, EyeOff, FileText, Play, Plus, Save, Settings, Square, Terminal, Trash2, X } from 'lucide-react';
import { activateEnvProfile, createEnvProfile, deactivateEnvProfile, getClaudeSettingsContent, getShellConfigContent, reorderEnvProfiles, saveClaudeSettingsContent, saveShellConfigContent, updateEnvProfile } from '../../api';
import type { EnvProfile, EnvProfileForm, ViewMode } from '../../types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  DragOverlay,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface EnvTabProps {
  envProfiles: EnvProfile[];
  activeProfileId: string | null;
  showNotification: (message: string, type?: 'success' | 'error') => void;
  loadConfig: (showProgress?: boolean) => Promise<void>;
  requestDelete: (itemId: string) => void;
}

const emptyProfileForm: EnvProfileForm = {
  name: '',
  baseUrl: '',
  apiKey: '',
  authToken: '',
  haikuModel: '',
  opusModel: '',
  sonnetModel: '',
  smallFastModel: '',
};


interface SortableProfileCardProps {
  profile: EnvProfile;
  isActive: boolean;
  onOpen: (id: string) => void;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function SortableProfileCard({ profile, isActive, onOpen, onActivate, onDeactivate, onEdit, onDelete }: SortableProfileCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: profile.id });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? 'none' : transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
    position: isDragging ? ('relative' as const) : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(profile.id)}
      className="glass border border-zinc-800 rounded-2xl p-6 card-hover group  relative h-[320px] flex flex-col cursor-pointer"
    >
      {isActive && (
        <div className="absolute top-4 right-4 flex items-center space-x-2 bg-green-900/30 px-3 py-1 rounded-full border border-zinc-600">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span className="text-xs text-green-400 font-medium">Active</span>
        </div>
      )}

      <div className="flex items-start mb-4">
        <div className="p-3 rounded-xl bg-zinc-800/50 group-hover:bg-zinc-700/50 transition-all ">
          <Settings className="w-6 h-6 text-zinc-100" />
        </div>
      </div>

      <h3 className="text-xl font-bold text-white mb-2">{profile.name}</h3>

      <div className="space-y-2 text-sm mb-4 flex-1">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-gray-500" />
          <span className="text-gray-400 font-mono text-xs truncate">{profile.baseUrl || 'No base URL'}</span>
        </div>
        {profile.apiKey && (
          <div className="flex items-center space-x-1 ml-6">
            <div className="px-2 py-1 bg-green-900/20 rounded text-xs text-green-400">API Key Configured</div>
          </div>
        )}
        {profile.authToken && (
          <div className="flex items-center space-x-1 ml-6">
            <div className="px-2 py-1 bg-zinc-800/50 rounded text-xs text-zinc-300">Auth Token Configured</div>
          </div>
        )}
        <div className="text-xs text-gray-500 mt-2">Created: {new Date(profile.createdAt).toLocaleDateString()}</div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-4 border-t border-zinc-800 mt-auto">
        {!isActive ? (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onActivate(profile.id); }}
              className="flex-1 glass hover:border-zinc-600 border border-zinc-800 px-4 py-2 rounded-xl flex items-center justify-center space-x-2 transition-all hover:shadow-lg hover:shadow-black/20 bg-zinc-800/50"
            >
              <Play className="w-4 h-4 text-green-400" />
              <span className="text-xs text-white font-medium">Activate</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(profile.id); }}
              className="p-2 glass hover:border-zinc-600 border border-zinc-800 rounded-xl transition-all"
            >
              <Edit2 className="w-4 h-4 text-zinc-100" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(profile.id); }}
              className="p-2 glass hover:border-red-700/50 border border-red-900/50 rounded-xl transition-all tooltip"
              data-tooltip="Delete profile"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onDeactivate(profile.id); }}
              className="flex-1 glass hover:border-yellow-700/50 border border-yellow-900/50 px-4 py-2 rounded-xl flex items-center justify-center space-x-2 transition-all hover:shadow-lg hover:shadow-black/20 bg-zinc-800/50"
            >
              <Square className="w-4 h-4 text-yellow-400" />
              <span className="text-xs text-white font-medium">Deactivate</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(profile.id); }}
              className="p-2 glass hover:border-zinc-600 border border-zinc-800 rounded-xl transition-all"
            >
              <Edit2 className="w-4 h-4 text-zinc-100" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
export function EnvTab({ envProfiles, activeProfileId, showNotification, loadConfig, requestDelete }: EnvTabProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [envViewMode, setEnvViewMode] = useState<ViewMode>('list');
  const [editingProfile, setEditingProfile] = useState<EnvProfile | null>(null);
  const [showAddProfileModal, setShowAddProfileModal] = useState(false);
  const [newProfileForm, setNewProfileForm] = useState<EnvProfileForm>(emptyProfileForm);

  // Local profiles state for optimistic drag reorder
  const [localProfiles, setLocalProfiles] = useState<EnvProfile[]>(envProfiles);
  useEffect(() => { setLocalProfiles(envProfiles); }, [envProfiles]);

  // Active drag item for DragOverlay
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localProfiles.findIndex((p) => p.id === active.id);
    const newIndex = localProfiles.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(localProfiles, oldIndex, newIndex);
    setLocalProfiles(reordered);
    try {
      await reorderEnvProfiles(reordered.map((p: EnvProfile) => p.id));
    } catch {
      showNotification('Failed to save order', 'error');
      setLocalProfiles(envProfiles); // revert on error
    }
  };

  const [showConfigFileModal, setShowConfigFileModal] = useState(false);
  const [configFileContent, setConfigFileContent] = useState('');
  const [configFilePath, setConfigFilePath] = useState('');
  const [isLoadingConfigFile, setIsLoadingConfigFile] = useState(false);
  const [isSavingConfigFile, setIsSavingConfigFile] = useState(false);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsContent, setSettingsContent] = useState('');
  const [settingsFilePath, setSettingsFilePath] = useState('');
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const handleSaveConfigFile = async () => {
    setIsSavingConfigFile(true);
    try {
      await saveShellConfigContent(configFileContent);
      showNotification('Configuration saved successfully!');
    } catch {
      showNotification('Failed to save configuration', 'error');
    } finally {
      setIsSavingConfigFile(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      JSON.parse(settingsContent);
    } catch {
      showNotification('Invalid JSON — please fix errors before saving', 'error');
      return;
    }
    setIsSavingSettings(true);
    try {
      await saveClaudeSettingsContent(settingsContent);
      showNotification('Claude Settings saved successfully!');
    } catch {
      showNotification('Failed to save settings', 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };
  const openProfileDetail = (profileId: string) => {
    const profile = envProfiles.find((p) => p.id === profileId);
    if (profile) {
      setEditingProfile({ ...profile });
      setEnvViewMode('detail');
    }
  };

  const saveProfileDetail = async () => {
    if (!editingProfile) return;
    try {
      await updateEnvProfile(editingProfile.id, editingProfile);
      showNotification('Profile updated successfully!');
      await loadConfig();
      setEnvViewMode('list');
      setEditingProfile(null);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Failed to save profile', 'error');
    }
  };

  const addNewProfile = async () => {
    if (!newProfileForm.name) {
      showNotification('Please fill in profile name', 'error');
      return;
    }

    try {
      await createEnvProfile(newProfileForm);
      showNotification('Profile added successfully!');
      await loadConfig();
      setShowAddProfileModal(false);
      setNewProfileForm(emptyProfileForm);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Failed to add profile', 'error');
    }
  };

  const viewConfigFile = async () => {
    setIsLoadingConfigFile(true);
    setShowConfigFileModal(true);
    setConfigFileContent('Loading...');

    try {
      const data = await getShellConfigContent();
      setConfigFilePath(data.configPath);
      setConfigFileContent(data.content);
    } catch {
      setConfigFileContent('Error loading configuration file');
      showNotification('Error loading configuration file', 'error');
    } finally {
      setIsLoadingConfigFile(false);
    }
  };

  const viewClaudeSettings = async () => {
    setIsLoadingSettings(true);
    setShowSettingsModal(true);
    setSettingsContent('Loading...');

    try {
      const data = await getClaudeSettingsContent();
      setSettingsFilePath(data.configPath);
      setSettingsContent(data.content);
    } catch {
      setSettingsContent('Error loading settings file');
      showNotification('Error loading Claude settings', 'error');
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const activateProfile = async (profileId: string) => {
    try {
      const data = await activateEnvProfile(profileId);
      showNotification(data.message || 'Profile activated successfully!');
      await loadConfig();
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Failed to activate profile', 'error');
    }
  };

  const deactivateProfile = async (profileId: string) => {
    try {
      const data = await deactivateEnvProfile(profileId);
      showNotification(data.message || 'Profile deactivated successfully!');
      await loadConfig();
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Failed to deactivate profile', 'error');
    }
  };

  return (
    <>
      <div className="p-8">
        {envViewMode === 'list' ? (
          <div>
            <div className="flex items-center justify-between mb-8 titlebar-no-drag">
              <div>
                <h2 className="text-3xl font-bold  text-white mb-2">
                  Environment Profiles
                </h2>
                <p className="text-gray-400">Manage your API credential profiles</p>
              </div>
              <div className="flex items-center space-x-3 titlebar-no-drag">
                <button
                  onClick={viewConfigFile}
                  className="glass hover:border-zinc-600 border border-zinc-800 px-6 py-3 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-black/20 group   titlebar-no-drag"
                >
                  <FileText className="w-5 h-5 text-zinc-300 group-hover:scale-110 transition-transform duration-300" />
                  <span className="text-white font-medium">View Config</span>
                </button>
                <button
                  onClick={viewClaudeSettings}
                  className="glass hover:border-zinc-600 border border-zinc-800 px-6 py-3 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-black/20 group   titlebar-no-drag"
                >
                  <Settings className="w-5 h-5 text-green-400 group-hover:rotate-45 transition-transform duration-300" />
                  <span className="text-white font-medium">Claude Settings</span>
                </button>
                <button
                  onClick={() => setShowAddProfileModal(true)}
                  className="glass hover:border-zinc-600 border border-zinc-800 px-6 py-3 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-black/20 group   titlebar-no-drag"
                >
                  <Plus className="w-5 h-5 text-zinc-100 group-hover:rotate-90 transition-transform duration-300" />
                  <span className="text-white font-medium">Add Profile</span>
                </button>
              </div>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <SortableContext items={localProfiles.map((p) => p.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {localProfiles.map((profile) => (
                    <SortableProfileCard
                      key={profile.id}
                      profile={profile}
                      isActive={profile.id === activeProfileId}
                      onOpen={openProfileDetail}
                      onActivate={activateProfile}
                      onDeactivate={deactivateProfile}
                      onEdit={openProfileDetail}
                      onDelete={requestDelete}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
                {activeId ? (() => {
                  const profile = localProfiles.find((p) => p.id === activeId);
                  if (!profile) return null;
                  return (
                    <div className="glass border border-zinc-700 rounded-2xl p-6 shadow-2xl shadow-black/30 h-[320px] flex flex-col opacity-95 rotate-1 scale-105" style={{ cursor: 'grabbing' }}>
                      <div className="flex items-start mb-4">
                        <div className="p-3 rounded-xl bg-zinc-800/80 ">
                          <Settings className="w-6 h-6 text-zinc-100" />
                        </div>
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">{profile.name}</h3>
                      <div className="space-y-2 text-sm flex-1">
                        <div className="flex items-center space-x-2">
                          <Terminal className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-400 font-mono text-xs truncate">{profile.baseUrl || 'No base URL'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })() : null}
              </DragOverlay>
            </DndContext>

            {localProfiles.length === 0 && (
              <div className="text-center py-16">
                <Settings className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 mb-4">No environment profiles configured yet</p>
                <button
                  onClick={() => setShowAddProfileModal(true)}
                  className="glass hover:border-zinc-600 border border-zinc-800 px-6 py-3 rounded-xl inline-flex items-center space-x-2"
                >
                  <Plus className="w-5 h-5 text-zinc-100" />
                  <span className="text-white font-medium">Add Your First Profile</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-center space-x-4 mb-8 relative z-[60]">
              <button
                onClick={() => {
                  setEnvViewMode('list');
                  setEditingProfile(null);
                }}
                className="p-2 rounded-lg hover:bg-zinc-800 transition-colors titlebar-no-drag"
              >
                <ArrowLeft className="w-6 h-6 text-zinc-100" />
              </button>
              <div>
                <h2 className="text-3xl font-bold  text-white">
                  {editingProfile?.name}
                </h2>
                <p className="text-gray-400">Edit profile configuration</p>
              </div>
            </div>

            <div className="glass border border-zinc-800 rounded-2xl p-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Profile Name</label>
                  <input
                    type="text"
                    value={editingProfile?.name || ''}
                    onChange={(e) => setEditingProfile((prev) => (prev ? { ...prev, name: e.target.value } : null))}
                    className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-zinc-600 focus:outline-none transition-colors"
                    placeholder="e.g., Production, Development"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">ANTHROPIC_BASE_URL</label>
                  <input
                    type="text"
                    value={editingProfile?.baseUrl || ''}
                    onChange={(e) => setEditingProfile((prev) => (prev ? { ...prev, baseUrl: e.target.value } : null))}
                    className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-zinc-600 focus:outline-none transition-colors"
                    placeholder="https://api.anthropic.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">ANTHROPIC_API_KEY</label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={editingProfile?.apiKey || ''}
                      onChange={(e) => setEditingProfile((prev) => (prev ? { ...prev, apiKey: e.target.value } : null))}
                      className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 pr-12 text-white focus:border-zinc-600 focus:outline-none transition-colors font-mono"
                      placeholder="sk-ant-..."
                    />
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">ANTHROPIC_AUTH_TOKEN (Optional)</label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={editingProfile?.authToken || ''}
                      onChange={(e) => setEditingProfile((prev) => (prev ? { ...prev, authToken: e.target.value } : null))}
                      className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 pr-12 text-white focus:border-zinc-600 focus:outline-none transition-colors font-mono"
                      placeholder="Optional auth token..."
                    />
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Haiku Model</label>
                    <input
                      type="text"
                      value={editingProfile?.haikuModel || ''}
                      onChange={(e) => setEditingProfile((prev) => (prev ? { ...prev, haikuModel: e.target.value } : null))}
                      className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:border-zinc-600 focus:outline-none transition-colors"
                      placeholder="claude-3-5-haiku-..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Opus Model</label>
                    <input
                      type="text"
                      value={editingProfile?.opusModel || ''}
                      onChange={(e) => setEditingProfile((prev) => (prev ? { ...prev, opusModel: e.target.value } : null))}
                      className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:border-zinc-600 focus:outline-none transition-colors"
                      placeholder="claude-3-opus-..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Sonnet Model</label>
                    <input
                      type="text"
                      value={editingProfile?.sonnetModel || ''}
                      onChange={(e) => setEditingProfile((prev) => (prev ? { ...prev, sonnetModel: e.target.value } : null))}
                      className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:border-zinc-600 focus:outline-none transition-colors"
                      placeholder="claude-3-5-sonnet-..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Small Fast Model</label>
                    <input
                      type="text"
                      value={editingProfile?.smallFastModel || ''}
                      onChange={(e) => setEditingProfile((prev) => (prev ? { ...prev, smallFastModel: e.target.value } : null))}
                      className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:border-zinc-600 focus:outline-none transition-colors"
                      placeholder="claude-3-5-haiku-..."
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-4 pt-6 border-t border-zinc-800">
                  <button
                    onClick={() => {
                      setEnvViewMode('list');
                      setEditingProfile(null);
                    }}
                    className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveProfileDetail}
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
      </div>

      {showConfigFileModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-dark border border-zinc-700 rounded-2xl p-8 max-w-5xl w-full h-[90vh] flex flex-col animate-slide-up shadow-2xl shadow-black/20 ">
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <div>
                <h3 className="text-2xl font-bold  text-white mb-2">
                  Shell Configuration File
                </h3>
                <p className="text-gray-400 text-sm">{configFilePath || 'Loading...'}</p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(configFileContent);
                  showNotification('Configuration copied to clipboard!');
                }}
                className="glass hover:border-zinc-600 border border-zinc-800 px-4 py-2 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-black/20 group"
                disabled={isLoadingConfigFile}
              >
                <Copy className="w-4 h-4 text-zinc-300" />
                <span className="text-white text-sm">Copy</span>
              </button>
            </div>

            <div className="flex-1 min-h-0 mb-6">
              <div className="glass border border-zinc-800 rounded-xl p-6 h-full overflow-y-auto font-mono text-sm" style={{ maxHeight: '100%' }}>
                {isLoadingConfigFile ? (
                  <div className="flex items-center justify-center h-full min-h-[300px]">
                    <div className="flex flex-col items-center space-y-4">
                      <div className="w-12 h-12 border-4 border-zinc-800 border-t-blue-500 rounded-full animate-spin"></div>
                      <p className="text-gray-400">Loading configuration file...</p>
                    </div>
                  </div>
                ) : (
                  <textarea
                    className="text-gray-300 whitespace-pre-wrap break-words w-full h-full bg-transparent resize-none focus:outline-none font-mono text-sm"
                    value={configFileContent}
                    onChange={(e) => setConfigFileContent(e.target.value)}
                    spellCheck={false}
                  />
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-3 flex-shrink-0 mt-auto">
              <button
                onClick={() => setShowConfigFileModal(false)}
                className="glass hover:border-zinc-600 border border-zinc-800 px-6 py-3 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-black/20 "
              >
                <X className="w-5 h-5 text-gray-400" />
                <span className="text-white font-medium">Close</span>
              </button>
              <button
                onClick={handleSaveConfigFile}
                disabled={isSavingConfigFile || isLoadingConfigFile}
                className="px-6 py-3 rounded-xl bg-white text-black hover:bg-zinc-200 font-medium hover:shadow-lg hover:shadow-black/40 transition-colors flex items-center justify-center min-w-[96px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                <span className="w-[52px] text-center">{isSavingConfigFile ? 'Saving...' : 'Save'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-dark border border-zinc-700 rounded-2xl p-8 max-w-5xl w-full h-[90vh] flex flex-col animate-slide-up shadow-2xl shadow-black/20 ">
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <div>
                <h3 className="text-2xl font-bold  text-white mb-2">
                  Claude Settings
                </h3>
                <p className="text-gray-400 text-sm">{settingsFilePath || 'Loading...'}</p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(settingsContent);
                  showNotification('Settings copied to clipboard!');
                }}
                className="glass hover:border-zinc-600 border border-zinc-800 px-4 py-2 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-black/20 group"
                disabled={isLoadingSettings}
              >
                <Copy className="w-4 h-4 text-green-400" />
                <span className="text-white text-sm">Copy</span>
              </button>
            </div>

            <div className="flex-1 min-h-0 mb-6">
              <div className="glass border border-zinc-800 rounded-xl p-6 h-full overflow-y-auto font-mono text-sm" style={{ maxHeight: '100%' }}>
                {isLoadingSettings ? (
                  <div className="flex items-center justify-center h-full min-h-[300px]">
                    <div className="flex flex-col items-center space-y-4">
                      <div className="w-12 h-12 border-4 border-zinc-800 border-t-green-500 rounded-full animate-spin"></div>
                      <p className="text-gray-400">Loading settings file...</p>
                    </div>
                  </div>
                ) : (
                  <textarea
                    className="text-gray-300 whitespace-pre-wrap break-words w-full h-full bg-transparent resize-none focus:outline-none font-mono text-sm"
                    value={settingsContent}
                    onChange={(e) => setSettingsContent(e.target.value)}
                    spellCheck={false}
                  />
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-3 flex-shrink-0 mt-auto">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="glass hover:border-zinc-600 border border-zinc-800 px-6 py-3 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-black/20 "
              >
                <X className="w-5 h-5 text-gray-400" />
                <span className="text-white font-medium">Close</span>
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={isSavingSettings || isLoadingSettings}
                className="px-6 py-3 rounded-xl bg-white text-black hover:bg-zinc-200 font-medium hover:shadow-lg hover:shadow-black/40 transition-colors flex items-center justify-center min-w-[96px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                <span className="w-[52px] text-center">{isSavingSettings ? 'Saving...' : 'Save'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddProfileModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-dark border border-zinc-700 rounded-2xl p-8 max-w-2xl w-full animate-slide-up shadow-2xl shadow-black/20 ">
            <h3 className="text-2xl font-bold  text-white mb-6">Add New Environment Profile</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Profile Name</label>
                <input
                  type="text"
                  value={newProfileForm.name}
                  onChange={(e) => setNewProfileForm({ ...newProfileForm, name: e.target.value })}
                  className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-zinc-600 focus:outline-none transition-all input-focus"
                  placeholder="e.g., Production, Development, Testing"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">ANTHROPIC_BASE_URL</label>
                <input
                  type="text"
                  value={newProfileForm.baseUrl}
                  onChange={(e) => setNewProfileForm({ ...newProfileForm, baseUrl: e.target.value })}
                  className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-zinc-600 focus:outline-none transition-all input-focus"
                  placeholder="https://api.anthropic.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">ANTHROPIC_API_KEY</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={newProfileForm.apiKey}
                    onChange={(e) => setNewProfileForm({ ...newProfileForm, apiKey: e.target.value })}
                    className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 pr-12 text-white focus:border-zinc-600 focus:outline-none transition-all font-mono input-focus"
                    placeholder="sk-ant-..."
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">ANTHROPIC_AUTH_TOKEN (Optional)</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={newProfileForm.authToken}
                    onChange={(e) => setNewProfileForm({ ...newProfileForm, authToken: e.target.value })}
                    className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 pr-12 text-white focus:border-zinc-600 focus:outline-none transition-all font-mono input-focus"
                    placeholder="Optional auth token..."
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
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
                    className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:border-zinc-600 focus:outline-none transition-all input-focus"
                    placeholder="claude-3-5-haiku-..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Opus Model (Optional)</label>
                  <input
                    type="text"
                    value={newProfileForm.opusModel}
                    onChange={(e) => setNewProfileForm({ ...newProfileForm, opusModel: e.target.value })}
                    className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:border-zinc-600 focus:outline-none transition-all input-focus"
                    placeholder="claude-3-opus-..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Sonnet Model (Optional)</label>
                  <input
                    type="text"
                    value={newProfileForm.sonnetModel}
                    onChange={(e) => setNewProfileForm({ ...newProfileForm, sonnetModel: e.target.value })}
                    className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:border-zinc-600 focus:outline-none transition-all input-focus"
                    placeholder="claude-3-5-sonnet-..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Small Fast Model (Optional)</label>
                  <input
                    type="text"
                    value={newProfileForm.smallFastModel}
                    onChange={(e) => setNewProfileForm({ ...newProfileForm, smallFastModel: e.target.value })}
                    className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:border-zinc-600 focus:outline-none transition-all input-focus"
                    placeholder="claude-3-5-haiku-..."
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-8">
              <button
                onClick={() => {
                  setShowAddProfileModal(false);
                  setNewProfileForm(emptyProfileForm);
                }}
                className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-zinc-800 transition-all "
              >
                Cancel
              </button>
              <button
                onClick={addNewProfile}
                className="px-6 py-3 rounded-xl bg-white text-black hover:bg-zinc-200 font-medium hover:shadow-lg hover:shadow-black/40 transition-all  pulse-ring "
              >
                Add Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
