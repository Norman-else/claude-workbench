import { useState } from 'react';
import { ArrowLeft, Command, Edit2, Plus, Save, Trash2 } from 'lucide-react';
import { saveCommand } from '../../api';
import type { CommandFile, ViewMode } from '../../types';

interface CommandsTabProps {
  commands: CommandFile[];
  showNotification: (message: string, type?: 'success' | 'error') => void;
  loadConfig: (showProgress?: boolean) => Promise<void>;
  requestDelete: (name: string) => void;
}

export function CommandsTab({ commands, showNotification, loadConfig, requestDelete }: CommandsTabProps) {
  const [commandViewMode, setCommandViewMode] = useState<ViewMode>('list');
  const [editingCommand, setEditingCommand] = useState<CommandFile | null>(null);
  const [showAddCommandModal, setShowAddCommandModal] = useState(false);
  const [newCommandForm, setNewCommandForm] = useState<{ name: string; content: string }>({ name: '', content: '' });

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

  return (
    <>
      <div className="p-8">
        {commandViewMode === 'list' ? (
          <div>
            <div className="flex items-center justify-between mb-8 titlebar-no-drag">
              <div>
                <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-2">
                  Custom Commands
                </h2>
                <p className="text-gray-400">Manage your custom command scripts</p>
              </div>
              <div>
                <button
                  onClick={() => setShowAddCommandModal(true)}
                  className="glass hover:border-purple-500/50 border border-purple-500/20 px-6 py-3 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-purple-500/20 group ripple-effect neon-glow titlebar-no-drag"
                >
                  <Plus className="w-5 h-5 text-purple-400 group-hover:rotate-90 transition-transform duration-300" />
                  <span className="text-white font-medium">Add Command</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {commands.map((cmd) => (
                <div
                  key={cmd.name}
                  className="glass border border-purple-500/20 rounded-2xl p-6 card-hover cursor-pointer group gradient-border relative h-[320px] flex flex-col"
                  onClick={() => openCommandDetail(cmd.name)}
                >
                  <div className="flex items-center space-x-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                    <span className="text-xs font-medium text-blue-400">Command</span>
                  </div>

                  <div className="flex items-start mb-4">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 group-hover:from-purple-500/30 group-hover:to-blue-500/30 transition-all neon-glow">
                      <Command className="w-6 h-6 text-purple-400" />
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-2 transition-all cursor-pointer">{cmd.name.replace(/\.md$/, '')}</h3>

                  <div className="space-y-2 text-sm mb-4 flex-1">
                    <p className="text-gray-400 line-clamp-3 font-mono text-xs">{cmd.content.substring(0, 100)}...</p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-4 border-t border-purple-500/20 mt-auto">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openCommandDetail(cmd.name);
                      }}
                      className="flex-1 glass hover:border-purple-500/50 border border-purple-500/20 px-4 py-2 rounded-xl flex items-center justify-center space-x-2 transition-all"
                    >
                      <Edit2 className="w-4 h-4 text-purple-400" />
                      <span className="text-xs text-white font-medium">Edit</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        requestDelete(cmd.name);
                      }}
                      className="p-2 glass hover:border-red-500/50 border border-red-500/20 rounded-xl transition-all tooltip"
                      data-tooltip="Delete command"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}

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
          <div>
            <div className="flex items-center space-x-4 mb-8 relative z-[60]">
              <button
                onClick={() => {
                  setCommandViewMode('list');
                  setEditingCommand(null);
                }}
                className="p-2 rounded-lg hover:bg-purple-500/20 transition-colors titlebar-no-drag"
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
                    onChange={(e) => setEditingCommand((prev) => (prev ? { ...prev, content: e.target.value } : null))}
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

      {showAddCommandModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-dark border border-purple-500/30 rounded-2xl p-8 max-w-2xl w-full animate-slide-up shadow-2xl shadow-purple-500/20 neon-glow">
            <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-6">Add New Command</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Command Name</label>
                <input
                  type="text"
                  value={newCommandForm.name}
                  onChange={(e) => setNewCommandForm({ ...newCommandForm, name: e.target.value })}
                  className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-all input-focus"
                  placeholder="e.g., deploy.md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Command Content</label>
                <textarea
                  value={newCommandForm.content}
                  onChange={(e) => setNewCommandForm({ ...newCommandForm, content: e.target.value })}
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
                  setNewCommandForm({ name: '', content: '' });
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
    </>
  );
}
