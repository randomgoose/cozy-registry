import { authorizeGet, authorizePost } from "@/lib/oauth-flow";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return authorizeGet(request);
}

export async function POST(request: Request) {
  return authorizePost(request);
}
