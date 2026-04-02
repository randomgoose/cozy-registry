"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ProjectListItem } from "@/lib/project-list";

type ProjectsShellCacheValue = {
  projects: ProjectListItem[];
  setProjects: (projects: ProjectListItem[]) => void;
};

const ProjectsShellCacheContext = createContext<ProjectsShellCacheValue | null>(null);

export function ProjectsShellCacheProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [projects, setProjectsState] = useState<ProjectListItem[]>([]);

  const value = useMemo<ProjectsShellCacheValue>(
    () => ({
      projects,
      setProjects: (nextProjects) => {
        setProjectsState(nextProjects);
      },
    }),
    [projects],
  );

  return (
    <ProjectsShellCacheContext.Provider value={value}>
      {children}
    </ProjectsShellCacheContext.Provider>
  );
}

export function useProjectsShellCache() {
  return useContext(ProjectsShellCacheContext);
}

export function PublishProjectsToShell({ projects }: { projects: ProjectListItem[] }) {
  const cache = useProjectsShellCache();

  useEffect(() => {
    if (!cache) return;
    cache.setProjects(projects);
  }, [cache, projects]);

  return null;
}
