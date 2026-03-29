import { useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useWorkspaceShellRouting } from "../../hooks/use-workspace-shell-routing";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowLeft, ArrowRight, Lock, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button, Input } from "@cozy/ui";
import {
  createProject,
  deleteProject,
  fetchCurrentWorkspace,
  fetchProjectItems,
  fetchProjectMembers,
  fetchProjects,
  inviteProjectMember,
  removeItemFromProject,
  type Project,
  type ProjectItem,
  type ProjectMembership,
  updateProject,
  type WorkspaceData,
} from "../../lib/platform";
import { getPlatformBaseUrl } from "../../lib/runtime-config";

function slugifyProjectName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function ProjectsPage() {
  return <ProjectsWorkspacePage />;
}

export function ProjectDetailPage(props: { projectSlug: string }) {
  return <ProjectsWorkspacePage projectSlug={props.projectSlug} />;
}

function ProjectsWorkspacePage(props: { projectSlug?: string }) {
  const navigate = useNavigate();
  const { hrefs } = useWorkspaceShellRouting();
  const queryClient = useQueryClient();
  const isDetailMode = !!props.projectSlug;
  const platformBaseUrl = getPlatformBaseUrl();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [simpleDialogOpen, setSimpleDialogOpen] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [createdProject, setCreatedProject] = useState<Project | null>(null);
  const [inviteDraft, setInviteDraft] = useState("");
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [editDraft, setEditDraft] = useState({
    title: "",
    description: "",
    visibility: "private" as "public" | "private",
  });

  const workspaceQuery = useQuery<WorkspaceData | null>({
    queryKey: ["workspace"],
    enabled: !!platformBaseUrl,
    queryFn: () => fetchCurrentWorkspace(),
  });

  const projectsQuery = useQuery<Project[] | null>({
    queryKey: ["projects"],
    enabled: !!platformBaseUrl,
    queryFn: () => fetchProjects(),
  });

  const selectedProject = useMemo(
    () =>
      props.projectSlug
        ? projectsQuery.data?.find((project) => project.slug === props.projectSlug) ?? null
        : null,
    [projectsQuery.data, props.projectSlug],
  );

  const selectedProjectId = selectedProject?.id ?? null;

  const projectItemsQuery = useQuery<ProjectItem[] | null>({
    queryKey: ["project-items", selectedProjectId],
    enabled: !!selectedProjectId,
    queryFn: () => fetchProjectItems(selectedProjectId as string),
  });

  const projectMembersQuery = useQuery<ProjectMembership | null>({
    queryKey: ["project-members", selectedProjectId],
    enabled: !!selectedProjectId,
    queryFn: () => fetchProjectMembers(selectedProjectId as string),
  });

  const status: "loading" | "ready" | "signed-out" | "error" = !platformBaseUrl
    ? "error"
    : workspaceQuery.isError || projectsQuery.isError
      ? "error"
      : workspaceQuery.isPending || projectsQuery.isPending
        ? "loading"
        : !workspaceQuery.data || !projectsQuery.data
          ? "signed-out"
          : "ready";

  const projects = projectsQuery.data ?? null;
  const selectedItems = projectItemsQuery.data ?? [];
  const selectedMembership = projectMembersQuery.data ?? null;
  const itemsLoading = projectItemsQuery.isPending || projectMembersQuery.isPending;

  useEffect(() => {
    if (!selectedProject) {
      setEditDraft({
        title: "",
        description: "",
        visibility: "private",
      });
      return;
    }

    setEditDraft({
      title: selectedProject.title,
      description: selectedProject.description ?? "",
      visibility: selectedProject.visibility,
    });
  }, [selectedProject]);

  const createProjectMutation = useMutation({
    mutationFn: (body: {
      slug: string;
      title: string;
      description?: string | null;
      visibility?: "public" | "private";
    }) => createProject(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const inviteProjectMemberMutation = useMutation({
    mutationFn: (input: { projectId: string; body: { email: string; role: string } }) =>
      inviteProjectMember(input.projectId, input.body),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["project-members", variables.projectId],
      });
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: (input: {
      id: string;
      body: {
        title?: string;
        slug?: string;
        description?: string | null;
        visibility?: "public" | "private";
      };
    }) => updateProject(input.id, input.body),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["project-items", variables.id] }),
        queryClient.invalidateQueries({ queryKey: ["project-members", variables.id] }),
      ]);
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: (input: { projectId: string; itemId: string }) =>
      removeItemFromProject(input.projectId, input.itemId),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["project-items", variables.projectId] }),
      ]);
    },
  });

  async function handleCreateProject(event: React.FormEvent) {
    event.preventDefault();
    const title = createTitle.trim();
    if (!title || saving) return;

    setSaving(true);
    setMessage(null);
    setInviteFeedback(null);

    try {
      const response = await createProjectMutation.mutateAsync({
        title,
        slug: slugifyProjectName(title),
        description: null,
        visibility: "private",
      });

      if (!response.response.ok) {
        setInviteFeedback(
          (response.data?.error as string | undefined) ?? "Failed to create project.",
        );
        return;
      }

      const nextProject = (response.data?.project as Project | undefined) ?? null;

      if (nextProject?.id) {
        setCreatedProject(nextProject);
      }

      if (nextProject?.slug && !nextProject.ownerTeamId) {
        closeCreateDialog();
        setMessage("Project created.");
        void navigate(hrefs.projectDetail(nextProject.slug));
        return;
      }

      setMessage("Project created.");
      setCreateStep(2);
    } catch (error) {
      setInviteFeedback(error instanceof Error ? error.message : "Failed to create project.");
    } finally {
      setSaving(false);
    }
  }

  async function handleInviteDuringCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!createdProject?.id || !inviteDraft.trim() || saving) return;

    setSaving(true);
    setInviteFeedback(null);
    try {
      const result = await inviteProjectMemberMutation.mutateAsync({
        projectId: createdProject.id,
        body: {
          email: inviteDraft.trim(),
          role: "viewer",
        },
      });

      if (!result.response.ok) {
        setInviteFeedback(
          (result.data?.message as string | undefined) ??
          (result.data?.error as string | undefined) ??
          "Failed to invite user.",
        );
        return;
      }

      const invitedEmail = inviteDraft.trim();
      setInvitedEmails((current) => [...current, invitedEmail]);
      setInviteDraft("");
      setInviteFeedback(`Invitation sent to ${invitedEmail}.`);
    } catch (error) {
      setInviteFeedback(error instanceof Error ? error.message : "Failed to invite user.");
    } finally {
      setSaving(false);
    }
  }

  function resetCreateWizardFields() {
    setCreateStep(1);
    setCreateTitle("");
    setCreatedProject(null);
    setInviteDraft("");
    setInviteFeedback(null);
    setInvitedEmails([]);
  }

  function closeCreateDialog() {
    resetCreateWizardFields();
    setCreateDialogOpen(false);
  }

  function finishCreateDialog() {
    if (createdProject?.slug) {
      closeCreateDialog();
      void navigate(hrefs.projectDetail(createdProject.slug));
      return;
    }

    closeCreateDialog();
  }

  async function handleUpdateProject(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedProject || saving) return;

    setSaving(true);
    setMessage(null);
    try {
      const response = await updateProjectMutation.mutateAsync({
        id: selectedProject.id,
        body: {
          title: editDraft.title.trim(),
          slug: slugifyProjectName(editDraft.title),
          description: editDraft.description.trim() || null,
          visibility: editDraft.visibility,
        },
      });

      if (!response.response.ok) {
        setMessage((response.data?.error as string | undefined) ?? "Failed to update project.");
        return;
      }

      setMessage("Project updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update project.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProject() {
    if (!selectedProject || saving) return;
    const confirmed = window.confirm(
      `Delete "${selectedProject.title}"? This also removes its saved item list.`,
    );
    if (!confirmed) return;

    setSaving(true);
    setMessage(null);
    try {
      const response = await deleteProjectMutation.mutateAsync(selectedProject.id);

      if (!response.response.ok) {
        setMessage((response.data?.error as string | undefined) ?? "Failed to delete project.");
        return;
      }

      setMessage("Project deleted.");
      void navigate(hrefs.projects);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete project.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveItem(itemId: string) {
    if (!selectedProject || saving) return;

    setSaving(true);
    setMessage(null);
    try {
      const response = await removeItemMutation.mutateAsync({
        projectId: selectedProject.id,
        itemId,
      });

      if (!response.response.ok) {
        setMessage((response.data?.error as string | undefined) ?? "Failed to remove item.");
        return;
      }

      setMessage("Item removed from project.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to remove item.");
    } finally {
      setSaving(false);
    }
  }

  if (status === "signed-out") {
    return (
      <div className="flex min-h-[min(65vh,520px)] items-center justify-center rounded-[28px] border border-zinc-200/80 bg-zinc-50/80 px-6 py-16 dark:border-zinc-800 dark:bg-zinc-950/40">
        <div className="max-w-md rounded-[28px] border border-zinc-200 bg-white/92 p-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
          <Lock className="mx-auto size-8 text-zinc-400 dark:text-zinc-500" />
          <h1 className="mt-4 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Sign in to manage projects
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Sign in through the migrated control plane to manage projects.
          </p>
          <div className="mt-6">
            <a
              href="/sign-in"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Continue to sign in
              <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-[min(65vh,520px)] items-center justify-center rounded-[28px] border border-rose-200/90 bg-rose-50/90 px-6 py-16 dark:border-rose-900/50 dark:bg-rose-950/30">
        <div className="max-w-2xl rounded-[28px] border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          Projects could not reach the extracted platform APIs. Make sure <code className="rounded bg-rose-100 px-1 py-0.5 dark:bg-rose-900/40">VITE_COZY_PLATFORM_BASE_URL</code> points at a running <code className="rounded bg-rose-100 px-1 py-0.5 dark:bg-rose-900/40">cozy-platform</code> host.
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="mb-6 flex items-center justify-between gap-4 rounded-[28px] border border-zinc-200/80 bg-white/90 px-6 py-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {isDetailMode ? selectedProject?.title ?? "Project" : "Projects"}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {isDetailMode
              ? "Manage project access, details, and scoped items."
              : "Manage project access, items, and ownership from one place."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="lg"
            type="button"
            variant="outline"
            onClick={() => setSimpleDialogOpen(true)}
          >
            Simple dialog (debug)
          </Button>
          <Button
            size="lg"
            type="button"
            onClick={() => {
              resetCreateWizardFields();
              setCreateDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            Create Project
          </Button>
        </div>

      </section>

      <Dialog.Root
        modal="trap-focus"
        open={simpleDialogOpen}
        onOpenChange={setSimpleDialogOpen}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/80 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[min(90dvh,720px)] w-[min(100%-2rem,24rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-lg outline-none dark:border-zinc-800 dark:bg-zinc-900">
            <Dialog.Title className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
              Simple dialog (raw Base UI)
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Uses <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">@base-ui/react/dialog</code> only —
              no <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">@cozy/ui</code> Dialog wrapper.
            </Dialog.Description>
            <Dialog.Close
              type="button"
              className="mt-4 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Close
            </Dialog.Close>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        modal="trap-focus"
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) {
            resetCreateWizardFields();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/80 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <Dialog.Popup className="max-h-[min(90dvh,720px)] max-w-lg gap-0 overflow-y-auto rounded-[28px] border border-zinc-200/80 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.18)] outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-[0_24px_80px_rgba(0,0,0,0.2)] fixed top-1/2 left-1/2 z-50 w-[min(100%-2rem,32rem)] -translate-x-1/2 -translate-y-1/2 sm:max-w-lg">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 pr-2">
                <Dialog.Title className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {createStep === 1 ? "Create project" : "Invite collaborators"}
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {createStep === 1
                    ? "Start with a project name. You can refine the rest after the project is created."
                    : createdProject?.ownerTeamId
                      ? "Invite users into this project's access group by email."
                      : "Personal projects are owner-only right now, so no additional invite step is needed."}
                </Dialog.Description>
              </div>
              <Dialog.Close
                type="button"
                className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Close
              </Dialog.Close>
            </div>

            <div className="mt-6">
              {createStep === 1 ? (
                <form onSubmit={handleCreateProject} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-950 dark:text-zinc-50">
                      Project name
                    </label>
                    <Input
                      value={createTitle}
                      onChange={(event) => setCreateTitle(event.target.value)}
                      placeholder="Marketing site refresh"
                    />
                  </div>

                  {inviteFeedback ? (
                    <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                      {inviteFeedback}
                    </p>
                  ) : null}

                  <div className="flex justify-end">
                    <Button type="submit" size="lg" disabled={saving || !createTitle.trim()}>
                      {saving ? "Creating…" : "Continue"}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-300">
                    Created{" "}
                    <span className="font-medium text-zinc-950 dark:text-zinc-50">
                      {createdProject?.title ?? createTitle.trim()}
                    </span>
                    .
                  </div>

                  {createdProject?.ownerTeamId ? (
                    <>
                      <form onSubmit={handleInviteDuringCreate} className="space-y-3">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-zinc-950 dark:text-zinc-50">
                            User email
                          </label>
                          <Input
                            type="email"
                            value={inviteDraft}
                            onChange={(event) => setInviteDraft(event.target.value)}
                            placeholder="teammate@example.com"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Invited users get viewer access by default.
                          </p>
                          <Button
                            type="submit"
                            variant="outline"
                            size="lg"
                            disabled={saving || !inviteDraft.trim()}
                          >
                            {saving ? "Inviting…" : "Invite user"}
                          </Button>
                        </div>
                      </form>

                      {invitedEmails.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                            Invited in this flow
                          </p>
                          <div className="space-y-2">
                            {invitedEmails.map((email) => (
                              <div
                                key={email}
                                className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-300"
                              >
                                {email}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-300">
                      This project was created in personal scope, so collaborative invites are not available yet.
                    </p>
                  )}

                  {inviteFeedback ? (
                    <p className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-300">
                      {inviteFeedback}
                    </p>
                  ) : null}

                  <div className="flex justify-end">
                    <Button variant="outline" size="lg" onClick={finishCreateDialog}>
                      {createdProject?.ownerTeamId ? "Done" : "Open project"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {message ? (
        <p className="mb-6 rounded-[24px] border border-zinc-200/80 bg-white/90 px-4 py-3 text-sm text-zinc-700 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-300">
          {message}
        </p>
      ) : null}

      {!isDetailMode ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(projects ?? []).length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-zinc-300/80 bg-white/70 p-8 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400">
              No projects yet. Create your first project to start organizing items and access.
            </div>
          ) : (
            projects?.map((project) => (
              <Link
                key={project.id}
                to={hrefs.projectDetail(project.slug)}
                className="group rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_24px_70px_rgba(15,23,42,0.08)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:hover:border-zinc-700 dark:hover:shadow-[0_24px_70px_rgba(0,0,0,0.3)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                      Project
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                      {project.title}
                    </h2>
                  </div>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {project.itemCount ?? 0} items
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {project.description || "No description yet."}
                </p>
                <div className="mt-5 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>
                    {project.slug} · {project.visibility === "private" ? "Private" : "Public"}
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-zinc-700 transition group-hover:text-zinc-950 dark:text-zinc-300 dark:group-hover:text-zinc-100">
                    Open
                    <ArrowRight className="size-3.5" />
                  </span>
                </div>
              </Link>
            ))
          )}
        </section>
      ) : (
        <section className="space-y-6">
          <Link
            to={hrefs.projects}
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <ArrowLeft className="size-4" />
            Back to Projects
          </Link>

          <div className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
            {!selectedProject ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Project not found in the current workspace scope.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                      {selectedProject.title}
                    </h2>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                      {selectedProject.description || "No description yet."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="lg"
                    onClick={() => void handleDeleteProject()}
                    disabled={saving}
                  >
                    <Trash2 className="size-4" />
                    Delete project
                  </Button>
                </div>

                <form
                  onSubmit={handleUpdateProject}
                  className="mt-5 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/40"
                >
                  <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    Edit project
                  </div>
                  <input
                    value={editDraft.title}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, title: event.target.value }))
                    }
                    className="mt-3 w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  <textarea
                    value={editDraft.description}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, description: event.target.value }))
                    }
                    className="mt-3 min-h-24 w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  <select
                    value={editDraft.visibility}
                    onChange={(event) =>
                      setEditDraft((current) => ({
                        ...current,
                        visibility: event.target.value as "public" | "private",
                      }))
                    }
                    className="mt-3 w-full rounded-2xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                  <Button
                    type="submit"
                    size="lg"
                    disabled={saving || !editDraft.title.trim()}
                    className="mt-3"
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </form>

                {selectedMembership ? (
                  <div className="mt-6 rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                          Project access
                        </p>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                          {selectedMembership.accessScope.kind === "team"
                            ? `Shared through team ${selectedMembership.accessScope.team?.organizationName ?? "Unknown org"} / ${selectedMembership.accessScope.team?.name ?? "Unknown team"}`
                            : "Personal project access is currently owner-only."}
                        </p>
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {selectedMembership.members.length} members · {selectedMembership.invitations.length} pending invites
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                          Members
                        </p>
                        <div className="mt-3 space-y-2">
                          {selectedMembership.members.map((member) => (
                            <div
                              key={member.memberId}
                              className="rounded-2xl border border-zinc-200/80 bg-white/80 px-3 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/80"
                            >
                              <div className="font-medium text-zinc-950 dark:text-zinc-50">
                                {member.name || member.email}
                              </div>
                              <div className="text-zinc-500 dark:text-zinc-400">
                                {member.email} · {member.role}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                          Pending invites
                        </p>
                        <div className="mt-3 space-y-2">
                          {selectedMembership.invitations.length === 0 ? (
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                              No pending invitations for this project scope.
                            </p>
                          ) : (
                            selectedMembership.invitations.map((invitation) => (
                              <div
                                key={invitation.id}
                                className="rounded-2xl border border-zinc-200/80 bg-white/80 px-3 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/80"
                              >
                                <div className="font-medium text-zinc-950 dark:text-zinc-50">
                                  {invitation.email}
                                </div>
                                <div className="text-zinc-500 dark:text-zinc-400">
                                  {invitation.role} · {invitation.status}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-6">
                  {itemsLoading ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      Loading project items...
                    </p>
                  ) : (selectedItems?.length ?? 0) === 0 ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      This project does not contain any items yet.
                    </p>
                  ) : (
                    <>
                      <div className="mb-4 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                        <Sparkles className="size-4" />
                        Items are being read through the extracted projects API surface.
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {selectedItems?.map((item) => (
                          <article
                            key={item.itemId}
                            className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/60"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                                  {item.type}
                                </p>
                                <h3 className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                                  {item.title}
                                </h3>
                              </div>
                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.visibility === "private"
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                                  }`}
                              >
                                {item.visibility === "private" ? "Private" : "Public"}
                              </span>
                            </div>
                            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                              {item.description || "No description yet."}
                            </p>
                            <div className="mt-4 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                              <span>{item.name}</span>
                              <div className="flex items-center gap-3">
                                <a
                                  href={`/registry/${item.name}`}
                                  className="inline-flex items-center gap-1 font-medium text-zinc-700 transition hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-100"
                                >
                                  View item
                                  <ArrowRight className="size-3.5" />
                                </a>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => void handleRemoveItem(item.itemId)}
                                  className="inline-flex items-center gap-1 font-medium text-red-600 transition hover:text-red-700 disabled:opacity-60 dark:text-red-400 dark:hover:text-red-300"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </>
  );
}
