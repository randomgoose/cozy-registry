import { useEffect, useMemo, useRef, useState } from "react";
import { fetchTeamRouteResolution, postAuthControl } from "../../lib/auth-control";
import { NotificationsPage } from "../notifications";
import { DashboardPage } from "../dashboard";
import { ProjectsPage } from "../collections";
import { SettingsPage } from "../settings";

type TeamSection = "dashboard" | "projects" | "settings" | "notifications";

type TeamResolution = {
  organizationId: string;
  organizationName: string;
  orgSlug: string;
  teamId: string;
  teamName: string;
  teamSlug: string | null;
  isWorkspaceSynced: boolean;
};

async function syncWorkspaceScope(organizationId: string, teamId: string) {
  await postAuthControl("/organization/set-active", { organizationId });
  await postAuthControl("/organization/set-active-team", { teamId });
}

export function TeamScopedPage(props: {
  orgSlug: string;
  teamSlug: string;
  section: TeamSection;
}) {
  const [status, setStatus] = useState<"loading" | "syncing" | "ready" | "signed-out" | "not-found" | "error">(
    "loading",
  );
  const [resolvedTeam, setResolvedTeam] = useState<TeamResolution | null>(null);
  const hasSyncedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await fetchTeamRouteResolution(props.orgSlug, props.teamSlug);
        if (cancelled) return;

        if (result.kind === "signed-out") {
          setStatus("signed-out");
          return;
        }

        if (result.kind === "not-found") {
          setStatus("not-found");
          return;
        }

        const canonicalTeamSlug = result.data?.teamSlug ?? props.teamSlug;
        if (
          result.data?.orgSlug !== props.orgSlug ||
          canonicalTeamSlug !== props.teamSlug
        ) {
          window.location.replace(
            `/t/${encodeURIComponent(result.data?.orgSlug ?? props.orgSlug)}/${encodeURIComponent(canonicalTeamSlug)}/${props.section}`,
          );
          return;
        }

        setResolvedTeam(result.data as TeamResolution);

        if (!result.data?.isWorkspaceSynced && !hasSyncedRef.current) {
          hasSyncedRef.current = true;
          setStatus("syncing");
          await syncWorkspaceScope(
            result.data?.organizationId ?? "",
            result.data?.teamId ?? "",
          );
          if (cancelled) return;
        }

        setStatus("ready");
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to prepare team scoped route", error);
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.orgSlug, props.section, props.teamSlug]);

  const callbackUrl = useMemo(
    () =>
      `/t/${encodeURIComponent(props.orgSlug)}/${encodeURIComponent(props.teamSlug)}/${props.section}`,
    [props.orgSlug, props.section, props.teamSlug],
  );

  if (status === "loading" || status === "syncing") {
    return (
      <div className="flex min-h-[min(65vh,520px)] items-center justify-center rounded-[28px] border border-zinc-200/80 bg-zinc-50/80 px-6 py-16 dark:border-zinc-800 dark:bg-zinc-950/40">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            {status === "syncing" ? "Switching access group scope" : "Loading project workspace"}
          </h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            {status === "syncing"
              ? "We’re syncing your active workspace to the requested access group before rendering the migrated project view."
              : "Preparing the access-group scoped route in the migrated web host."}
          </p>
        </div>
      </div>
    );
  }

  if (status === "signed-out") {
    return (
      <div className="flex min-h-[min(65vh,520px)] items-center justify-center rounded-[28px] border border-zinc-200/80 bg-zinc-50/80 px-6 py-16 dark:border-zinc-800 dark:bg-zinc-950/40">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Sign in to open this project workspace
          </h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Project routes can still resolve an access-group context, but they require your existing session.
          </p>
          <a
            href={`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="mt-6 inline-flex rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Continue to sign in
          </a>
        </div>
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <div className="flex min-h-[min(65vh,520px)] items-center justify-center rounded-[28px] border border-zinc-200/80 bg-zinc-50/80 px-6 py-16 dark:border-zinc-800 dark:bg-zinc-950/40">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Access-group route unavailable
          </h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            This access group does not exist or your account does not have access to it.
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-[min(65vh,520px)] items-center justify-center rounded-[28px] border border-zinc-200/80 bg-zinc-50/80 px-6 py-16 dark:border-zinc-800 dark:bg-zinc-950/40">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Could not open access-group route
          </h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Check that the auth-control routes on `cozy-platform` are reachable for team resolution and workspace scope sync.
          </p>
        </div>
      </div>
    );
  }

  const banner = resolvedTeam ? (
    <div className="border-b border-amber-200 bg-amber-50/90 px-6 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
      Access group scope: {resolvedTeam.organizationName} / {resolvedTeam.teamName}
    </div>
  ) : null;

  if (props.section === "dashboard") {
    return (
      <>
        {banner}
        <DashboardPage />
      </>
    );
  }

  if (props.section === "projects") {
    return (
      <>
        {banner}
        <ProjectsPage />
      </>
    );
  }

  if (props.section === "notifications") {
    return (
      <>
        {banner}
        <NotificationsPage />
      </>
    );
  }

  return (
    <>
      {banner}
      <SettingsPage />
    </>
  );
}
