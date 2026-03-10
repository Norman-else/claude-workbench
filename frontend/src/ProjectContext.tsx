import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { SavedProject, ConfigScope } from './types';
import { getProjects } from './api';

interface ProjectContextType {
  scope: ConfigScope;
  setScope: (scope: ConfigScope) => void;
  selectedProject: SavedProject | null;
  setSelectedProject: (project: SavedProject | null) => void;
  projects: SavedProject[];
  refreshProjects: () => Promise<void>;
  projectPath: string | undefined; // convenience: undefined when global
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<ConfigScope>('global');
  const [selectedProject, setSelectedProject] = useState<SavedProject | null>(null);
  const [projects, setProjects] = useState<SavedProject[]>([]);

  const refreshProjects = async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => { refreshProjects(); }, []);

  // When switching to global, clear selected project
  useEffect(() => {
    if (scope === 'global') setSelectedProject(null);
  }, [scope]);

  const projectPath = scope === 'project' && selectedProject ? selectedProject.path : undefined;

  return (
    <ProjectContext.Provider value={{ scope, setScope, selectedProject, setSelectedProject, projects, refreshProjects, projectPath }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject must be used within ProjectProvider');
  return context;
}
