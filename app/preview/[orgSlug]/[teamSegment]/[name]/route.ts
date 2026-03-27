import { NextResponse } from "next/server";

/**
 * Team preview URL: `/preview/{orgSlug}/{teamSegment}/{name}` (teamSegment = slugify(team.name)).
 * Delegates to the two-segment preview by encoding `orgSlug/teamSegment` as a single `{owner}` param.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgSlug: string; teamSegment: string; name: string }> },
) {
  const { orgSlug, teamSegment, name } = await params;
  const owner = `${orgSlug}/${teamSegment}`;
  const url = new URL(request.url);
  const target = new URL(
    `/preview/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    url.origin,
  );
  target.search = url.search;
  return NextResponse.redirect(target);
}
