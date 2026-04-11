import Link from "next/link";

import { PageContentShell } from "@/app/components/PageContentShell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActivityListItem } from "@/lib/registry-activities";
import {
  activityPrimaryLine,
  activityResourceHref,
  resourceTypeShortLabel,
} from "@/lib/registry-activities";
import { Hyperlink } from "@/components/ui/hyperlink";

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(Math.abs(diffMs) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (sec < 60) return rtf.format(-Math.max(1, Math.floor(sec)), "second");
  const min = Math.floor(sec / 60);
  if (min < 60) return rtf.format(-min, "minute");
  const hr = Math.floor(min / 60);
  if (hr < 48) return rtf.format(-hr, "hour");
  const day = Math.floor(hr / 24);
  if (day < 30) return rtf.format(-day, "day");
  return d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export function ActivityFeedSection(props: {
  title: string;
  subtitle: string;
  items: ActivityListItem[];
  viewerUserId: string;
  pathname: string;
  nextCursor: string | null;
}) {
  const { title, subtitle, items, viewerUserId, pathname, nextCursor } = props;

  return (
    <PageContentShell size="wide">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
      </header>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/80 px-5 py-10 text-center dark:border-zinc-700 dark:bg-zinc-950/40">
          <p className="text-sm">Nothing here yet</p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            When you or your team create, publish, or update items, those events will show up here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden border-y border-border">
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 text-xs text-zinc-500 dark:text-zinc-400">
                  Event
                </TableHead>
                <TableHead className="px-4 text-xs text-zinc-500 dark:text-zinc-400">
                  Resource
                </TableHead>
                <TableHead className="px-4 text-xs text-zinc-500 dark:text-zinc-400">
                  Context
                </TableHead>
                <TableHead className="px-4 text-right text-xs text-zinc-500 dark:text-zinc-400">
                  Time
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const primary = activityPrimaryLine(item, viewerUserId);
                const href = activityResourceHref(item);
                const typeLabel = resourceTypeShortLabel(item.resourceType);
                const owner = item.resourceOwnerRef?.trim();
                const refLabel =
                  owner && item.resourceName
                    ? `@${owner}/${item.resourceName}`
                    : item.resourceName;
                const contextLabel =
                  item.contextKind === "project"
                    ? `Project · ${item.contextLabel}`
                    : item.contextKind === "workspace"
                      ? `Workspace · ${item.contextLabel}`
                      : item.contextLabel;

                return (
                  <TableRow key={item.id}>
                    <TableCell className="px-4 py-3 align-top whitespace-normal">
                      <div className="min-w-0">
                        <p className="leading-snug text-foreground">
                          {primary}
                        </p>
                        {item.versionLabel ? (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Version {item.versionLabel}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 align-top whitespace-normal">
                      <div className="min-w-0">
                        {href ? (
                          <Link
                            href={href}
                            className="mt-1 inline-flex min-w-0 max-w-full text-sm text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                          >
                            <span className="truncate">{refLabel}</span>
                          </Link>
                        ) : (
                          <p className="mt-1 truncate text-sm text-zinc-900 dark:text-zinc-100">
                            {refLabel}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 align-top whitespace-normal">
                      <Hyperlink href={`${pathname}?context=${item.contextKind}`}>
                        {contextLabel}
                      </Hyperlink>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right align-top">
                      <time
                        className="text-xs text-zinc-500 dark:text-zinc-400"
                        dateTime={item.createdAt}
                        title={new Date(item.createdAt).toLocaleString()}
                      >
                        {formatRelativeTime(item.createdAt)}
                      </time>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {nextCursor ? (
        <div className="mt-6 flex justify-center">
          <Link
            href={`${pathname}?cursor=${encodeURIComponent(nextCursor)}`}
            className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Load more
          </Link>
        </div>
      ) : null}
    </PageContentShell>
  );
}
