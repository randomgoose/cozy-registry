"use client";

import { Input } from "@/components/ui/input";
import {
  REGISTRY_BLOCK_TYPE,
  REGISTRY_THEME_TYPE,
  REGISTRY_UI_TYPE,
} from "@/lib/registry-types";
import type { ApiKeyItem, SettingsProject, TokenPolicy } from "../types";

type TokensSettingsSectionProps = {
  isOrgScope: boolean;
  newKey: string | null;
  onDismissNewKey: () => void;
  newKeyName: string;
  onNewKeyNameChange: (value: string) => void;
  creating: boolean;
  onCreateKey: (e: React.FormEvent) => void;
  loading: boolean;
  apiKeys: ApiKeyItem[];
  onOpenPolicy: (keyId: string) => void;
  onDeleteKey: (keyId: string) => void;
  policyKeyId: string | null;
  policyLoading: boolean;
  policy: TokenPolicy | null;
  setPolicy: React.Dispatch<React.SetStateAction<TokenPolicy | null>>;
  projects: SettingsProject[];
  policySaving: boolean;
  onSavePolicy: () => void;
  onClearPolicy: () => void;
  onClosePolicy: () => void;
};

export function TokensSettingsSection(props: TokensSettingsSectionProps) {
  const policy = props.policy;

  return (
    <>
      <section id="tokens" className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          API Tokens
        </h2>
        {props.isOrgScope ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            API keys are still user-owned. The scope policy you edit below will apply to the
            projects and item types in your currently active organization scope.
          </p>
        ) : null}

        {props.newKey && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Your new token is ready. Copy it now and store it somewhere safe. It will only be
              shown once.
            </p>
            <code className="mt-2 block break-all rounded bg-amber-100 px-2 py-2 font-mono text-sm dark:bg-amber-900/50">
              {props.newKey}
            </code>
            <button
              type="button"
              onClick={props.onDismissNewKey}
              className="mt-2 text-sm text-amber-700 hover:underline dark:text-amber-300"
            >
              Dismiss
            </button>
          </div>
        )}

        <form onSubmit={props.onCreateKey} className="mt-4 flex gap-2">
          <Input
            type="text"
            value={props.newKeyName}
            onChange={(e) => props.onNewKeyNameChange(e.target.value)}
            placeholder="Token name, for example Cursor or Figma Make"
            className="h-10 flex-1 rounded-lg text-sm md:text-sm"
          />
          <button
            type="submit"
            disabled={props.creating}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {props.creating ? "Creating..." : "Create token"}
          </button>
        </form>

        {props.loading ? (
          <p className="mt-4 text-sm text-zinc-500">Loading...</p>
        ) : props.apiKeys.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {props.apiKeys.map((key) => (
              <li
                key={key.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <div>
                  <span className="font-medium">{key.name || "Untitled token"}</span>
                  {key.start && (
                    <span className="ml-2 font-mono text-xs text-zinc-500">{key.start}...</span>
                  )}
                  <div className="mt-1 text-xs text-zinc-500">
                    Scope controls let you limit which projects and item types this token can
                    access in the current {props.isOrgScope ? "organization" : "personal"} scope.
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => props.onOpenPolicy(key.id)}
                    className="text-sm text-zinc-700 hover:underline dark:text-zinc-300"
                  >
                    Edit scope
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onDeleteKey(key.id)}
                    className="text-sm text-red-600 hover:underline dark:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">No tokens yet.</p>
        )}
      </section>

      {props.policyKeyId && (
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Token scope
            </h2>
            <button
              type="button"
              onClick={props.onClosePolicy}
              className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
            >
              Close
            </button>
          </div>

          {props.policyLoading || !policy ? (
            <p className="mt-3 text-sm text-zinc-500">Loading...</p>
          ) : (
            <div className="mt-4 space-y-6">
              <div>
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Allowed item types
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  {[REGISTRY_BLOCK_TYPE, REGISTRY_UI_TYPE, REGISTRY_THEME_TYPE].map((t) => (
                    <label
                      key={t}
                      className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300"
                    >
                      <input
                        type="checkbox"
                        checked={policy.allowedTypes.includes(t)}
                        onChange={(e) => {
                          props.setPolicy((current) => {
                            if (!current) return current;
                            const next = new Set(current.allowedTypes);
                            if (e.target.checked) next.add(t);
                            else next.delete(t);
                            return { ...current, allowedTypes: Array.from(next) };
                          });
                        }}
                      />
                      {t}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Allowed projects
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  This token will only list and retrieve items from these projects unless public
                  access below is enabled.
                </p>
                {props.projects.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">
                    No projects yet. Create one from the Projects page for this workspace (or
                    under Personal).
                  </p>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {props.projects.map((project) => (
                      <label
                        key={project.id}
                        className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                      >
                        <input
                          type="checkbox"
                          checked={policy.allowedProjectIds.includes(project.id)}
                          onChange={(e) => {
                            props.setPolicy((current) => {
                              if (!current) return current;
                              const next = new Set(current.allowedProjectIds);
                              if (e.target.checked) next.add(project.id);
                              else next.delete(project.id);
                              return { ...current, allowedProjectIds: Array.from(next) };
                            });
                          }}
                        />
                        <span className="truncate">{project.title}</span>
                        <span className="text-xs text-zinc-500">({project.slug})</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={policy.allowPublicOutsideProjects}
                    onChange={(e) =>
                      props.setPolicy((current) =>
                        current
                          ? {
                              ...current,
                              allowPublicOutsideProjects: e.target.checked,
                            }
                          : current,
                      )
                    }
                  />
                  Allow access to public items outside the selected projects
                </label>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={props.policySaving}
                  onClick={props.onSavePolicy}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {props.policySaving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  disabled={props.policySaving}
                  onClick={props.onClearPolicy}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
                >
                  Clear restrictions
                </button>
                <span className="text-xs text-zinc-500">
                  MCP clients and AI tools using this token will be restricted to the scope
                  configured here.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
