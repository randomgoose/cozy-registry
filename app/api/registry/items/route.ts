import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createRegistryItem } from "@/lib/registry";
import { validateTsx } from "@/lib/validate-tsx";
import { auth } from "@/lib/auth";
import { getUserIdFromToken } from "@/lib/auth-api";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, type, title, description, content, visibility } = body;

    if (!name || !type || !title || !content) {
      return NextResponse.json(
        { error: "Missing required fields: name, type, title, content" },
        { status: 400 }
      );
    }

    let userId: string | null = null;
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user?.id) userId = session.user.id;
    if (!userId) userId = await getUserIdFromToken(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required. Sign in or provide Authorization: Bearer <token>" },
        { status: 401 }
      );
    }

    const validation = validateTsx(content);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Invalid TSX: ${validation.error}` },
        { status: 400 }
      );
    }

    const nameRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!nameRegex.test(name)) {
      return NextResponse.json(
        { error: "Name must be kebab-case (e.g. my-component)" },
        { status: 400 }
      );
    }

    const validTypes = ["registry:block", "registry:component"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "Type must be registry:block or registry:component" },
        { status: 400 }
      );
    }

    const validVisibility = visibility === "private" ? "private" : "public";
    const item = await createRegistryItem({
      name,
      type,
      title,
      description: description || null,
      content,
      userId,
      visibility: validVisibility,
    });

    return NextResponse.json({ success: true, item });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json(
        { error: "A component with this name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
