import { createContext, useContext, useState, useEffect } from 'react';
import { loadConfig, DEFAULT_CONFIG, type ProjectConfig } from '@codejury/core';

interface ProjectContextValue {
  config: ProjectConfig;
  loading: boolean;
  error?: string;
}

export const ProjectContext = createContext<ProjectContextValue>({
  config: DEFAULT_CONFIG,
  loading: true,
});

export function useProject(): ProjectContextValue {
  return useContext(ProjectContext);
}

export function useLoadProject(cwd: string): ProjectContextValue {
  const [state, setState] = useState<ProjectContextValue>({
    config: DEFAULT_CONFIG,
    loading: true,
  });

  useEffect(() => {
    loadConfig(cwd).then((result) => {
      if (result.ok) {
        setState({ config: result.value, loading: false });
      } else {
        setState({ config: DEFAULT_CONFIG, loading: false, error: result.error.message });
      }
    });
  }, [cwd]);

  return state;
}
