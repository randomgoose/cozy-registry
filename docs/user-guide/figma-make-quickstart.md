Status: draft
Owner: shared
Last updated: 2026-03-18
Source of truth: no

# Cozy Registry Figma Make Quickstart

这份文档给第一次使用 Cozy Registry 的用户。

目标很简单：

1. 在 Figma Make 里连接 Cozy Registry
2. 发布一个 block 或 component
3. 让 AI 生成安装计划
4. 在有本地项目上下文时执行安装或升级

## 你可以用 Cozy Registry 做什么

Cozy Registry 是一个面向 Web 开发的 registry。

你可以把它理解成：

- 设计师和 AI 共同产出的前端资产仓库
- 支持 `block`、`component`、`theme`
- 既能发布，也能为安装和升级提供结构化计划

当前最推荐的资产类型是：

- `registry:block`

例如：

- Hero section
- CTA section
- Pricing section
- 带动画或 WebGL 效果的区块

## 前提条件

- 你有一个可访问的 Cozy Registry 部署地址
- 你在使用 Figma Make 的付费版本
- 如果要直接执行安装，MCP 运行环境必须能访问真实项目目录

## 第一步：连接 Cozy Registry 到 Figma Make

### 推荐方式：OAuth

在 Figma Make 中：

1. 打开 **Add context**
2. 进入 **Connectors**
3. 新建一个自定义 MCP 连接器
4. 将 MCP server URL 设置为：

```text
https://<your-registry-domain>/api/mcp
```

5. 认证方式选择 **OAuth 2.0**
6. Client ID 填：

```text
cozy-figma-make
```

7. 点击 **Connect**

连接成功后，Figma Make 就可以调用 Cozy Registry 的 MCP tools。

## 第二步：发布组件或区块

你可以通过两种方式发布：

### 方式 A：在 Web 页面发布

适合：

- 手上已经有 TSX
- 想快速把一个 block 发到 registry

### 方式 B：在 Figma Make / AI 工作流里发布

适合：

- 你已经在 Vibe coding 流程里产出组件
- 想直接发布并继续迭代

### 发布到团队（Team scope）

MCP 的 `publish_component` 在团队场景下**必须**同时提供：

- `publishScope: "team"`
- `teamId`：目标团队的 id（在 app 里切换到该 team 后，可从会话/网络请求或团队设置上下文获得；不要用浏览器里的「当前 team」代替显式参数，以免 MCP 与网页会话不一致）。

列出团队条目时使用 `list_components`，并传入同一个 `teamId`。获取或安装时使用：

- `owner` = `{organizationSlug}/{teamSlug}`，其中 `teamSlug` 与团队名称的 slug 规则一致（小写、非字母数字转为 `-`，与 Workspace 里团队名对应）。
- `name` = 组件 kebab-case 名称。

锁文件与 install 协议中的坐标为 **`@orgSlug/teamSlug/itemName`**（三段式），bundle 源为 `/api/r/{orgSlug}/{teamSegment}/{name}`。

## 第三步：在 Figma Make 中安装

当前推荐流程不是“直接让 AI 写项目文件”，而是：

1. 先获取 bundle
2. 再生成安装计划
3. 如果有真实项目目录，再执行安装

### 推荐工具顺序

#### 只读和规划

- `get_component_bundle`
- `plan_component_install`
- `get_project_registry_status`
- `plan_component_upgrade`

#### 真正执行写入

- `install_component_bundle`
- `upgrade_component_in_project`

## 推荐安装流程

### 场景 1：你在 Figma Make 里，还不确定它能不能写本地项目

让 AI 按这个顺序做：

1. `get_component_bundle`
2. `plan_component_install`

这样你会拿到：

- 目标版本
- 默认安装路径
- 将要写入的文件
- `cozy-registry.lock.json` 条目

这一步不会直接写文件系统，但能确认安装协议。

### 场景 2：你已经有真实项目目录上下文

再继续：

1. `get_project_registry_status`
2. `install_component_bundle`

成功后，你应该能看到：

- 组件文件已写入项目
- `cozy-registry.lock.json` 已创建或更新

## 推荐升级流程

升级建议也走“先规划、再执行”：

1. `get_project_registry_status`
2. `plan_component_upgrade`
3. 如果确认要执行，再调用 `upgrade_component_in_project`

这样可以先知道：

- 当前安装版本
- 目标版本
- lockfile 会不会更新
- 下一版 lockfile 条目长什么样

## 一个重要限制

Figma Make 这类远程环境，并不总能拿到真实可写的项目目录。

这意味着：

- `plan_*` 工具通常更稳定
- `install_*` / `upgrade_*` 工具只适合在 MCP 能访问本地项目时使用

如果 AI 把 `projectRoot` 传成 `/`，说明它并没有拿到真实工作区路径。

这不是组件有问题，而是执行环境不具备本地写文件条件。

## 给 Figma Make 的推荐提示词

你可以直接把下面这段发给 Figma Make：

```text
Use Cozy Registry to install or upgrade components in a safe way.

Rules:
1. Prefer get_component_bundle for source retrieval.
2. Use plan_component_install before install.
3. Use get_project_registry_status before plan_component_upgrade.
4. Use plan_component_upgrade before upgrade_component_in_project.
5. Do not call install_component_bundle or upgrade_component_in_project unless a real writable project root is available.
6. Never use "/" as projectRoot.
7. Summarize the result with coordinate, version, targetDir, installedFiles, and lockfile change.
```

## 你应该优先记住什么

- 发布已经是可用的
- Figma Make 中最稳定的是 `bundle + plan`
- 真正的本地安装依赖可写项目目录
- `cozy-registry.lock.json` 是安装状态的 source of truth

## 相关文档

- [README](/Users/chenchen/Documents/GitHub/my-app/README.md)
- [Figma Make MCP 连接说明](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/figma-make-mcp.md)
- [Install Protocol](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/install-protocol.md)
