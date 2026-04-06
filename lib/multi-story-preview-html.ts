import type { PreviewStory } from "@/lib/preview-stories";
import { codeToHtml } from "shiki";
import { PREVIEW_MSG_SET_THEME_PATCH } from "@/lib/preview-messages";
import {
  buildMultiStoryPreviewPageUrl,
  buildStoryPreviewPageUrl,
} from "@/lib/story-preview-urls";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlCode(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function encodeCopyPayload(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

const COPY_BUTTON_INNER_HTML = `
  <span class="copy-button-icon" aria-hidden="true">
    <svg viewBox="0 0 16 16" fill="none">
      <rect x="5" y="3" width="8" height="10" rx="2"></rect>
      <path d="M3 10V5.5C3 4.67157 3.67157 4 4.5 4H9"></path>
    </svg>
  </span>
  <span class="copy-button-text">Copy</span>
`;

function isCodeFile(path: string): boolean {
  return /\.(tsx?|jsx?|css|json)$/i.test(path);
}

type PreviewFile = {
  path: string;
  content: string;
  type?: string;
};

function detectCodeLanguage(path: string | null | undefined): string {
  const value = path?.toLowerCase() ?? "";
  if (value.endsWith(".tsx")) return "tsx";
  if (value.endsWith(".ts")) return "typescript";
  if (value.endsWith(".jsx")) return "jsx";
  if (value.endsWith(".js")) return "javascript";
  if (value.endsWith(".css")) return "css";
  if (value.endsWith(".json")) return "json";
  if (value.endsWith(".html")) return "html";
  if (value.endsWith(".md") || value.endsWith(".mdx")) return "markdown";
  return "text";
}

async function highlightCodeBlock(content: string, language: string) {
  try {
    return await codeToHtml(content, {
      lang: language,
      theme: "github-light",
    });
  } catch {
    return `<pre class="shiki-fallback"><code>${escapeHtmlCode(content)}</code></pre>`;
  }
}

function findStoryCodeFile(
  story: PreviewStory,
  files: PreviewFile[],
): PreviewFile | null {
  const codeFiles = files.filter(
    (file) => file.path && typeof file.content === "string" && isCodeFile(file.path),
  );
  if (codeFiles.length === 0) return null;

  const exportName = story.export?.trim();
  if (exportName) {
    const exportPatterns = [
      `export function ${exportName}`,
      `export const ${exportName}`,
      `export class ${exportName}`,
      `export { ${exportName}`,
      `export default function ${exportName}`,
    ];
    const directMatch = codeFiles.find((file) =>
      exportPatterns.some((pattern) => file.content.includes(pattern)),
    );
    if (directMatch) return directMatch;
  }

  const preferredTsx = codeFiles.find((file) => /\.(tsx|jsx)$/i.test(file.path));
  return preferredTsx ?? codeFiles[0] ?? null;
}

export async function buildMultiStoryPreviewHtml(input: {
  owner: string;
  name: string;
  title: string;
  description: string | null;
  project: string | null;
  version: string;
  stories: PreviewStory[];
  files?: PreviewFile[];
}) {
  const files = input.files ?? [];
  const navLinks = input.stories
    .map((story) => {
      const href = buildMultiStoryPreviewPageUrl({
        owner: input.owner,
        name: input.name,
        project: input.project,
        version: input.version,
        storyId: story.id,
      });
      return `<a data-story-link="${escapeHtml(story.id)}" href="${escapeHtml(
        `${href}#story-${story.id}`,
      )}" class="nav-link">${escapeHtml(story.title)}</a>`;
    })
    .join("");

  const sections = (
    await Promise.all(
      input.stories.map(async (story) => {
      const previewHref = buildStoryPreviewPageUrl({
        owner: input.owner,
        name: input.name,
        project: input.project,
        version: input.version,
        storyId: story.id,
      });
      const singleHref = buildStoryPreviewPageUrl({
        owner: input.owner,
        name: input.name,
        project: input.project,
        version: input.version,
        storyId: story.id,
      });
      const descriptionHtml = story.description?.trim()
        ? `<p class="story-description">${escapeHtml(story.description.trim())}</p>`
        : "";
      const tagsHtml =
        story.tags && story.tags.length > 0
          ? `<div class="story-tags">${story.tags
              .map((tag) => `<span class="story-tag">${escapeHtml(tag)}</span>`)
              .join("")}</div>`
          : "";
      const codeFile = findStoryCodeFile(story, files);
      const storyCode = story.code?.trim() ? story.code : null;
      const sourcePath =
        story.sourcePath?.trim() || codeFile?.path || "Story source";
      const sourceContent = storyCode ?? codeFile?.content ?? null;
      const codeLanguage =
        story.codeLanguage?.trim() || detectCodeLanguage(sourcePath);
      const codeHtml = sourceContent
        ? await highlightCodeBlock(sourceContent, codeLanguage)
        : "";
      const codePanelHtml = sourceContent
        ? codeHtml
        : `<div class="code-empty">No source snippet available for this story yet.</div>`;

      return `
        <section id="story-${escapeHtml(story.id)}" data-story-section="${escapeHtml(
          story.id,
        )}" class="story-section">
          <div class="story-header">
            <div>
              <p class="story-kicker">Story</p>
              <h2>${escapeHtml(story.title)}</h2>
              ${descriptionHtml}
              ${tagsHtml}
            </div>
            <a
              class="story-open"
              data-base-href="${escapeHtml(singleHref)}"
              href="${escapeHtml(singleHref)}"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open single story
            </a>
          </div>
          <div class="story-frame-wrap">
            <iframe
              data-preview-iframe="${escapeHtml(story.id)}"
              data-base-src="${escapeHtml(previewHref)}"
              src="about:blank"
              title="${escapeHtml(`${input.title} · ${story.title}`)}"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin"
            ></iframe>
          </div>
          <div class="story-code-panel">
            <div class="story-code-toolbar">
              <div class="story-code-meta">
                <span class="story-code-label">Code</span>
                ${
                  sourceContent
                    ? `<span class="story-code-path">${escapeHtml(sourcePath)}</span>`
                    : ""
                }
              </div>
              ${
                sourceContent
                  ? `<div class="story-code-actions">
                      <button
                        type="button"
                        class="toggle-button"
                        data-toggle-button="${escapeHtml(story.id)}"
                        data-collapsed-label="Expand"
                        data-expanded-label="Collapse"
                        aria-expanded="false"
                      >
                        Expand
                      </button>
                      <button
                        type="button"
                        class="copy-button"
                        data-copy-button="${escapeHtml(story.id)}"
                        data-copy-b64="${encodeCopyPayload(sourceContent)}"
                        aria-label="Copy source for ${escapeHtml(story.title)}"
                      >
                        ${COPY_BUTTON_INNER_HTML}
                      </button>
                    </div>`
                  : ""
              }
            </div>
            <div class="story-code-scroll" data-code-scroll="${escapeHtml(story.id)}">
              <div class="story-code">${codePanelHtml}</div>
            </div>
          </div>
        </section>
      `;
      }),
    )
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(input.title)} Stories</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script>
      (function () {
        var params = new URLSearchParams(window.location.search);
        var theme = params.get("theme");
        if (theme) document.documentElement.classList.add(theme);
      })();
    </script>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f4f5;
        --panel: #ffffff;
        --panel-muted: #fafafa;
        --border: #e4e4e7;
        --text: #18181b;
        --muted: #71717a;
        --accent: #2563eb;
        --accent-soft: rgba(37, 99, 235, 0.12);
        --shadow: 0 14px 40px rgba(24, 24, 27, 0.08);
      }
      :root.dark {
        color-scheme: dark;
        --bg: #09090b;
        --panel: #111114;
        --panel-muted: #18181b;
        --border: #27272a;
        --text: #fafafa;
        --muted: #a1a1aa;
        --accent: #60a5fa;
        --accent-soft: rgba(96, 165, 250, 0.16);
        --shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
      }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: var(--bg);
        color: var(--text);
      }
      .page {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 280px;
        gap: 24px;
        width: min(1440px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 24px 0 40px;
      }
      .main { min-width: 0; }
      .hero {
        margin-bottom: 20px;
        padding: 24px;
        border: 1px solid var(--border);
        border-radius: 20px;
        background: linear-gradient(180deg, var(--panel), var(--panel-muted));
        box-shadow: var(--shadow);
      }
      .hero-kicker {
        margin: 0 0 8px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .hero h1 { margin: 0; font-size: clamp(30px, 4vw, 44px); line-height: 1.05; }
      .hero-meta { margin-top: 10px; color: var(--muted); font-size: 14px; }
      .hero-description {
        margin-top: 14px;
        max-width: 72ch;
        color: var(--muted);
        line-height: 1.6;
        font-size: 15px;
      }
      .story-section {
        margin-bottom: 20px;
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: 20px;
        background: var(--panel);
        box-shadow: var(--shadow);
        scroll-margin-top: 20px;
      }
      .story-header {
        display: flex;
        gap: 16px;
        align-items: flex-start;
        justify-content: space-between;
        padding: 20px 20px 0;
        margin-bottom: 16px;
      }
      .story-kicker {
        margin: 0 0 6px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .story-header h2 { margin: 0; font-size: 22px; line-height: 1.15; }
      .story-description { margin: 10px 0 0; color: var(--muted); font-size: 14px; line-height: 1.6; }
      .story-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .story-tag {
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 600;
      }
      .story-open {
        flex-shrink: 0;
        border-radius: 999px;
        border: 1px solid var(--border);
        padding: 9px 12px;
        color: var(--text);
        background: var(--panel-muted);
        text-decoration: none;
        font-size: 13px;
        font-weight: 600;
      }
      .story-frame-wrap {
        overflow: hidden;
        border-top: 1px solid var(--border);
        border-bottom: 1px solid var(--border);
        background:
          radial-gradient(circle at top, color-mix(in srgb, var(--panel-muted) 90%, transparent), transparent 60%),
          var(--panel);
      }
      .story-frame-wrap iframe {
        display: block;
        width: 100%;
        min-height: 420px;
        height: 54vh;
        max-height: 620px;
        border: 0;
        background: transparent;
      }
      .story-code-panel {
        overflow: hidden;
        border-radius: 0;
        border: 0;
        background: var(--panel-muted);
      }
      .story-code-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border);
        background: color-mix(in srgb, var(--panel) 70%, var(--panel-muted));
      }
      .story-code-meta {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .story-code-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .story-code-path {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        color: var(--muted);
      }
      .copy-button {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid var(--border);
        background: var(--panel);
        color: var(--text);
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .copy-button svg {
        display: block;
        width: 15px;
        height: 15px;
        stroke: currentColor;
        stroke-width: 1.5;
      }
      .copy-button-text {
        white-space: nowrap;
      }
      .copy-button[data-copied="true"] {
        color: var(--accent);
        border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
        background: var(--accent-soft);
      }
      .story-code-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .toggle-button,
      .copy-button {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid var(--border);
        background: var(--panel);
        color: var(--text);
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .story-code-scroll {
        overflow: auto;
        max-height: 360px;
        transition: max-height 180ms ease;
      }
      .story-code-scroll[data-expanded="true"] {
        max-height: none;
      }
      .story-code {
        margin: 0;
        font-size: 13px;
        line-height: 1.7;
      }
      .story-code pre {
        margin: 0;
        padding: 16px;
        overflow: auto;
        background: transparent !important;
      }
      .story-code code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .code-empty {
        padding: 16px;
        color: var(--muted);
      }
      .sidebar {
        position: sticky;
        top: 16px;
        align-self: start;
        padding: 18px;
        border: 1px solid var(--border);
        border-radius: 20px;
        background: var(--panel);
        box-shadow: var(--shadow);
      }
      .sidebar h2 { margin: 0 0 4px; font-size: 14px; }
      .sidebar p {
        margin: 0 0 12px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }
      .nav { display: flex; flex-direction: column; gap: 8px; }
      .nav-link {
        display: block;
        border-radius: 12px;
        padding: 10px 12px;
        color: var(--muted);
        text-decoration: none;
        background: transparent;
        transition: background 120ms ease, color 120ms ease;
        font-size: 13px;
        font-weight: 600;
      }
      .nav-link:hover,
      .nav-link.is-active {
        background: var(--accent-soft);
        color: var(--accent);
      }
      @media (max-width: 1024px) {
        .page {
          grid-template-columns: 1fr;
          width: min(100%, calc(100vw - 24px));
          padding-top: 16px;
        }
        .sidebar { position: static; order: -1; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <main class="main">
        <header class="hero">
          <p class="hero-kicker">Multi-story preview</p>
          <h1>${escapeHtml(input.title)}</h1>
          <p class="hero-meta">${escapeHtml(
            input.project
              ? `${input.owner} / ${input.project} / ${input.name} · v${input.version}`
              : `${input.owner} / ${input.name} · v${input.version}`,
          )}</p>
          ${
            input.description?.trim()
              ? `<p class="hero-description">${escapeHtml(input.description.trim())}</p>`
              : ""
          }
        </header>
        ${sections}
      </main>
      <aside class="sidebar">
        <h2>Stories</h2>
        <p>Browse every story in one page. The right nav tracks whichever section is currently in view.</p>
        <nav class="nav">${navLinks}</nav>
      </aside>
    </div>
    <script>
      (function () {
        var COZY_PREVIEW_SET_THEME_PATCH = ${JSON.stringify(PREVIEW_MSG_SET_THEME_PATCH)};
        var params = new URLSearchParams(window.location.search);
        var theme = params.get("theme");
        var story = params.get("story");
        var currentThemePatch = {};

        function withTheme(href) {
          if (!theme) return href;
          var url = new URL(href, window.location.origin);
          url.searchParams.set("theme", theme);
          return url.pathname + url.search + url.hash;
        }

        function normalizeThemePatch(input) {
          if (!input || typeof input !== "object" || Array.isArray(input)) return {};
          var next = {};
          Object.entries(input).forEach(function (entry) {
            var rawKey = entry[0];
            var rawValue = entry[1];
            if (typeof rawValue !== "string") return;
            var key = String(rawKey || "").trim();
            var value = rawValue.trim();
            if (!key || !value) return;
            next[key.indexOf("--") === 0 ? key : "--" + key] = value;
          });
          return next;
        }

        function applyThemePatchToDocument(patch) {
          var root = document.documentElement;
          var currentKeys = Object.keys(currentThemePatch);
          var nextKeys = Object.keys(patch);
          currentKeys.forEach(function (key) {
            if (nextKeys.indexOf(key) === -1) {
              root.style.removeProperty(key);
            }
          });
          nextKeys.forEach(function (key) {
            root.style.setProperty(key, patch[key]);
          });
          currentThemePatch = patch;
        }

        function postThemePatchToFrame(iframe) {
          if (!iframe || !iframe.contentWindow) return;
          try {
            iframe.contentWindow.postMessage(
              { type: COZY_PREVIEW_SET_THEME_PATCH, patch: currentThemePatch },
              window.location.origin,
            );
          } catch {
            // ignore
          }
        }

        document.querySelectorAll("[data-preview-iframe]").forEach(function (iframe) {
          var baseSrc = iframe.getAttribute("data-base-src");
          if (!baseSrc) return;
          iframe.setAttribute("src", withTheme(baseSrc));
          iframe.addEventListener("load", function () {
            postThemePatchToFrame(iframe);
          });
        });

        document.querySelectorAll("[data-base-href]").forEach(function (link) {
          var baseHref = link.getAttribute("data-base-href");
          if (!baseHref) return;
          link.setAttribute("href", withTheme(baseHref));
        });

        document.querySelectorAll("[data-copy-button]").forEach(function (button) {
          var initialHtml = button.innerHTML;
          button.addEventListener("click", async function () {
            var encoded = button.getAttribute("data-copy-b64") || "";
            if (!encoded) return;
            try {
              var binary = window.atob(encoded);
              var bytes = new Uint8Array(binary.length);
              for (var i = 0; i < binary.length; i += 1) {
                bytes[i] = binary.charCodeAt(i);
              }
              var raw = new TextDecoder().decode(bytes);
              await navigator.clipboard.writeText(raw);
              button.textContent = "Copied";
              button.setAttribute("data-copied", "true");
              window.setTimeout(function () {
                button.innerHTML = initialHtml;
                button.removeAttribute("data-copied");
              }, 1500);
            } catch (_error) {
              button.textContent = "Failed";
              window.setTimeout(function () {
                button.innerHTML = initialHtml;
              }, 1500);
            }
          });
        });

        document.querySelectorAll("[data-toggle-button]").forEach(function (button) {
          button.addEventListener("click", function () {
            var storyId = button.getAttribute("data-toggle-button");
            if (!storyId) return;
            var target = document.querySelector('[data-code-scroll="' + storyId + '"]');
            if (!target) return;
            var expanded = target.getAttribute("data-expanded") === "true";
            target.setAttribute("data-expanded", expanded ? "false" : "true");
            button.setAttribute("aria-expanded", expanded ? "false" : "true");
            button.textContent = expanded
              ? button.getAttribute("data-collapsed-label") || "Expand"
              : button.getAttribute("data-expanded-label") || "Collapse";
          });
        });

        var navLinks = new Map();
        document.querySelectorAll("[data-story-link]").forEach(function (link) {
          var storyId = link.getAttribute("data-story-link");
          if (storyId) navLinks.set(storyId, link);
          var targetStory = storyId;
          link.addEventListener("click", function (event) {
            if (!targetStory) return;
            event.preventDefault();
            var target = document.getElementById("story-" + targetStory);
            if (!target) return;
            target.scrollIntoView({ block: "start" });
            markActive(targetStory);
          });
        });

        function markActive(storyId) {
          navLinks.forEach(function (link, id) {
            link.classList.toggle("is-active", id === storyId);
          });
          var url = new URL(window.location.href);
          if (storyId) {
            url.searchParams.set("story", storyId);
          } else {
            url.searchParams.delete("story");
          }
          history.replaceState(
            null,
            "",
            url.pathname + url.search + (storyId ? "#story-" + storyId : ""),
          );
        }

        window.addEventListener("message", function (event) {
          if (event.source !== window.parent) return;
          if (event.origin !== window.location.origin && event.origin !== "null") return;
          var data = event.data;
          if (!data || typeof data !== "object") return;
          if (data.type !== COZY_PREVIEW_SET_THEME_PATCH) return;
          var nextPatch = normalizeThemePatch(data.patch);
          applyThemePatchToDocument(nextPatch);
          document.querySelectorAll("[data-preview-iframe]").forEach(function (iframe) {
            postThemePatchToFrame(iframe);
          });
        });

        if (story) {
          var initialTarget = document.getElementById("story-" + story);
          if (initialTarget) {
            requestAnimationFrame(function () {
              initialTarget.scrollIntoView({ block: "start" });
              markActive(story);
            });
          }
        }

        if (!("IntersectionObserver" in window)) return;
        var sections = Array.prototype.slice.call(
          document.querySelectorAll("[data-story-section]"),
        );
        var observer = new IntersectionObserver(
          function (entries) {
            var visible = entries
              .filter(function (entry) { return entry.isIntersecting; })
              .sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; })[0];
            if (!visible) return;
            var storyId = visible.target.getAttribute("data-story-section");
            if (storyId) markActive(storyId);
          },
          {
            rootMargin: "-20% 0px -55% 0px",
            threshold: [0.15, 0.35, 0.6],
          },
        );
        sections.forEach(function (section) { observer.observe(section); });
      })();
    </script>
  </body>
</html>`;
}
