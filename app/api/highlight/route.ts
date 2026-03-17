import { NextResponse } from "next/server";
import { codeToHtml } from "shiki";

type HighlightRequest = {
  code: string;
  language?: string;
};

function normalizeLang(lang: string | undefined): string {
  const v = (lang ?? "tsx").toLowerCase();
  if (v === "ts") return "typescript";
  if (v === "tsx") return "tsx";
  if (v === "js") return "javascript";
  if (v === "jsx") return "jsx";
  if (v === "css") return "css";
  if (v === "json") return "json";
  if (v === "html") return "html";
  if (v === "md" || v === "markdown") return "markdown";
  if (v === "shell" || v === "bash" || v === "sh") return "bash";
  return "text";
}

export async function POST(request: Request) {
  let body: HighlightRequest | null = null;
  try {
    body = (await request.json()) as HighlightRequest;
  } catch {
    body = null;
  }

  const code = typeof body?.code === "string" ? body.code : "";
  const language = typeof body?.language === "string" ? body.language : "tsx";

  // keep this endpoint cheap and safe
  if (code.length === 0) {
    return NextResponse.json({ html: "" });
  }
  if (code.length > 200_000) {
    return NextResponse.json(
      { error: "Code too large to highlight" },
      { status: 413 },
    );
  }

  const lang = normalizeLang(language);

  try {
    const html = await codeToHtml(code, {
      lang,
      theme: "github-dark",
    });
    return NextResponse.json({ html });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Highlight failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

