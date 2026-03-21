import { and, asc, eq } from "drizzle-orm";
import { existsSync } from "node:fs";
import { db } from "@/lib/db";
import {
  registryAssetJobs,
  registryItems,
  registryItemVersions,
} from "@/lib/db/schema";
import {
  getPreviewCapturePlan,
  getThumbnailFromMeta,
  maybeBuildRegistryThumbnail,
} from "@/lib/thumbnail";
import { buildRegistryAssetPath, uploadPublicAsset } from "@/lib/storage";

export const GENERATE_THUMBNAIL_JOB = "generate_thumbnail" as const;

type ThumbnailJobPayload = {
  ownerId: string;
  ownerHandle?: string | null;
  name: string;
  version: string;
  type: string;
};

export async function enqueueThumbnailJob(params: {
  itemId: string;
  itemVersionId?: string | null;
  payload: ThumbnailJobPayload;
}) {
  const [job] = await db
    .insert(registryAssetJobs)
    .values({
      jobType: GENERATE_THUMBNAIL_JOB,
      itemId: params.itemId,
      itemVersionId: params.itemVersionId ?? null,
      status: "pending",
      payload: params.payload,
    })
    .returning();

  return job;
}

export async function claimPendingThumbnailJob() {
  const [pending] = await db
    .select()
    .from(registryAssetJobs)
    .where(
      and(
        eq(registryAssetJobs.jobType, GENERATE_THUMBNAIL_JOB),
        eq(registryAssetJobs.status, "pending"),
      ),
    )
    .orderBy(asc(registryAssetJobs.createdAt))
    .limit(1);

  if (!pending) return null;

  const [claimed] = await db
    .update(registryAssetJobs)
    .set({
      status: "processing",
      attemptCount: pending.attemptCount + 1,
      startedAt: new Date(),
      lastError: null,
    })
    .where(eq(registryAssetJobs.id, pending.id))
    .returning();

  return claimed ?? null;
}

export async function completeThumbnailJob(jobId: string) {
  await db
    .update(registryAssetJobs)
    .set({
      status: "completed",
      completedAt: new Date(),
      lastError: null,
    })
    .where(eq(registryAssetJobs.id, jobId));
}

export async function failThumbnailJob(jobId: string, error: string) {
  await db
    .update(registryAssetJobs)
    .set({
      status: "failed",
      lastError: error,
      completedAt: new Date(),
    })
    .where(eq(registryAssetJobs.id, jobId));
}

export async function processThemeThumbnailJob(jobId: string) {
  const [job] = await db
    .select()
    .from(registryAssetJobs)
    .where(eq(registryAssetJobs.id, jobId))
    .limit(1);

  if (!job) {
    throw new Error(`Thumbnail job not found: ${jobId}`);
  }

  const payload = (job.payload ?? {}) as ThumbnailJobPayload;
  const [item] = await db
    .select({
      id: registryItems.id,
      userId: registryItems.userId,
      meta: registryItems.meta,
      currentVersion: registryItems.currentVersion,
    })
    .from(registryItems)
    .where(eq(registryItems.id, job.itemId))
    .limit(1);

  if (!item) {
    throw new Error(`Registry item not found for job ${jobId}`);
  }

  const [itemVersion] = await db
    .select({
      id: registryItemVersions.id,
      meta: registryItemVersions.meta,
    })
    .from(registryItemVersions)
    .where(eq(registryItemVersions.id, job.itemVersionId!))
    .limit(1);

  const existing = getThumbnailFromMeta(itemVersion?.meta);
  if (existing && existing.kind === "theme-template") {
    await completeThumbnailJob(jobId);
    return {
      skipped: true,
      reason: "thumbnail already exists",
    };
  }

  const versionRows = await db
    .query.registryFileVersions.findMany({
      where: (file, { eq: eqFn }) => eqFn(file.itemVersionId, job.itemVersionId!),
    });

  const files = Object.fromEntries(versionRows.map((file) => [file.path, file.content]));
  const thumbnail = await maybeBuildRegistryThumbnail({
    type: payload.type,
    files,
    content: null,
    ownerId: payload.ownerId,
    itemName: payload.name,
    version: payload.version,
  });

  if (!thumbnail) {
    await completeThumbnailJob(jobId);
    return {
      skipped: true,
      reason: "thumbnail strategy not available for this item",
    };
  }

  const nextItemMeta = {
    ...(typeof item.meta === "object" && item.meta ? item.meta : {}),
    thumbnail,
  };

  await db
    .update(registryItems)
    .set({ meta: nextItemMeta })
    .where(eq(registryItems.id, item.id));

  if (itemVersion) {
    await db
      .update(registryItemVersions)
      .set({
        meta: {
          ...(typeof itemVersion.meta === "object" && itemVersion.meta
            ? itemVersion.meta
            : {}),
          thumbnail,
        },
      })
      .where(eq(registryItemVersions.id, itemVersion.id));
  }

  await completeThumbnailJob(jobId);
  return {
    skipped: false,
    thumbnail,
  };
}

export async function processPreviewCaptureThumbnailJob(jobId: string) {
  const [job] = await db
    .select()
    .from(registryAssetJobs)
    .where(eq(registryAssetJobs.id, jobId))
    .limit(1);

  if (!job) {
    throw new Error(`Thumbnail job not found: ${jobId}`);
  }

  const payload = (job.payload ?? {}) as ThumbnailJobPayload;
  const [item] = await db
    .select({
      id: registryItems.id,
      meta: registryItems.meta,
    })
    .from(registryItems)
    .where(eq(registryItems.id, job.itemId))
    .limit(1);

  if (!item) {
    throw new Error(`Registry item not found for job ${jobId}`);
  }

  const [itemVersion] = await db
    .select({
      id: registryItemVersions.id,
      meta: registryItemVersions.meta,
    })
    .from(registryItemVersions)
    .where(eq(registryItemVersions.id, job.itemVersionId!))
    .limit(1);

  if (!itemVersion) {
    throw new Error(`Registry item version not found for job ${jobId}`);
  }

  const existing = getThumbnailFromMeta(itemVersion.meta);
  if (existing && existing.kind === "preview-capture") {
    await completeThumbnailJob(jobId);
    return {
      skipped: true,
      reason: "thumbnail already exists",
    };
  }

  const { chromium: playwrightChromium } = await import("playwright-core");

  const baseUrl =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  if (!baseUrl) {
    throw new Error(
      "APP_URL or NEXT_PUBLIC_APP_URL is required to capture preview thumbnails.",
    );
  }

  const plan = getPreviewCapturePlan({
    owner: payload.ownerHandle ?? payload.ownerId,
    name: payload.name,
    version: payload.version,
  });

  const browser = await launchThumbnailBrowser(playwrightChromium);

  try {
    const context = await browser.newContext({
      viewport: {
        width: plan.viewport.width,
        height: plan.viewport.height,
      },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}${plan.previewPath}`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await page.waitForTimeout(600);

    const buffer = await page.screenshot({
      type: "png",
      fullPage: false,
    });

    const path = buildRegistryAssetPath({
      scope: { kind: "user", id: payload.ownerId },
      ownerId: payload.ownerId,
      itemName: payload.name,
      version: payload.version,
      variant: "card",
      extension: "png",
    });

    const uploaded = await uploadPublicAsset({
      path,
      body: new Uint8Array(buffer),
      contentType: "image/png",
      cacheControl: "31536000",
    });

    const thumbnail = {
      url: uploaded.url,
      kind: "preview-capture" as const,
      width: plan.viewport.width,
      height: plan.viewport.height,
      generatedAt: new Date().toISOString(),
    };

    await db
      .update(registryItems)
      .set({
        meta: {
          ...(typeof item.meta === "object" && item.meta ? item.meta : {}),
          thumbnail,
        },
      })
      .where(eq(registryItems.id, item.id));

    await db
      .update(registryItemVersions)
      .set({
        meta: {
          ...(typeof itemVersion.meta === "object" && itemVersion.meta
            ? itemVersion.meta
            : {}),
          thumbnail,
        },
      })
      .where(eq(registryItemVersions.id, itemVersion.id));

    await completeThumbnailJob(jobId);
    return {
      skipped: false,
      thumbnail,
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function launchThumbnailBrowser(
  playwrightChromium: Awaited<typeof import("playwright-core")>["chromium"],
) {
  const explicitExecutable = process.env.THUMBNAIL_BROWSER_EXECUTABLE_PATH;
  if (explicitExecutable) {
    console.log("[thumbnail-worker] launching browser via explicit executable", {
      executablePath: explicitExecutable,
    });
    return playwrightChromium.launch({
      executablePath: explicitExecutable,
      headless: true,
    });
  }

  const isLinux = process.platform === "linux";
  const isVercelLike =
    typeof process.env.VERCEL === "string" || typeof process.env.AWS_REGION === "string";

  if (isLinux || isVercelLike) {
    const chromium = (await import("@sparticuz/chromium")).default;
    console.log("[thumbnail-worker] launching browser via sparticuz chromium", {
      platform: process.platform,
      isVercelLike,
    });
    return playwrightChromium.launch({
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      headless: true,
    });
  }

  const localExecutable = findLocalBrowserExecutable();
  if (localExecutable) {
    console.log("[thumbnail-worker] launching browser via detected local browser", {
      executablePath: localExecutable,
    });
    return playwrightChromium.launch({
      executablePath: localExecutable,
      headless: true,
    });
  }

  try {
    console.log("[thumbnail-worker] launching browser via Playwright channel", {
      channel: "chromium",
    });
    return await playwrightChromium.launch({
      channel: "chromium",
      headless: true,
    });
  } catch {
    const chromium = (await import("@sparticuz/chromium")).default;
    console.log("[thumbnail-worker] Playwright channel unavailable, falling back to sparticuz chromium", {
      platform: process.platform,
    });
    return playwrightChromium.launch({
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      headless: true,
    });
  }
}

function findLocalBrowserExecutable() {
  const candidates =
    process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
        ]
      : [];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
