Status: active
Owner: engineering
Last updated: 2026-03-26
Source of truth: yes

# 系统架构与数据流

本文用图表归纳 **Cozy Registry** 当前的架构与实现分层；文字版模块说明见 [System Overview](./system-overview.md)。

## 1. 系统定位

**Cozy Registry** 是基于 **Next.js** 的一体化应用：**Web** 负责浏览、发布、设置等；**Registry API** 输出 **shadcn 兼容**的条目 JSON；**MCP** 提供 AI 读写能力；**Preview Runtime** 在服务端用 **esbuild** 生成可在 iframe 中运行的预览产物。持久化使用 **PostgreSQL（Drizzle）**。资产形态为**源码 bundle**，而非向消费方分发 npm 编译产物。

## 2. 逻辑模块

```mermaid
flowchart LR
  subgraph clients [Clients]
    Browser[Browser / Web App]
    AI[AI Clients]
    CLI[CLI / Future IDE]
  end

  subgraph cozy [Cozy Monolith - Next.js]
    WebUI[Web UI]
    RegAPI[Registry API]
    MCP[MCP /api/mcp]
    Preview[Preview Runtime]
    AuthZ[Auth + API Key Policy]
  end

  subgraph data [Data and Jobs]
    PG[(PostgreSQL)]
    Thumb[Thumbnail Worker - optional]
  end

  Browser --> WebUI
  Browser --> RegAPI
  Browser --> Preview
  AI --> MCP
  AI --> RegAPI
  CLI -.-> RegAPI

  WebUI --> AuthZ
  RegAPI --> AuthZ
  MCP --> AuthZ

  WebUI --> PG
  RegAPI --> PG
  MCP --> PG
  Preview --> PG
  Thumb --> PG
```

## 3. 分层与依赖方向

```mermaid
flowchart TB
  subgraph app [app/ - Routes and UI]
    Pages[Pages and React]
    Routes[Route Handlers - REST]
    PrevRoute[preview/... dynamic routes]
  end

  subgraph lib [lib/ - Domain and Infra]
    Registry[registry.ts - CRUD and queries]
    Contract[registry-publish-contract.ts]
    Resolver[registry-resolver.ts + registry-graph]
    Install[install-protocol.ts]
    PreviewBuild[preview-build.ts]
    Validate[validate-tsx.ts]
    MCPImpl[mcp-tools.ts]
    DB[(db/schema + Drizzle)]
  end

  Pages --> Registry
  Routes --> Registry
  Routes --> Contract
  Routes --> Validate
  PrevRoute --> PreviewBuild
  PrevRoute --> Resolver
  MCPImpl --> Registry
  MCPImpl --> Contract
  Registry --> DB
  PreviewBuild --> Validate
```

要点：业务规则尽量集中在 `lib/`（`registry*`、`normalizePublishContract`、resolver、install 协议）；`lib/extraction/` 为组件抽取阶段类型骨架（与发布分层）；`app/` 主要负责 HTTP/MCP 适配与 UI。

## 4. Registry 核心数据流

```mermaid
flowchart LR
  subgraph publish [1 Publish]
    PIn[content / files + deps + optional provenance]
    PVal[validate bundle / TSX / theme]
    PNorm[normalizePublishContract]
    PWrite[createRegistryItem / addVersion]
    PDB[(registry_items + versions + files)]
    PIn --> PVal --> PNorm --> PWrite --> PDB
  end

  subgraph browse [2 Browse and shadcn consumption]
    PDB --> Read[get item / list]
    Read --> ApiR["/api/r/... shadcn JSON"]
    Read --> ApiReg["/api/registry/..."]
  end

  subgraph preview [3 Preview]
    PDB --> PrevLoad[load files + meta]
    PrevLoad --> Res[resolveRegistryDependencies + theme CSS]
    Res --> Esbuild[esbuild bundle]
    Esbuild --> Iframe[iframe HTML + JS]
  end

  subgraph ai [4 AI]
    MCP[publish_component / get_component / ...]
    MCP --> PNorm
    MCP --> PWrite
  end
```

## 5. 依赖模型（概念与实现落点）

```mermaid
flowchart TB
  subgraph item [Registry Item - concept]
    Files[files: relative-path source tree]
    NpmDeps[dependencies: bare npm imports]
    RegDeps[registryDependencies: @owner/name@ver?]
  end

  subgraph merge [Write path - normalizePublishContract]
    Explicit[explicit registryDependencies]
    Stub[stub scan inference]
    Prov[provenance-derived - collaboration flows]
    Explicit --> Merged[deduped array to persist]
    Stub --> Merged
    Prov --> Merged
  end

  subgraph resolve [Read path - preview / install]
    Graph[registry-graph / resolver]
    Graph --> Order[transitive closure + order + cycle detection]
  end

  RegDeps --> Explicit
  Files --> Stub
```

## 6. 项目侧安装协议（与服务端 Registry 并列）

```mermaid
flowchart LR
  subgraph server [Cozy Server]
    Item[Registry Item JSON]
  end

  subgraph project [Consumer Project]
    Lock[cozy-registry.lock.json - SoT]
    Src[installed source files]
    Headers[file-level markers]
  end

  Item -->|install-protocol| Lock
  Item --> Src
  Lock --- Src
```

Registry 条目格式保持 shadcn 兼容；项目内安装状态由 Cozy 自定义的 lockfile 约束。详见 [Install Protocol](../20-engineering/install-protocol.md)。

## 7. 横切能力

| 能力 | 作用 |
|------|------|
| Auth（会话、OAuth、API Key） | 写操作与私有资源访问 |
| Policy / scope | API Key 与 MCP 的集合、owner 等范围 |
| Collections | 用户侧分组 |
| Thumbnail jobs | 异步生成列表缩略图 |

## 8. 设计要点归纳

- **单应用、多入口**：人（Web）、工具（`/api/r`）、AI（MCP）共用同一套 domain 与数据库。
- **源码为中心**：校验与预览围绕多文件 bundle 与两类依赖（npm / registry）展开。
- **发布契约集中**：`normalizePublishContract` 统一创建与发版时 `registryDependencies`、provenance、stub 的语义。
- **消费侧双协议**：对外 shadcn JSON；对内项目 [Install Protocol](../20-engineering/install-protocol.md) 与 lockfile。

## Related

- [System Overview](./system-overview.md)
- [Registry Dependency Management Spec](../20-engineering/registry-dependency-management-spec.md)
- [Install Protocol](../20-engineering/install-protocol.md)
- [Registry Resource Lifecycle Spec](../20-engineering/registry-resource-lifecycle-spec.md)
