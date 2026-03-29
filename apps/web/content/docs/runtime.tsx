import type { ReactNode } from "react";

export type DocsSlug =
  | "index"
  | "connecting-figma-make"
  | "connecting-cursor"
  | "install-and-upgrade"
  | "prompt-library";

export type DocsEntry = {
  slug: DocsSlug;
  title: string;
  description: string;
  content: ReactNode;
};

function CodeBlock(props: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-2xl bg-zinc-950 px-4 py-4 text-sm text-zinc-100">
      <code>{props.children}</code>
    </pre>
  );
}

const docsEntries: DocsEntry[] = [
  {
    slug: "index",
    title: "Cozy Registry Docs",
    description: "Connect Figma Make, Cursor, and other AI tools to Cozy Registry.",
    content: (
      <>
        <p>Cozy Registry is an AI-native registry for Web development.</p>
        <p>It helps designers and AI tools:</p>
        <ul>
          <li>publish <code>block</code>, <code>component</code>, and <code>theme</code> assets</li>
          <li>retrieve source bundles through MCP</li>
          <li>generate install and upgrade plans</li>
          <li>keep project install state in <code>cozy-registry.lock.json</code></li>
        </ul>
        <h2>Start Here</h2>
        <ul>
          <li><a href="/docs/connecting-figma-make">Connect Figma Make</a></li>
          <li><a href="/docs/connecting-cursor">Connect Cursor</a></li>
          <li><a href="/docs/install-and-upgrade">Install and Upgrade</a></li>
          <li><a href="/docs/prompt-library">Prompt Library</a></li>
        </ul>
        <h2>Recommended Workflow</h2>
        <ol>
          <li>Use <code>get_component_bundle</code></li>
          <li>Use <code>plan_component_install</code> or <code>plan_component_upgrade</code></li>
          <li>Only execute install or upgrade when a real writable project root is available</li>
        </ol>
        <h2>Core MCP Tools</h2>
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-zinc-100/80 dark:bg-zinc-900/80">
              <tr>
                <th className="px-4 py-3 text-left">Tool</th>
                <th className="px-4 py-3 text-left">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["list_components", "Discover available registry items"],
                ["get_component_bundle", "Fetch the complete source bundle for a block or component"],
                ["plan_component_install", "Generate install paths and a lockfile entry without writing files"],
                ["get_project_registry_status", "Read current install state from a local project"],
                ["plan_component_upgrade", "Generate an upgrade plan before writing files"],
                ["install_component_bundle", "Write files and update cozy-registry.lock.json in a local project"],
                ["upgrade_component_in_project", "Upgrade an installed item in a local project"],
              ].map(([tool, purpose]) => (
                <tr key={tool} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-4 py-3 font-mono">{tool}</td>
                  <td className="px-4 py-3">{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    slug: "install-and-upgrade",
    title: "Install and Upgrade",
    description: "Recommended install and upgrade workflow for Cozy Registry items.",
    content: (
      <>
        <p>Cozy Registry supports two layers of workflow:</p>
        <ul>
          <li><strong>planning</strong></li>
          <li><strong>execution</strong></li>
        </ul>
        <h2>Install</h2>
        <h3>Plan First</h3>
        <ul>
          <li><code>get_component_bundle</code></li>
          <li><code>plan_component_install</code></li>
        </ul>
        <p>This gives you target version, target directory, installed file list, and a lockfile entry.</p>
        <h3>Execute When Filesystem Access Exists</h3>
        <ul>
          <li><code>install_component_bundle</code></li>
        </ul>
        <h2>Upgrade</h2>
        <h3>Read Current Project State</h3>
        <p><code>get_project_registry_status</code></p>
        <h3>Plan the Upgrade</h3>
        <p><code>plan_component_upgrade</code></p>
        <h3>Execute the Upgrade</h3>
        <p><code>upgrade_component_in_project</code></p>
        <h2>Source of Truth</h2>
        <CodeBlock>{`cozy-registry.lock.json`}</CodeBlock>
        <p>If an AI can read or write files but does not update this lockfile, the install workflow is incomplete.</p>
      </>
    ),
  },
  {
    slug: "connecting-cursor",
    title: "Connect Cursor",
    description: "Use Cozy Registry MCP inside Cursor with local project context.",
    content: (
      <>
        <p>Cursor is a strong fit for Cozy Registry because it usually has access to your local project files.</p>
        <h2>One-click install</h2>
        <p>
          Cursor connects with <strong>Static OAuth</strong>. On the homepage, open <strong>Connect Cursor</strong> and use
          <strong> Open in Cursor</strong> or copy the install link.
        </p>
        <h2>Recommended Flow</h2>
        <ol>
          <li>Read the source bundle with <code>get_component_bundle</code></li>
          <li>Generate an install plan with <code>plan_component_install</code></li>
          <li>Read project state with <code>get_project_registry_status</code> when relevant</li>
          <li>Generate an upgrade plan with <code>plan_component_upgrade</code></li>
          <li>Execute <code>install_component_bundle</code> or <code>upgrade_component_in_project</code></li>
        </ol>
        <h2>Why Cursor Works Well</h2>
        <ul>
          <li>read the project directory</li>
          <li>write source files</li>
          <li>update <code>cozy-registry.lock.json</code></li>
          <li>detect local install state before upgrades</li>
        </ul>
      </>
    ),
  },
  {
    slug: "connecting-figma-make",
    title: "Connect Figma Make",
    description: "Set up Cozy Registry as a custom MCP connector in Figma Make.",
    content: (
      <>
        <p>Figma Make can connect to Cozy Registry through a custom MCP connector.</p>
        <h2>Requirements</h2>
        <ul>
          <li>A deployed Cozy Registry instance over HTTPS</li>
          <li>A paid Figma plan with Make access</li>
        </ul>
        <h2>Connector Setup</h2>
        <ol>
          <li>Open <strong>Add context</strong></li>
          <li>Open <strong>Connectors</strong></li>
          <li>Create a custom MCP connector</li>
          <li>Set the MCP server URL to:</li>
        </ol>
        <CodeBlock>{`https://<your-domain>/api/mcp`}</CodeBlock>
        <h2>Authentication</h2>
        <p>Recommended: OAuth 2.0 with client id <code>cozy-figma-make</code>.</p>
        <p>Alternative: custom request headers:</p>
        <CodeBlock>{`Authorization: Bearer <token>`}</CodeBlock>
        <h2>Recommended Tool Flow in Figma Make</h2>
        <ol>
          <li><code>get_component_bundle</code></li>
          <li><code>plan_component_install</code></li>
          <li><code>get_project_registry_status</code> when project state is available</li>
          <li><code>plan_component_upgrade</code> before upgrades</li>
        </ol>
        <h2>Important Limitation</h2>
        <p>
          If the AI passes <code>projectRoot: &quot;/&quot;</code>, the environment does not actually have access to the target project.
          Stay on the planning workflow and let a local tool execute the install later.
        </p>
      </>
    ),
  },
  {
    slug: "prompt-library",
    title: "Prompt Library",
    description: "Reusable prompts for Figma Make, Cursor, and generic MCP clients.",
    content: (
      <>
        <h2>Figma Make</h2>
        <CodeBlock>{`Use Cozy Registry to install or upgrade components safely.

Rules:
1. Prefer get_component_bundle for source retrieval.
2. Use plan_component_install before install.
3. Use get_project_registry_status before plan_component_upgrade.
4. Use plan_component_upgrade before upgrade_component_in_project.
5. Do not call install_component_bundle or upgrade_component_in_project unless a real writable project root is available.
6. Never use "/" as projectRoot.
7. Summarize the result with coordinate, version, targetDir, installedFiles, and lockfile change.`}</CodeBlock>
        <h2>Cursor</h2>
        <CodeBlock>{`Use Cozy Registry as the source of truth for this component workflow.

Workflow:
1. Read the bundle with get_component_bundle.
2. If this is a new install, run plan_component_install first.
3. If this project already has Cozy Registry items, run get_project_registry_status first.
4. Before any upgrade, run plan_component_upgrade.
5. Only after the plan is clear, execute install_component_bundle or upgrade_component_in_project.
6. Keep cozy-registry.lock.json updated.`}</CodeBlock>
        <h2>Generic MCP Client</h2>
        <CodeBlock>{`Connect to Cozy Registry via MCP.

Prefer this order:
1. list_components
2. get_component_bundle
3. plan_component_install or plan_component_upgrade
4. Only execute install/upgrade when the environment has a real writable project root.`}</CodeBlock>
      </>
    ),
  },
];

export const docsNav = docsEntries.map(({ slug, title }) => ({
  slug,
  title,
  href: slug === "index" ? "/docs" : `/docs/${slug}`,
}));

export function getDocsEntry(slug?: string | null) {
  const normalized = !slug || slug === "index" ? "index" : slug;
  return (
    docsEntries.find((entry) => entry.slug === normalized) ??
    null
  );
}
