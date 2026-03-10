import { useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, Globe, FolderGit2, Plus, X, ChevronDown, FolderSearch } from 'lucide-react';
import { useProject } from '../ProjectContext';
import { addProject, removeProject, validateProjectPath } from '../api';
import DirectoryBrowser from './DirectoryBrowser';

export default function ProjectSelector() {
  const { scope, setScope, selectedProject, setSelectedProject, projects, refreshProjects } = useProject();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [adding, setAdding] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);

  const handleAddProject = async () => {
    if (!newPath.trim()) return;
    setValidating(true);
    setValidationError('');
    try {
      const result = await validateProjectPath(newPath.trim());
      if (!result.exists) {
        setValidationError('Directory does not exist');
        setValidating(false);
        return;
      }
      setValidating(false);
      setAdding(true);
      const project = await addProject(newPath.trim());
      await refreshProjects();
      setSelectedProject(project);
      setScope('project');
      setShowAddModal(false);
      setNewPath('');
      setAdding(false);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to add project');
      setValidating(false);
      setAdding(false);
    }
  };


  const handleBrowse = async () => {
    try {
      if (window.electronAPI?.selectDirectory) {
        const dir = await window.electronAPI.selectDirectory();
        if (dir) {
          setNewPath(dir);
          setValidationError('');
        }
      } else {
        setShowBrowser((prev) => !prev);
      }
    } catch {
      // user cancelled
    }
  };

  const handleRemoveProject = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    try {
      await removeProject(path);
      await refreshProjects();
      if (selectedProject?.path === path) {
        setSelectedProject(null);
        setScope('global');
      }
    } catch {
      // ignore
    }
  };

  const abbreviatePath = (path: string) => {
    const parts = path.replace(/\\/g, '/').split('/');
    if (parts.length <= 3) return path;
    return '…/' + parts.slice(-2).join('/');
  };

  return (
    <>
      <div className="mb-4 titlebar-no-drag">
        {/* Scope toggle */}
        <span className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase px-1 mb-2 block">Scope</span>
        <div className="flex items-center space-x-1 glass border border-zinc-800 rounded-xl p-1 mb-3">
          <button
            onClick={() => setScope('global')}
            className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              scope === 'global' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Global</span>
          </button>
          <button
            onClick={() => setScope('project')}
            className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              scope === 'project' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            <span>Project</span>
          </button>
        </div>

        {/* Project selector (only when scope is project) */}
        {scope === 'project' && (
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full flex items-center justify-between glass border border-zinc-800 hover:border-zinc-600 rounded-xl px-3 py-2.5 transition-all"
            >
              <div className="flex items-center space-x-2 min-w-0">
                <FolderOpen className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                {selectedProject ? (
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-white block truncate">{selectedProject.name}</span>
                    <span className="text-xs text-zinc-500 block truncate">{abbreviatePath(selectedProject.path)}</span>
                  </div>
                ) : (
                  <span className="text-sm text-zinc-500">Select a project</span>
                )}
              </div>
              <ChevronDown className={`w-4 h-4 text-zinc-500 flex-shrink-0 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {showDropdown && (
              <div className="absolute left-0 right-0 top-full mt-1 glass-dark border border-zinc-700 rounded-xl overflow-hidden z-50 shadow-2xl shadow-black/20 animate-slide-up project-selector-dropdown">
                <div className="max-h-48 overflow-y-auto">
                  {projects.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-zinc-500">
                      No projects added yet
                    </div>
                  ) : (
                    projects.map((project) => (
                      <button
                        key={project.path}
                        onClick={() => {
                          setSelectedProject(project);
                          setShowDropdown(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 transition-all group/item ${
                          selectedProject?.path === project.path
                            ? 'bg-zinc-700/50'
                            : 'hover:bg-zinc-800/50'
                        }`}
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <FolderGit2 className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                          <div className="min-w-0 text-left">
                            <span className="text-sm text-white block truncate">{project.name}</span>
                            <span className="text-xs text-zinc-500 block truncate">{abbreviatePath(project.path)}</span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleRemoveProject(e, project.path)}
                          className="opacity-0 group-hover/item:opacity-100 p-1 rounded-md hover:bg-zinc-600/50 transition-all flex-shrink-0"
                          title="Remove project"
                        >
                          <X className="w-3.5 h-3.5 text-zinc-400 hover:text-red-400" />
                        </button>
                      </button>
                    ))
                  )}
                </div>
                <div className="border-t border-zinc-700">
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      setShowAddModal(true);
                    }}
                    className="w-full flex items-center space-x-2 px-3 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Project</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showAddModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fade-in" onClick={() => { setShowAddModal(false); setNewPath(''); setValidationError(''); setShowBrowser(false); }}>
          <div className={`glass-dark border border-zinc-700 rounded-2xl p-8 w-full animate-slide-up shadow-2xl shadow-black/20 project-add-modal transition-all ${showBrowser ? 'max-w-2xl' : 'max-w-lg'}`} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-2xl font-bold text-white mb-6">Add Project</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Project Directory Path</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPath}
                    onChange={(e) => {
                      setNewPath(e.target.value);
                      setValidationError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddProject();
                    }}
                    className="flex-1 glass border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-zinc-600 focus:outline-none transition-all input-focus"
                    placeholder="/Users/you/projects/my-app"
                    autoFocus
                  />
                  <button
                    onClick={handleBrowse}
                    className="glass hover:border-zinc-600 border border-zinc-800 px-4 py-3 rounded-xl flex items-center space-x-2 transition-all hover:shadow-lg hover:shadow-black/20 flex-shrink-0"
                    title="Browse for directory"
                  >
                    <FolderSearch className="w-4 h-4 text-zinc-300" />
                    <span className="text-sm text-zinc-300 font-medium">Browse</span>
                  </button>
                </div>
                {validationError && (
                  <p className="mt-2 text-sm text-red-400">{validationError}</p>
                )}
              </div>

              {/* Inline directory browser (web mode) */}
              {showBrowser && !window.electronAPI?.selectDirectory && (
                <DirectoryBrowser
                  onSelect={(path) => {
                    setNewPath(path);
                    setValidationError('');
                  }}
                  onClose={() => setShowBrowser(false)}
                />
              )}
            </div>

            <div className="flex justify-end space-x-4 mt-8">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewPath('');
                  setValidationError('');
                }}
                className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-zinc-800 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAddProject}
                disabled={!newPath.trim() || validating || adding}
                className="px-6 py-3 rounded-xl bg-white text-black hover:bg-zinc-200 font-medium hover:shadow-lg hover:shadow-black/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {validating ? 'Validating...' : adding ? 'Adding...' : 'Add Project'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
