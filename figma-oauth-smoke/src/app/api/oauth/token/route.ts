import { tokenPost } from "@/lib/oauth-flow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return tokenPost(request);
}
