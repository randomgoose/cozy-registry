import {
  Suspense,
  lazy,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { RootComponent, getRootHead } from "./routes/__root";

const HomeRoute = lazy(async () => ({
  default: (await import("./routes/index")).HomeRoute,
}));
const DashboardRoute = lazy(async () => ({
  default: (await import("./routes/dashboard")).DashboardRoute,
}));
const CollectionsRoute = lazy(async () => ({
  default: (await import("./routes/collections")).CollectionsRoute,
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
const TeamSettingsRoute = lazy(async () => ({
  default: (await import("./routes/team-settings")).TeamSettingsRoute,
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
) {
  return function SuspendedRouteComponent() {
    return (
      <Suspense fallback={<RouteLoadingFallback />}>
        <Component />
      </Suspense>
    );
  };
}

const rootRoute = createRootRoute({
  head: getRootHead,
  component: RootComponent,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: withRouteSuspense(HomeRoute),
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: withRouteSuspense(DashboardRoute),
});

const collectionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/collections",
  component: withRouteSuspense(CollectionsRoute),
});

const registryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/registry",
  component: withRouteSuspense(RegistryRoute),
});

const registryItemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/registry/$itemName",
  component: withRouteSuspense(RegistryItemRoute),
});

const registryDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/registry/$owner/$name",
  validateSearch: (search: Record<string, unknown>) => ({
    v: typeof search.v === "string" ? search.v : undefined,
  }),
  component: withRouteSuspense(RegistryDetailRoute),
});

const previewDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/preview/$owner/$name",
  validateSearch: (search: Record<string, unknown>) => ({
    v: typeof search.v === "string" ? search.v : undefined,
  }),
  component: withRouteSuspense(PreviewDetailRoute),
});

const publishRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/publish",
  component: withRouteSuspense(PublishRoute),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: withRouteSuspense(SettingsRoute),
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  component: withRouteSuspense(SignInRoute),
});

const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-up",
  component: withRouteSuspense(SignUpRoute),
});

const postAuthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/post-auth",
  component: withRouteSuspense(PostAuthRoute),
});

const acceptInvitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accept-invitation",
  component: withRouteSuspense(AcceptInvitationRoute),
});

const onboardingHandleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding/handle",
  component: withRouteSuspense(OnboardingHandleRoute),
});

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspace",
  component: withRouteSuspense(WorkspaceRoute),
});

const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notifications",
  component: withRouteSuspense(NotificationsRoute),
});

const docsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/docs",
  component: withRouteSuspense(DocsRoute),
});

const docsDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/docs/$slug",
  component: withRouteSuspense(DocsDetailRoute),
});

const teamDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/t/$orgSlug/$teamSlug/dashboard",
  component: withRouteSuspense(TeamDashboardRoute),
});

const teamCollectionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/t/$orgSlug/$teamSlug/collections",
  component: withRouteSuspense(TeamCollectionsRoute),
});

const teamSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/t/$orgSlug/$teamSlug/settings",
  component: withRouteSuspense(TeamSettingsRoute),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  collectionsRoute,
  registryRoute,
  registryItemRoute,
  registryDetailRoute,
  previewDetailRoute,
  publishRoute,
  settingsRoute,
  signInRoute,
  signUpRoute,
  postAuthRoute,
  acceptInvitationRoute,
  onboardingHandleRoute,
  workspaceRoute,
  notificationsRoute,
  docsRoute,
  docsDetailRoute,
  teamDashboardRoute,
  teamCollectionsRoute,
  teamSettingsRoute,
]);

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
