"use client";

import Link from "next/link";
import type { OrganizationCollaboration } from "../types";

type OrganizationSettingsSectionProps = {
  orgCollabLoading: boolean;
  orgCollab: OrganizationCollaboration | null;
};

export function OrganizationSettingsSection(props: OrganizationSettingsSectionProps) {
  return (
    <section
      id="organization"
      className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Organization</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          You are working in an organization scope. Use{" "}
          <Link
            href="/workspace"
            className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
          >
            Organizations
          </Link>{" "}
          for an overview, or open this workspace&apos;s items and settings from the sidebar.
        </p>
      </div>

      {props.orgCollabLoading ? (
        <p className="mt-4 text-sm text-zinc-500">Loading...</p>
      ) : props.orgCollab?.organization ? (
        <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                Name
              </div>
              <div className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {props.orgCollab.organization.name}
              </div>
              <div className="mt-1 text-xs text-zinc-500">@{props.orgCollab.organization.slug}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                Your role
              </div>
              <div className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {props.orgCollab.role ?? "viewer"}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">Organization details are unavailable right now.</p>
      )}
    </section>
  );
}
