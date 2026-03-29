import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { publishRegistryItem } from "../../lib/platform";

type RegistryItemType = "registry:block" | "registry:ui" | "registry:theme";

const typeOptions: Array<{ value: RegistryItemType; label: string }> = [
  { value: "registry:block", label: "Block" },
  { value: "registry:ui", label: "UI" },
  { value: "registry:theme", label: "Theme" },
];

const contentTemplates: Record<RegistryItemType, string> = {
  "registry:block": `"use client";

type HeroSectionProps = {
  title: string;
  description: string;
};

export function HeroSection({ title, description }: HeroSectionProps) {
  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-10">
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-950">{title}</h1>
      <p className="mt-4 text-zinc-600">{description}</p>
    </section>
  );
}
`,
  "registry:ui": `type MarketingBadgeProps = {
  label: string;
};

export function MarketingBadge({ label }: MarketingBadgeProps) {
  return (
    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm text-amber-900">
      {label}
    </span>
  );
}
`,
  "registry:theme": `:root {
  --background: #fffdf8;
  --foreground: #221b16;
  --card: #ffffff;
  --primary: #d97706;
  --primary-foreground: #ffffff;
  --border: #eadfce;
  --radius: 1rem;
}
`,
};

function normalizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeRegistryDependenciesInput(value: string) {
  return value
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function PublishPage() {
  const [name, setName] = useState("");
  const [type, setType] = useState<RegistryItemType>("registry:block");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [content, setContent] = useState("");
  const [registryDepsText, setRegistryDepsText] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  const normalizedName = normalizeName(name);
  const canSubmit = useMemo(() => {
    return (
      normalizedName.length > 0 &&
      title.trim().length >= 3 &&
      content.trim().length > 0 &&
      status !== "loading"
    );
  }, [content, normalizedName, status, title]);

  function applyTemplate() {
    setContent(contentTemplates[type]);
    if (!name.trim()) {
      setName(
        type === "registry:theme"
          ? "sunset-theme"
          : type === "registry:block"
            ? "hero-section"
            : "marketing-badge",
      );
    }
    if (!title.trim()) {
      setTitle(
        type === "registry:theme"
          ? "Sunset Theme"
          : type === "registry:block"
            ? "Hero Section"
            : "Marketing Badge",
      );
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      setStatus("error");
      setError("Please complete the required fields before publishing.");
      return;
    }

    setStatus("loading");
    setError("");

    try {
      const body: Record<string, unknown> = {
        name: normalizedName,
        type,
        title: title.trim(),
        description: description.trim() || null,
        visibility,
      };

      const registryDependencies = normalizeRegistryDependenciesInput(registryDepsText);
      if (registryDependencies.length > 0) {
        body.registryDependencies = registryDependencies;
      }

      if (type === "registry:theme") {
        body.files = {
          "theme.css": content,
        };
      } else {
        body.content = content;
      }

      const { response, data } = await publishRegistryItem(body);
      if (!response.ok) {
        const message =
          (typeof data?.error === "string" ? data.error : null) ||
          `Publish failed (${response.status})`;
        throw new Error(message);
      }

      setStatus("success");
      window.location.href = `/registry/${normalizedName}`;
    } catch (nextError) {
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Failed to publish");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          >
            <ArrowLeft className="size-4" />
            Back to dashboard
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700 dark:text-amber-300">
                Publish to Cozy registry
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                Publish a source-native registry item
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                This form publishes directly through the extracted platform boundary.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <label className="block">
                  <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Name
                  </span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="hero-section"
                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  <span className="mt-2 block text-xs text-zinc-500 dark:text-zinc-400">
                    Normalized as: {normalizedName || "—"}
                  </span>
                </label>

                <label className="block">
                  <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Title
                  </span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Hero Section"
                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <label className="block">
                  <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Type
                  </span>
                  <select
                    value={type}
                    onChange={(event) => setType(event.target.value as RegistryItemType)}
                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {typeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Visibility
                  </span>
                  <select
                    value={visibility}
                    onChange={(event) =>
                      setVisibility(event.target.value as "public" | "private")
                    }
                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Description
                </span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  placeholder="Describe what this item is for."
                  className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </label>

              <label className="block">
                <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Registry dependencies
                </span>
                <textarea
                  value={registryDepsText}
                  onChange={(event) => setRegistryDepsText(event.target.value)}
                  rows={2}
                  placeholder="@cozy/theme, @cozy/button"
                  className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </label>

              <label className="block">
                <div className="flex items-center justify-between gap-3">
                  <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {type === "registry:theme" ? "CSS content" : "TSX content"}
                  </span>
                  <button
                    type="button"
                    onClick={applyTemplate}
                    className="text-sm font-medium text-amber-700 transition hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
                  >
                    Apply template
                  </button>
                </div>
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={18}
                  placeholder={contentTemplates[type]}
                  className="mt-2 w-full rounded-2xl border border-zinc-300 bg-[#0d1117] px-4 py-4 font-mono text-sm text-zinc-100 dark:border-zinc-700"
                />
              </label>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                  {error}
                </div>
              ) : null}

              {status === "success" ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                  Published successfully. Redirecting to the registry detail page…
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  {status === "loading" ? "Publishing..." : "Publish item"}
                </button>
                <a
                  href="/registry"
                  className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Browse registry
                  <ArrowRight className="size-4" />
                </a>
              </div>
            </form>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                What is already migrated
              </h2>
              <ul className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                <li>Publishing requests now hit the extracted platform API.</li>
                <li>Registry browsing, detail, and preview already run from the new host.</li>
                <li>Theme files and component source are now published directly from the migrated host.</li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
