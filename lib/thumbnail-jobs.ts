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
const THUMBNAIL_DEVICE_SCALE = 2;

type ThumbnailJobPayload = {
  ownerId: string;
  ownerHandle?: string | null;
  projectKey?: string | null;
  name: string;
  version: string;
  type: string;
};

export async function capturePreviewThumbnail(params: {
  owner: string;
  name: string;
  version: string;
  projectKey?: string | null;
  strategy?: "computed" | "locator";
}) {
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
    owner: params.owner,
    name: params.name,
    version: params.version,
    project: params.projectKey,
  });

  const browser = await launchThumbnailBrowser(playwrightChromium);

  try {
    const context = await browser.newContext({
      viewport: {
        width: plan.viewport.width,
        height: plan.viewport.height,
      },
      deviceScaleFactor: THUMBNAIL_DEVICE_SCALE,
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}${plan.previewPath}`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await page.waitForTimeout(600);
    const surfaceDiagnostics = await page.evaluate(() => {
      const htmlNode = document.documentElement;
      const bodyNode = document.body;
      const rootNode = document.querySelector("#root") as HTMLElement | null;
      const contentNode = document.querySelector(
        "[data-cozy-preview-content]",
      ) as HTMLElement | null;
      const subjectNode = document.querySelector(
        "[data-cozy-preview-subject]",
      ) as HTMLElement | null;

      const htmlStyle = window.getComputedStyle(htmlNode);
      const bodyStyle = window.getComputedStyle(bodyNode);
      const rootStyle = rootNode ? window.getComputedStyle(rootNode) : null;
      const contentStyle = contentNode
        ? window.getComputedStyle(contentNode)
        : null;
      const subjectStyle = subjectNode
        ? window.getComputedStyle(subjectNode)
        : null;

      const htmlRect = htmlNode.getBoundingClientRect();
      const bodyRect = bodyNode.getBoundingClientRect();
      const rootRect = rootNode?.getBoundingClientRect() ?? null;
      const contentRect = contentNode?.getBoundingClientRect() ?? null;
      const subjectRect = subjectNode?.getBoundingClientRect() ?? null;

      return {
        html: {
          selector: "html",
          backgroundColor: htmlStyle.backgroundColor,
          backgroundImage: htmlStyle.backgroundImage,
          opacity: htmlStyle.opacity,
          width: htmlRect.width,
          height: htmlRect.height,
        },
        body: {
          selector: "body",
          backgroundColor: bodyStyle.backgroundColor,
          backgroundImage: bodyStyle.backgroundImage,
          opacity: bodyStyle.opacity,
          width: bodyRect.width,
          height: bodyRect.height,
        },
        root: rootNode
          ? {
              selector: "#root",
              backgroundColor: rootStyle?.backgroundColor ?? null,
              backgroundImage: rootStyle?.backgroundImage ?? null,
              opacity: rootStyle?.opacity ?? null,
              width: rootRect?.width ?? null,
              height: rootRect?.height ?? null,
            }
          : null,
        content: contentNode
          ? {
              selector: "[data-cozy-preview-content]",
              backgroundColor: contentStyle?.backgroundColor ?? null,
              backgroundImage: contentStyle?.backgroundImage ?? null,
              opacity: contentStyle?.opacity ?? null,
              width: contentRect?.width ?? null,
              height: contentRect?.height ?? null,
            }
          : null,
        subject: subjectNode
          ? {
              selector: "[data-cozy-preview-subject]",
              backgroundColor: subjectStyle?.backgroundColor ?? null,
              backgroundImage: subjectStyle?.backgroundImage ?? null,
              opacity: subjectStyle?.opacity ?? null,
              width: subjectRect?.width ?? null,
              height: subjectRect?.height ?? null,
            }
          : null,
      };
    });
    const preferredStrategy = params.strategy ?? "locator";
    if (preferredStrategy === "locator") {
      try {
        const locator = page.locator("[data-cozy-preview-subject]").first();
        await locator.waitFor({ state: "visible", timeout: 10_000 });
        const targetRect = await locator.boundingBox();
        if (!targetRect) {
          throw new Error("Locator is visible but returned no bounding box.");
        }
        const subjectWidth = Math.max(1, targetRect.width);
        const subjectHeight = Math.max(1, targetRect.height);
        const basePadding = Math.max(
          2,
          Math.min(8, Math.round(Math.min(subjectWidth, subjectHeight) * 0.04)),
        );
        const leftPad = Math.min(basePadding, Math.max(0, targetRect.x));
        const topPad = Math.min(basePadding, Math.max(0, targetRect.y));
        const rightPad = Math.min(
          basePadding + 2,
          Math.max(0, plan.viewport.width - (targetRect.x + targetRect.width)),
        );
        const bottomPad = Math.min(
          basePadding + 2,
          Math.max(0, plan.viewport.height - (targetRect.y + targetRect.height)),
        );
        const clip = {
          x: Math.max(0, targetRect.x - leftPad),
          y: Math.max(0, targetRect.y - topPad),
          width: Math.max(
            1,
            Math.min(
              targetRect.width + leftPad + rightPad,
              plan.viewport.width - Math.max(0, targetRect.x - leftPad),
            ),
          ),
          height: Math.max(
            1,
            Math.min(
              targetRect.height + topPad + bottomPad,
              plan.viewport.height - Math.max(0, targetRect.y - topPad),
            ),
          ),
        };
        const buffer = await page.screenshot({
          type: "png",
          fullPage: false,
          omitBackground: true,
          clip,
        });

        await context.close().catch(() => undefined);
        return {
          buffer,
          clip,
          plan,
          diagnostics: {
            strategy: "locator",
            clip,
            targetRect,
            candidates: [],
            surfaces: surfaceDiagnostics,
          },
        };
      } catch (error) {
        if (params.strategy === "locator") {
          throw error;
        }
      }
    }

    const diagnostics = await page.evaluate(() => {
      const target = document.querySelector(
        "[data-cozy-preview-subject]",
      ) as HTMLElement | null;
      if (!target) return { clip: null, targetRect: null, candidates: [] as unknown[] };

      const targetRect = target.getBoundingClientRect();
      const targetArea = Math.max(1, targetRect.width * targetRect.height);
      const descendants = Array.from(target.querySelectorAll("*")) as HTMLElement[];
      const nodes = descendants.length > 0 ? descendants : [target];
      const pageBackground =
        window.getComputedStyle(document.body).backgroundColor || "";
      const candidates: Array<Record<string, unknown>> = [];
      let left = Number.POSITIVE_INFINITY;
      let top = Number.POSITIVE_INFINITY;
      let right = Number.NEGATIVE_INFINITY;
      let bottom = Number.NEGATIVE_INFINITY;

      for (const node of nodes) {
        const style = window.getComputedStyle(node);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0
        ) {
          continue;
        }

        const rect = node.getBoundingClientRect();
        if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) continue;
        if (rect.width <= 1 || rect.height <= 1) continue;

        const area = rect.width * rect.height;
        const tag = node.tagName;
        const ownText = Array.from(node.childNodes)
          .filter((child) => child.nodeType === Node.TEXT_NODE)
          .map((child) => child.textContent ?? "")
          .join(" ")
          .trim();
        const hasOwnText = ownText.length > 0;
        const isIntrinsicContentNode = [
          "IMG",
          "SVG",
          "CANVAS",
          "VIDEO",
          "BUTTON",
          "INPUT",
          "TEXTAREA",
          "SELECT",
        ].includes(tag);
        const borderWidth =
          parseFloat(style.borderTopWidth || "0") +
          parseFloat(style.borderRightWidth || "0") +
          parseFloat(style.borderBottomWidth || "0") +
          parseFloat(style.borderLeftWidth || "0");
        const bg = style.backgroundColor;
        const sameAsPageBackground =
          !!bg &&
          !!pageBackground &&
          bg.replace(/\s+/g, "") === pageBackground.replace(/\s+/g, "");
        const hasVisibleBackground =
          !!bg &&
          bg !== "transparent" &&
          !bg.includes("rgba(0, 0, 0, 0)") &&
          bg !== "rgb(0, 0, 0, 0)" &&
          !sameAsPageBackground;
        const hasDecoration =
          (!!style.backgroundImage && style.backgroundImage !== "none") ||
          (!!style.boxShadow && style.boxShadow !== "none") ||
          borderWidth > 0;
        const hasContent =
          hasOwnText ||
          isIntrinsicContentNode ||
          hasDecoration ||
          hasVisibleBackground;
        if (!hasContent) {
          continue;
        }

        const mostlyFullCanvas = area / targetArea > 0.92;
        const isContainerOnly = !hasOwnText && !isIntrinsicContentNode;
        const decorationOnly = !hasDecoration;

        const skipped =
          (isContainerOnly && sameAsPageBackground && decorationOnly) ||
          (mostlyFullCanvas &&
            isContainerOnly &&
            !hasVisibleBackground &&
            decorationOnly);
        candidates.push({
          tag,
          ownText,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          bg,
          sameAsPageBackground,
          hasVisibleBackground,
          hasDecoration,
          isIntrinsicContentNode,
          mostlyFullCanvas,
          isContainerOnly,
          skipped,
        });
        if (skipped) continue;

        left = Math.min(left, rect.left);
        top = Math.min(top, rect.top);
        right = Math.max(right, rect.right);
        bottom = Math.max(bottom, rect.bottom);
      }

      if (
        !Number.isFinite(left) ||
        !Number.isFinite(top) ||
        !Number.isFinite(right) ||
        !Number.isFinite(bottom)
      ) {
        const rect = target.getBoundingClientRect();
        if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
          return {
            clip: null,
            targetRect: null,
            candidates,
          };
        }
        if (rect.width <= 1 || rect.height <= 1) {
          return {
            clip: null,
            targetRect: null,
            candidates,
          };
        }
        left = rect.left;
        top = rect.top;
        right = rect.right;
        bottom = rect.bottom;
      }

      const subjectWidth = Math.max(1, right - left);
      const subjectHeight = Math.max(1, bottom - top);
      const padding = Math.max(
        8,
        Math.min(20, Math.round(Math.min(subjectWidth, subjectHeight) * 0.14)),
      );
      const appliedLeft = Math.min(padding, Math.max(0, left));
      const appliedTop = Math.min(padding, Math.max(0, top));
      const appliedRight = Math.min(
        padding,
        Math.max(0, window.innerWidth - right),
      );
      const appliedBottom = Math.min(
        padding,
        Math.max(0, window.innerHeight - bottom),
      );
      const x = Math.max(0, left - appliedLeft);
      const y = Math.max(0, top - appliedTop);
      const maxWidth = window.innerWidth - x;
      const maxHeight = window.innerHeight - y;

      return {
        clip: {
          x,
          y,
          width: Math.max(
            1,
            Math.min(right - left + appliedLeft + appliedRight, maxWidth),
          ),
          height: Math.max(
            1,
            Math.min(bottom - top + appliedTop + appliedBottom, maxHeight),
          ),
        },
        targetRect: {
          x: targetRect.x,
          y: targetRect.y,
          width: targetRect.width,
          height: targetRect.height,
        },
        candidates,
      };
    });

    const clip = diagnostics.clip;
    const buffer = await page.screenshot({
      type: "png",
      fullPage: false,
      omitBackground: true,
      ...(clip ? { clip } : {}),
    });

    await context.close().catch(() => undefined);
    return {
      buffer,
      clip,
      plan,
      diagnostics: {
        strategy: "computed",
        ...diagnostics,
        surfaces: surfaceDiagnostics,
      },
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

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

  const { buffer, plan } = await capturePreviewThumbnail({
    owner: payload.ownerHandle ?? payload.ownerId,
    name: payload.name,
    version: payload.version,
    projectKey: payload.projectKey ?? null,
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
      assetType: "thumbnail",
    });

    const thumbnail = {
      url: uploaded.url,
      kind: "preview-capture" as const,
      width: plan.viewport.width * THUMBNAIL_DEVICE_SCALE,
      height: plan.viewport.height * THUMBNAIL_DEVICE_SCALE,
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
