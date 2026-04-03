import { GET as getRegistryItemRoute } from "@/app/api/r/[owner]/[name]/route";

export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ owner: string; project: string; name: string }> },
) {
  const { owner, project, name } = await params;
  const url = new URL(request.url);
  url.searchParams.set("project", project);

  return getRegistryItemRoute(new Request(url, request), {
    params: Promise.resolve({ owner, name }),
  });
}
