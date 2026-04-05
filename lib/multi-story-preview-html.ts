import type { PreviewStory } from "@/lib/preview-stories";
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

export function buildMultiStoryPreviewHtml(input: {
  owner: string;
  name: string;
  title: string;
  description: string | null;
  project: string | null;
  version: string;
  stories: PreviewStory[];
}) {
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

  const sections = input.stories
    .map((story) => {
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
        </section>
      `;
    })
    .join("");

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
        padding: 20px;
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
        margin-bottom: 14px;
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
        border-radius: 18px;
        border: 1px solid var(--border);
        background: var(--panel-muted);
      }
      .story-frame-wrap iframe {
        display: block;
        width: 100%;
        height: 460px;
        border: 0;
        background: transparent;
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
        var params = new URLSearchParams(window.location.search);
        var theme = params.get("theme");
        var story = params.get("story");

        function withTheme(href) {
          if (!theme) return href;
          var url = new URL(href, window.location.origin);
          url.searchParams.set("theme", theme);
          return url.pathname + url.search + url.hash;
        }

        document.querySelectorAll("[data-preview-iframe]").forEach(function (iframe) {
          var baseSrc = iframe.getAttribute("data-base-src");
          if (!baseSrc) return;
          iframe.setAttribute("src", withTheme(baseSrc));
        });

        document.querySelectorAll("[data-base-href]").forEach(function (link) {
          var baseHref = link.getAttribute("data-base-href");
          if (!baseHref) return;
          link.setAttribute("href", withTheme(baseHref));
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
