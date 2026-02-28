import { useState } from 'react';
import { ArrowLeft, Edit2, Plus, Save, Trash2, Zap } from 'lucide-react';
import { saveSkill } from '../../api';
import type { Skill, ViewMode } from '../../types';

interface SkillsTabProps {
  skills: Skill[];
  showNotification: (message: string, type?: 'success' | 'error') => void;
  loadConfig: (showProgress?: boolean) => Promise<void>;
  requestDelete: (name: string) => void;
}

export function SkillsTab({ skills, showNotification, loadConfig, requestDelete }: SkillsTabProps) {
  const [skillViewMode, setSkillViewMode] = useState<ViewMode>('list');
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [showAddSkillModal, setShowAddSkillModal] = useState(false);
  const [newSkillForm, setNewSkillForm] = useState<{ name: string; content: string }>({ name: '', content: '' });

  const openSkillDetail = (skill: Skill) => {
    setEditingSkill(skill);
    setSkillViewMode('detail');
  };

  const saveSkillDetail = async () => {
    if (!editingSkill) return;

    const nameRegex = /^[a-z0-9-]{1,64}$/;
    if (!nameRegex.test(editingSkill.name)) {
      showNotification('Invalid skill name. Must use lowercase letters, numbers, and hyphens only (max 64 characters)', 'error');
      return;
    }

    try {
      await saveSkill({ name: editingSkill.name, content: editingSkill.content });
      showNotification('Skill saved successfully!');
      await loadConfig();
      setSkillViewMode('list');
      setEditingSkill(null);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Failed to save skill', 'error');
    }
  };

  const addNewSkill = async () => {
    if (!newSkillForm.name || !newSkillForm.content) {
      showNotification('Please fill in skill name and content', 'error');
      return;
    }

    const nameRegex = /^[a-z0-9-]{1,64}$/;
    if (!nameRegex.test(newSkillForm.name)) {
      showNotification('Invalid skill name. Must use lowercase letters, numbers, and hyphens only (max 64 characters)', 'error');
      return;
    }

    try {
      await saveSkill({ name: newSkillForm.name, content: newSkillForm.content });
      showNotification('Skill created successfully!');
      await loadConfig();
      setShowAddSkillModal(false);
      setNewSkillForm({ name: '', content: '' });
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Failed to create skill', 'error');
    }
  };

  const useSkillTemplate = () => {
    const template = `---
name: ${newSkillForm.name || 'skill-name'}
description: Brief description of what this Skill does and when to use it
---

# ${newSkillForm.name ? newSkillForm.name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Skill Name'}

## Instructions
Provide clear, step-by-step guidance for Claude.

## Examples
Show concrete examples of using this Skill.
`;
    setNewSkillForm({ ...newSkillForm, content: template });
  };

  return (
    <>
      <div className="p-8">
        {skillViewMode === 'list' ? (
          <div>
            <div className="flex items-center justify-between mb-8 titlebar-no-drag">
              <div>
                <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-2">
                  Personal Skills
                </h2>
                <p className="text-gray-400">Create and manage your Agent Skills</p>
              </div>
              <div>
                <button
                  onClick={() => setShowAddSkillModal(true)}
                  className="glass hover:border-purple-500/50 border border-purple-500/20 px-6 py-3 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-purple-500/20 group ripple-effect neon-glow titlebar-no-drag"
                >
                  <Plus className="w-5 h-5 text-purple-400 group-hover:rotate-90 transition-transform duration-300" />
                  <span className="text-white font-medium">Add Skill</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {skills.map((skill) => (
                <div
                  key={skill.name}
                  className="glass border border-purple-500/20 rounded-2xl p-6 card-hover cursor-pointer group gradient-border relative h-[320px] flex flex-col"
                  onClick={() => openSkillDetail(skill)}
                >
                  <div className="flex items-center space-x-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                    <span className="text-xs font-medium text-blue-400">Skill</span>
                  </div>

                  <div className="flex items-start mb-4">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 group-hover:from-purple-500/30 group-hover:to-blue-500/30 transition-all neon-glow">
                      <Zap className="w-6 h-6 text-purple-400" />
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-2 transition-all cursor-pointer">{skill.name}</h3>

                  <div className="space-y-2 text-sm mb-4 flex-1">
                    <p className="text-gray-400 line-clamp-3 text-xs">{skill.description || skill.content.substring(0, 100) + '...'}</p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-4 border-t border-purple-500/20 mt-auto">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openSkillDetail(skill);
                      }}
                      className="flex-1 glass hover:border-purple-500/50 border border-purple-500/20 px-4 py-2 rounded-xl flex items-center justify-center space-x-2 transition-all"
                    >
                      <Edit2 className="w-4 h-4 text-purple-400" />
                      <span className="text-xs text-white font-medium">Edit</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        requestDelete(skill.name);
                      }}
                      className="p-2 glass hover:border-red-500/50 border border-red-500/20 rounded-xl transition-all tooltip"
                      data-tooltip="Delete skill"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}

              {skills.length === 0 && (
                <div className="col-span-full glass border border-purple-500/20 rounded-2xl p-12 text-center">
                  <Zap className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 mb-4">No skills yet</p>
                  <button
                    onClick={() => setShowAddSkillModal(true)}
                    className="glass hover:border-purple-500/50 border border-purple-500/20 px-6 py-3 rounded-xl inline-flex items-center space-x-2"
                  >
                    <Plus className="w-5 h-5 text-purple-400" />
                    <span className="text-white font-medium">Create Your First Skill</span>
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
                  setSkillViewMode('list');
                  setEditingSkill(null);
                }}
                className="p-2 rounded-lg hover:bg-purple-500/20 transition-colors titlebar-no-drag"
              >
                <ArrowLeft className="w-6 h-6 text-purple-400" />
              </button>
              <div>
                <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">{editingSkill?.name}</h2>
                <p className="text-gray-400">Edit skill content (SKILL.md format)</p>
              </div>
            </div>

            <div className="glass border border-purple-500/20 rounded-2xl p-8">
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-300">Skill Name</label>
                    <span className="text-xs text-gray-500">lowercase, numbers, hyphens only (max 64 chars)</span>
                  </div>
                  <input
                    type="text"
                    value={editingSkill?.name || ''}
                    disabled
                    className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-gray-500 bg-gray-800/50 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">SKILL.md Content</label>
                  <textarea
                    value={editingSkill?.content || ''}
                    onChange={(e) => setEditingSkill((prev) => (prev ? { ...prev, content: e.target.value } : null))}
                    className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-purple-500/50 focus:outline-none transition-all input-focus"
                    rows={20}
                    placeholder="---
name: skill-name
description: Brief description of what this Skill does and when to use it
---

# Skill Name

## Instructions
Provide clear, step-by-step guidance for Claude.

## Examples
Show concrete examples of using this Skill."
                  />
                </div>

                <div className="flex justify-end space-x-4 pt-6 border-t border-purple-500/20">
                  <button
                    onClick={() => {
                      setSkillViewMode('list');
                      setEditingSkill(null);
                    }}
                    className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveSkillDetail}
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

      {showAddSkillModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-dark border border-purple-500/30 rounded-2xl p-8 max-w-2xl w-full animate-slide-up shadow-2xl shadow-purple-500/20 neon-glow">
            <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-6">Add New Skill</h3>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-300">Skill Name</label>
                  <span className="text-xs text-gray-500">lowercase, numbers, hyphens only (max 64 chars)</span>
                </div>
                <input
                  type="text"
                  value={newSkillForm.name}
                  onChange={(e) => setNewSkillForm({ ...newSkillForm, name: e.target.value })}
                  className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-all input-focus"
                  placeholder="e.g., pdf-processing"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-300">SKILL.md Content</label>
                  <button onClick={useSkillTemplate} className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
                    Use Template
                  </button>
                </div>
                <textarea
                  value={newSkillForm.content}
                  onChange={(e) => setNewSkillForm({ ...newSkillForm, content: e.target.value })}
                  className="w-full glass border border-purple-500/20 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-purple-500/50 focus:outline-none transition-all input-focus"
                  rows={15}
                  placeholder="---
name: skill-name
description: Brief description of what this Skill does and when to use it
---

# Skill Name

## Instructions
Provide clear, step-by-step guidance for Claude.

## Examples
Show concrete examples of using this Skill."
                />
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-8">
              <button
                onClick={() => {
                  setShowAddSkillModal(false);
                  setNewSkillForm({ name: '', content: '' });
                }}
                className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-all ripple-effect"
              >
                Cancel
              </button>
              <button
                onClick={addNewSkill}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-purple-500/50 transition-all ripple-effect pulse-ring neon-glow"
              >
                Add Skill
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
