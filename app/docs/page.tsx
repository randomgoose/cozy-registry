import Link from "next/link";
import { PromptCard } from "./PromptCard";

const tools = [
  {
    name: "Figma Make",
    description:
      "适合在远程 AI 环境中做发布、获取 bundle、生成安装计划和升级计划。",
    steps: [
      "创建自定义 MCP Connector，地址填 /api/mcp",
      "认证方式优先选 OAuth 2.0",
      "优先使用 get_component_bundle 和 plan_component_install",
      "只有在拿到真实可写 projectRoot 时，再执行 install_component_bundle",
    ],
  },
  {
    name: "Cursor",
    description:
      "适合在本地项目上下文中读取 registry、生成安装计划，并真正写入 lockfile 和源码文件。",
    steps: [
      "连接 Cozy Registry MCP",
      "先读取 bundle 或项目状态",
      "先 plan，再 install 或 upgrade",
      "让 Cursor 在本地项目里写入 cozy-registry.lock.json",
    ],
  },
  {
    name: "Other AI Tools",
    description:
      "只要支持 MCP，都可以把 Cozy Registry 当作 Web 资产的发现、规划和安装协议来源。",
    steps: [
      "先验证工具是否支持远程 MCP",
      "先走 list/get/plan，不要默认直接写文件",
      "把 plan_* 结果交给本地执行环境落地",
    ],
  },
];

const features = [
  {
    title: "发现组件",
    tool: "list_components / get_component_bundle",
    prompt:
      "List the available Cozy Registry blocks for landing pages, then fetch the full bundle for the most suitable one.",
  },
  {
    title: "规划安装",
    tool: "plan_component_install",
    prompt:
      "Use Cozy Registry to plan installing @owner/component-name. Return the targetDir, installedFiles, and lockfile entry. Do not write files yet.",
  },
  {
    title: "检查项目状态",
    tool: "get_project_registry_status",
    prompt:
      "Check whether this project already has Cozy Registry items installed and summarize the current lockfile state.",
  },
  {
    title: "规划升级",
    tool: "plan_component_upgrade",
    prompt:
      "Read the current Cozy Registry project status and plan upgrading @owner/component-name. Show the current version, target version, and next lockfile entry.",
  },
];

const prompts = {
  figma: `Use Cozy Registry to install or upgrade components safely.

Rules:
1. Prefer get_component_bundle for source retrieval.
2. Use plan_component_install before install.
3. Use get_project_registry_status before plan_component_upgrade.
4. Use plan_component_upgrade before upgrade_component_in_project.
5. Do not call install_component_bundle or upgrade_component_in_project unless a real writable project root is available.
6. Never use "/" as projectRoot.
7. Summarize the result with coordinate, version, targetDir, installedFiles, and lockfile change.`,
  cursor: `Use Cozy Registry as the source of truth for this component workflow.

Workflow:
1. Read the bundle with get_component_bundle.
2. If this is a new install, run plan_component_install first.
3. If this project already has Cozy Registry items, run get_project_registry_status first.
4. Before any upgrade, run plan_component_upgrade.
5. Only after the plan is clear, execute install_component_bundle or upgrade_component_in_project.
6. Keep cozy-registry.lock.json updated.`,
  generic: `Connect to Cozy Registry via MCP.

Prefer this order:
1. list_components
2. get_component_bundle
3. plan_component_install or plan_component_upgrade
4. Only execute install/upgrade when the environment has a real writable project root.`,
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Cozy Registry Docs
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              连接 MCP，发布 Web 资产，并让 AI 按协议安装和升级。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              返回首页
            </Link>
            <Link
              href="/publish"
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              发布组件
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                On This Page
              </div>
              <nav className="mt-4 space-y-2 text-sm">
                <a href="#overview" className="block text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                  概览
                </a>
                <a href="#tools" className="block text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                  支持哪些工具
                </a>
                <a href="#features" className="block text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                  常用功能
                </a>
                <a href="#prompts" className="block text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                  推荐 Prompt
                </a>
                <a href="#workflow" className="block text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                  推荐工作流
                </a>
              </nav>
            </div>
          </aside>

          <div>
        <section
          id="overview"
          className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              AI-native Web Registry
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              把 Figma Make、Cursor 和其他 AI 工具接到 Cozy Registry
            </h1>
            <p className="mt-4 text-base leading-7 text-zinc-600 dark:text-zinc-400">
              Cozy Registry 面向 Web 开发，支持设计师和 AI 一起发布、发现、规划安装和升级 blocks、components 与 themes。
              当前最推荐的工作流是先拿 bundle，再生成 plan，最后在有真实项目上下文时执行安装。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/api/mcp"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                MCP Endpoint
              </Link>
              <Link
                href="/settings"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                管理 Token / OAuth
              </Link>
              <a
                href="#workflow"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                查看推荐流程
              </a>
            </div>
          </div>
        </section>

        <section id="tools" className="mt-10">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            支持哪些工具
          </h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {tools.map((tool) => (
              <div
                key={tool.name}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {tool.name}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {tool.description}
                </p>
                <ul className="mt-4 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                  {tool.steps.map((step) => (
                    <li key={step}>- {step}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="mt-10">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            常用功能
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  {feature.tool}
                </div>
                <h3 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {feature.title}
                </h3>
                <pre className="mt-4 overflow-x-auto rounded-xl bg-zinc-950 p-4 text-xs leading-6 text-zinc-100">
                  <code>{feature.prompt}</code>
                </pre>
              </div>
            ))}
          </div>
        </section>

        <section id="prompts" className="mt-10">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            推荐 Prompt
          </h2>
          <div className="mt-4 grid gap-4">
            <PromptCard title="Figma Make" body={prompts.figma} />
            <PromptCard title="Cursor" body={prompts.cursor} />
            <PromptCard title="Generic MCP Client" body={prompts.generic} />
          </div>
        </section>

        <section
          id="workflow"
          className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/60 dark:bg-amber-950/20"
        >
          <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200">
            当前最推荐的工作流
          </h2>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-amber-900 dark:text-amber-100">
            <li>1. 用 `get_component_bundle` 读取完整 bundle</li>
            <li>2. 用 `plan_component_install` 或 `plan_component_upgrade` 生成计划</li>
            <li>3. 只有在 AI 拿到真实可写项目目录时，再执行 `install_component_bundle` 或 `upgrade_component_in_project`</li>
          </ol>
          <p className="mt-4 text-sm leading-6 text-amber-800 dark:text-amber-200">
            如果 AI 运行在远程环境里，通常先做 plan 会更稳定。`cozy-registry.lock.json` 是安装状态的 source of truth。
          </p>
        </section>
          </div>
        </div>
      </main>
    </div>
  );
}
