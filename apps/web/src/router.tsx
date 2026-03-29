import {
  Suspense,
  lazy,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { RootLayout } from "./routes/root-layout";
import { WorkspaceOrgLayout } from "./routes/workspace-org-layout";
import { WorkspaceShellLayout } from "./routes/workspace-shell-layout";

const HomeRoute = lazy(async () => ({
  default: (await import("./routes/index")).HomeRoute,
}));
const DashboardRoute = lazy(async () => ({
  default: (await import("./routes/dashboard")).DashboardRoute,
}));
const CollectionsRoute = lazy(async () => ({
  default: (await import("./routes/collections")).CollectionsRoute,
}));
const ProjectsRoute = lazy(async () => ({
  default: (await import("./routes/projects")).ProjectsRoute,
}));
const ProjectDetailRoute = lazy(async () => ({
  default: (await import("./routes/project-detail")).ProjectDetailRoute,
}));
const RegistryRoute = lazy(async () => ({
  default: (await import("./routes/registry")).RegistryRoute,
}));
const RegistryItemRoute = lazy(async () => ({
  default: (await import("./routes/registry-item")).RegistryItemRoute,
}));
const RegistryDetailRoute = lazy(async () => ({
  default: (await import("./routes/registry-detail")).RegistryDetailRoute,
}));
const PreviewDetailRoute = lazy(async () => ({
  default: (await import("./routes/preview-detail")).PreviewDetailRoute,
}));
const PublishRoute = lazy(async () => ({
  default: (await import("./routes/publish")).PublishRoute,
}));
const SettingsRoute = lazy(async () => ({
  default: (await import("./routes/settings")).SettingsRoute,
}));
const SignInRoute = lazy(async () => ({
  default: (await import("./routes/sign-in")).SignInRoute,
}));
const SignUpRoute = lazy(async () => ({
  default: (await import("./routes/sign-up")).SignUpRoute,
}));
const PostAuthRoute = lazy(async () => ({
  default: (await import("./routes/post-auth")).PostAuthRoute,
}));
const AcceptInvitationRoute = lazy(async () => ({
  default: (await import("./routes/accept-invitation")).AcceptInvitationRoute,
}));
const OnboardingHandleRoute = lazy(async () => ({
  default: (await import("./routes/onboarding-handle")).OnboardingHandleRoute,
}));
const WorkspaceRoute = lazy(async () => ({
  default: (await import("./routes/workspace")).WorkspaceRoute,
}));
const NotificationsRoute = lazy(async () => ({
  default: (await import("./routes/notifications")).NotificationsRoute,
}));
const TeamDashboardRoute = lazy(async () => ({
  default: (await import("./routes/team-dashboard")).TeamDashboardRoute,
}));
const TeamCollectionsRoute = lazy(async () => ({
  default: (await import("./routes/team-collections")).TeamCollectionsRoute,
}));
const TeamProjectsRoute = lazy(async () => ({
  default: (await import("./routes/team-projects")).TeamProjectsRoute,
}));
const TeamSettingsRoute = lazy(async () => ({
  default: (await import("./routes/team-settings")).TeamSettingsRoute,
}));
const TeamNotificationsRoute = lazy(async () => ({
  default: (await import("./routes/team-notifications")).TeamNotificationsRoute,
}));
const DocsRoute = lazy(async () => ({
  default: (await import("./routes/docs")).DocsRoute,
}));
const DocsDetailRoute = lazy(async () => ({
  default: (await import("./routes/docs-detail")).DocsDetailRoute,
}));

function RouteLoadingFallback() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="h-12 animate-pulse rounded-xl bg-zinc-200/80 dark:bg-zinc-800/80" />
    </div>
  );
}

function withRouteSuspense(
  Component: LazyExoticComponent<ComponentType>,
): ComponentType {
  return function SuspendedRouteComponent() {
    return (
      <Suspense fallback={<RouteLoadingFallback />}>
        <Component />
      </Suspense>
    );
  };
}

const suspense = withRouteSuspense;

export const appRouter = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, Component: suspense(HomeRoute) },
      {
        Component: WorkspaceShellLayout,
        children: [
          { path: "dashboard", Component: DashboardRoute },
          { path: "projects", Component: ProjectsRoute },
          { path: "projects/:projectSlug", Component: ProjectDetailRoute },
          { path: "workspace", element: <Navigate to="/dashboard" replace /> },
          { path: "settings", Component: SettingsRoute },
          { path: "notifications", Component: NotificationsRoute },
          {
            path: "w/:orgSlug",
            element: <WorkspaceOrgLayout />,
            children: [
              { path: "dashboard", Component: DashboardRoute },
              { path: "projects", Component: ProjectsRoute },
              { path: "projects/:projectSlug", Component: ProjectDetailRoute },
              { path: "settings", Component: SettingsRoute },
              { path: "workspace", Component: WorkspaceRoute },
              { path: "notifications", Component: NotificationsRoute },
            ],
          },
          {
            path: "t/:orgSlug/:teamSlug/dashboard",
            Component: TeamDashboardRoute,
          },
          {
            path: "t/:orgSlug/:teamSlug/projects",
            Component: TeamProjectsRoute,
          },
          {
            path: "t/:orgSlug/:teamSlug/collections",
            Component: TeamCollectionsRoute,
          },
          {
            path: "t/:orgSlug/:teamSlug/settings",
            Component: TeamSettingsRoute,
          },
          {
            path: "t/:orgSlug/:teamSlug/notifications",
            Component: TeamNotificationsRoute,
          },
        ],
      },
      { path: "collections", Component: suspense(CollectionsRoute) },
      { path: "registry", Component: suspense(RegistryRoute) },
      { path: "registry/:itemName", Component: suspense(RegistryItemRoute) },
      { path: "registry/:owner/:name", Component: suspense(RegistryDetailRoute) },
      { path: "preview/:owner/:name", Component: suspense(PreviewDetailRoute) },
      { path: "publish", Component: suspense(PublishRoute) },
      { path: "sign-in", Component: suspense(SignInRoute) },
      { path: "sign-up", Component: suspense(SignUpRoute) },
      { path: "post-auth", Component: suspense(PostAuthRoute) },
      { path: "accept-invitation", Component: suspense(AcceptInvitationRoute) },
      { path: "onboarding/handle", Component: suspense(OnboardingHandleRoute) },
      { path: "docs", Component: suspense(DocsRoute) },
      { path: "docs/:slug", Component: suspense(DocsDetailRoute) },
    ],
  },
]);
