import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCurrentVersion, getRegistryItemByOwnerNameAndVersion, getRegistryItemVersions } from "@/lib/registry";

type Params = { params: Promise<{ orgSlug: string; teamSegment: string; name: string }> };

/** Version list for team-owned items (`orgSlug` + slugified team name segment). */
export async function GET(request: Request, { params }: Params) {
  const { orgSlug, teamSegment, name } = await params;
  const owner = `${orgSlug}/${teamSegment}`;
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? null;

  const item = await getRegistryItemByOwnerNameAndVersion(owner, name, null, userId);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const versions = await getRegistryItemVersions(owner, name, userId);
  const currentVersion = getCurrentVersion(item);

  return NextResponse.json({
    currentVersion,
    versions: versions.map((v) => ({
      version: v.version,
      createdAt: v.createdAt,
      createdBy: v.createdBy,
      message: v.message ?? null,
    })),
  });
}
