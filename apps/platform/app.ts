import { Hono } from "hono";
import { cors } from "hono/cors";
import { handlePlatformApiKeyPolicyRoute } from "./routes/apikeys";
import { handlePlatformAuthRoute } from "./routes/auth";
import {
  handlePlatformAuthControlApiKeyRoute,
  handlePlatformAuthControlHandleRoute,
  handlePlatformAuthControlOrganizationRoute,
  handlePlatformAuthControlProfileRoute,
  handlePlatformAuthControlSessionRoute,
  handlePlatformAuthControlSignInRoute,
  handlePlatformAuthControlSignUpRoute,
  handlePlatformAuthControlTeamEnsureSlugRoute,
  handlePlatformAuthControlTeamResolveRoute,
  handlePlatformAuthControlWorkspaceContextRoute,
} from "./routes/auth-control";
import {
  handlePlatformCollectionDetailRoute,
  handlePlatformCollectionItemDetailRoute,
  handlePlatformCollectionItemsRoute,
  handlePlatformCollectionsRoute,
} from "./routes/collections";
import { handlePlatformHealthRoute } from "./routes/health";
import {
  handlePlatformMcpOptionsRoute,
  handlePlatformMcpRoute,
} from "./routes/mcp";
import {
  handlePlatformNotificationDetailRoute,
  handlePlatformNotificationsMarkAllReadRoute,
  handlePlatformNotificationsRoute,
} from "./routes/notifications";
import {
  handlePlatformOAuthAuthorizeRoute,
  handlePlatformOAuthRegisterRoute,
  handlePlatformOAuthTokenRoute,
} from "./routes/oauth";
import { handlePlatformPreviewRoute } from "./routes/preview";
import {
  handlePlatformProjectDetailRoute,
  handlePlatformProjectItemDetailRoute,
  handlePlatformProjectItemsRoute,
  handlePlatformProjectsRoute,
} from "./routes/projects";
import {
  handlePlatformProjectInvitationDetailRoute,
  handlePlatformProjectMemberDetailRoute,
  handlePlatformProjectMembersRoute,
} from "./routes/project-members";
import {
  handlePlatformRegistryCatalogRoute,
  handlePlatformRegistryConsumptionRoute,
  handlePlatformRegistryItemDetailRoute,
  handlePlatformRegistryItemsCreateRoute,
  handlePlatformRegistryItemVersionsRoute,
  handlePlatformRegistryLookupRoute,
  handlePlatformRegistryOwnedItemsRoute,
} from "./routes/registry";
import { handlePlatformTeamCurrentCollaborationRoute } from "./routes/team";
import {
  handlePlatformOAuthAuthorizationServerMetadataRoute,
  handlePlatformOAuthProtectedResourceMetadataRoute,
} from "./routes/well-known";
import { handlePlatformWorkspaceCurrentRoute } from "./routes/workspace";

type RouteHandler = (request: Request) => Promise<Response>;

function splitOrigins(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAllowedCorsOrigins() {
  return new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...splitOrigins(process.env.COZY_WEB_BASE_URL),
    ...splitOrigins(process.env.APP_URL),
    ...splitOrigins(process.env.NEXT_PUBLIC_APP_URL),
  ]);
}

function delegate(handler: RouteHandler) {
  return (context: { req: { raw: Request } }) => handler(context.req.raw);
}

function notFound() {
  return Response.json({ error: "Not found" }, { status: 404 });
}

export function createPlatformApp() {
  const app = new Hono();
  const allowedOrigins = getAllowedCorsOrigins();

  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) {
          return "";
        }

        return allowedOrigins.has(origin) ? origin : "";
      },
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    }),
  );

  app.get("/health", delegate(handlePlatformHealthRoute));

  app.on(["GET", "POST"], "/api/auth/*", delegate(handlePlatformAuthRoute));

  app.get("/auth-control/session", delegate(handlePlatformAuthControlSessionRoute));
  app.get("/auth-control/me", delegate(handlePlatformAuthControlProfileRoute));
  app.get(
    "/auth-control/workspace/context",
    delegate(handlePlatformAuthControlWorkspaceContextRoute),
  );
  app.get("/auth-control/team/resolve", delegate(handlePlatformAuthControlTeamResolveRoute));
  app.post(
    "/auth-control/team/ensure-slug",
    delegate(handlePlatformAuthControlTeamEnsureSlugRoute),
  );
  app.post("/auth-control/me/handle", delegate(handlePlatformAuthControlHandleRoute));
  app.post("/auth-control/sign-in/*", delegate(handlePlatformAuthControlSignInRoute));
  app.post("/auth-control/sign-up/*", delegate(handlePlatformAuthControlSignUpRoute));
  app.post(
    "/auth-control/organization/*",
    delegate(handlePlatformAuthControlOrganizationRoute),
  );
  app.on(
    ["GET", "POST"],
    "/auth-control/api-key/*",
    delegate(handlePlatformAuthControlApiKeyRoute),
  );

  app.on(["GET", "PUT", "DELETE"], "/apikeys/:apiKeyId/policy", delegate(handlePlatformApiKeyPolicyRoute));

  app.get(
    "/.well-known/oauth-authorization-server",
    delegate(handlePlatformOAuthAuthorizationServerMetadataRoute),
  );
  app.get(
    "/api/well-known/oauth-authorization-server",
    delegate(handlePlatformOAuthAuthorizationServerMetadataRoute),
  );
  app.get(
    "/.well-known/oauth-protected-resource",
    delegate(handlePlatformOAuthProtectedResourceMetadataRoute),
  );
  app.get(
    "/api/well-known/oauth-protected-resource",
    delegate(handlePlatformOAuthProtectedResourceMetadataRoute),
  );

  app.on(["GET", "POST"], "/api/oauth/authorize", delegate(handlePlatformOAuthAuthorizeRoute));
  app.post("/api/oauth/token", delegate(handlePlatformOAuthTokenRoute));
  app.post("/api/oauth/register", delegate(handlePlatformOAuthRegisterRoute));

  app.get("/notifications", delegate(handlePlatformNotificationsRoute));
  app.patch("/notifications/:notificationId", delegate(handlePlatformNotificationDetailRoute));
  app.post(
    "/notifications/mark-all-read",
    delegate(handlePlatformNotificationsMarkAllReadRoute),
  );

  app.get("/workspace/current", delegate(handlePlatformWorkspaceCurrentRoute));
  app.get(
    "/team/current/collaboration",
    delegate(handlePlatformTeamCurrentCollaborationRoute),
  );

  app.get("/registry", delegate(handlePlatformRegistryCatalogRoute));
  app.post("/registry/items", delegate(handlePlatformRegistryItemsCreateRoute));
  app.get("/registry/owned", delegate(handlePlatformRegistryOwnedItemsRoute));
  app.get("/registry/lookup", delegate(handlePlatformRegistryLookupRoute));
  app.get(
    "/registry/:owner/:name/versions",
    delegate(handlePlatformRegistryItemVersionsRoute),
  );
  app.post(
    "/registry/:owner/:name/versions",
    delegate(handlePlatformRegistryItemVersionsRoute),
  );
  app.on(
    ["GET", "DELETE", "PATCH"],
    "/registry/:owner/:name",
    delegate(handlePlatformRegistryItemDetailRoute),
  );

  app.on(["GET", "POST"], "/collections", delegate(handlePlatformCollectionsRoute));
  app.on(
    ["PATCH", "DELETE"],
    "/collections/:id",
    delegate(handlePlatformCollectionDetailRoute),
  );
  app.on(
    ["GET", "POST"],
    "/collections/:id/items",
    delegate(handlePlatformCollectionItemsRoute),
  );
  app.delete(
    "/collections/:id/items/:itemId",
    delegate(handlePlatformCollectionItemDetailRoute),
  );

  app.on(["GET", "POST"], "/projects", delegate(handlePlatformProjectsRoute));
  app.on(
    ["PATCH", "DELETE"],
    "/projects/:id",
    delegate(handlePlatformProjectDetailRoute),
  );
  app.on(
    ["GET", "POST"],
    "/projects/:id/items",
    delegate(handlePlatformProjectItemsRoute),
  );
  app.on(
    ["GET", "POST"],
    "/projects/:id/members",
    delegate(handlePlatformProjectMembersRoute),
  );
  app.on(
    ["PATCH", "DELETE"],
    "/projects/:id/members/:memberId",
    delegate(handlePlatformProjectMemberDetailRoute),
  );
  app.delete(
    "/projects/:id/invitations/:invitationId",
    delegate(handlePlatformProjectInvitationDetailRoute),
  );
  app.delete(
    "/projects/:id/items/:itemId",
    delegate(handlePlatformProjectItemDetailRoute),
  );

  app.get("/r/*", delegate(handlePlatformRegistryConsumptionRoute));
  app.get("/preview/*", delegate(handlePlatformPreviewRoute));

  app.on(["GET", "POST", "DELETE"], "/mcp", delegate(handlePlatformMcpRoute));
  app.options("/mcp", delegate(handlePlatformMcpOptionsRoute));
  app.on(["GET", "POST", "DELETE"], "/api/mcp", delegate(handlePlatformMcpRoute));
  app.options("/api/mcp", delegate(handlePlatformMcpOptionsRoute));

  app.notFound(() => notFound());

  return app;
}
