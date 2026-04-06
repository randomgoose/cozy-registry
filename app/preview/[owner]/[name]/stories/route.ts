import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserIdFromToken } from "@/lib/auth-api";
import { getCurrentVersion, getRegistryItemByScopedIdentityAndVersion } from "@/lib/registry";
import { db } from "@/lib/db";
import { registryItemVersions, registryPreviewArtifacts } from "@/lib/db/schema";
import { buildMultiStoryPreviewHtml } from "@/lib/multi-story-preview-html";
import {
  getPreviewDefaultStoryIdFromMeta,
  getPreviewStoriesFromMeta,
} from "@/lib/preview-stories";
import { buildStoryPreviewPageUrl } from "@/lib/story-preview-urls";

const CACHE_NONE = "no-store";

function resolveSelectedPreviewStoryId(input: {
  requestedStoryId: string | null;
  stories: Array<{ id: string }>;
  defaultStoryId: string | null;
}) {
  const normalizedRequested = input.requestedStoryId?.trim() || null;
  const normalizedDefault = input.defaultStoryId?.trim() || null;
  const availableStoryIds = new Set(
    input.stories.map((story) => story.id.trim()).filter(Boolean),
  );

  if (normalizedRequested && availableStoryIds.has(normalizedRequested)) {
    return normalizedRequested;
  }
  if (normalizedDefault && availableStoryIds.has(normalizedDefault)) {
    return normalizedDefault;
  }
  return input.stories[0]?.id ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  const { owner, name } = await params;
  const url = new URL(request.url);
  const project = url.searchParams.get("project")?.trim() || null;
  const version = url.searchParams.get("v")?.trim() || null;
  const requestedStoryId = url.searchParams.get("story")?.trim() || null;
  const theme = url.searchParams.get("theme")?.trim() || null;

  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? (await getUserIdFromToken(request));

  const item = await getRegistryItemByScopedIdentityAndVersion({
    ownerId: owner,
    projectKey: project,
    name,
    version,
    requestUserId: userId,
  }).catch(() => null);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stories = getPreviewStoriesFromMeta(item.meta);
  if (stories.length === 0) {
    return NextResponse.redirect(
      new URL(
        buildStoryPreviewPageUrl({
          owner,
          name,
          project,
          version: version ?? getCurrentVersion(item),
          theme,
        }),
        request.url,
      ),
    );
  }

  const defaultStoryId = getPreviewDefaultStoryIdFromMeta(item.meta);
  const selectedStoryId = resolveSelectedPreviewStoryId({
    requestedStoryId,
    stories,
    defaultStoryId,
  });

  const effectiveVersion = version ?? getCurrentVersion(item);

  const [itemVersion] = await db
    .select({ id: registryItemVersions.id })
    .from(registryItemVersions)
    .where(
      and(
        eq(registryItemVersions.itemId, item.id),
        eq(registryItemVersions.version, effectiveVersion),
      ),
    )
    .limit(1);

  if (itemVersion) {
    const [artifact] = await db
      .select({ manifestUrl: registryPreviewArtifacts.manifestUrl })
      .from(registryPreviewArtifacts)
      .where(
        and(
          eq(registryPreviewArtifacts.itemVersionId, itemVersion.id),
          eq(registryPreviewArtifacts.mode, "default"),
          eq(registryPreviewArtifacts.status, "ready"),
        ),
      )
      .limit(1);

    if (artifact?.manifestUrl) {
      try {
        const manifestRes = await fetch(artifact.manifestUrl, {
          next: { revalidate: 600 },
        });
        if (manifestRes.ok) {
          const manifestJson = (await manifestRes.json()) as {
            storiesHtmlUrl?: string | null;
          };
          const storiesHtmlUrl = manifestJson.storiesHtmlUrl?.trim();
          if (storiesHtmlUrl) {
            const htmlRes = await fetch(storiesHtmlUrl, {
              next: { revalidate: 600 },
            });
            if (htmlRes.ok) {
              return new NextResponse(await htmlRes.text(), {
                headers: {
                  "Content-Type": "text/html; charset=utf-8",
                  "Cache-Control": CACHE_NONE,
                },
              });
            }
          }
        }
      } catch {
        // Fall through to dynamic assembly
      }
    }
  }

  const html = await buildMultiStoryPreviewHtml({
    owner,
    name,
    title: item.title,
    description: item.description,
    project,
    version: effectiveVersion,
    stories,
    files: (item.files ?? []) as Array<{
      path: string;
      content: string;
      type?: string;
    }>,
  });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": CACHE_NONE,
    },
  });
}
