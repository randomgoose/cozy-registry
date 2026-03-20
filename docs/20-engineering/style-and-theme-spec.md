# 样式与主题规范 (Style & Theme Spec)

本文档定义 Cozy Registry 中样式的两种形态、数据约定与预览行为，是样式与主题相关实现的规范参考。

---

## 1. 目标与范围

**目标**

- 支持两种互补的样式使用方式：
  1. **组件级样式**：设计师创作的、与单个组件强绑定的样式（如多状态输入框），随组件一起打包与预览。
  2. **全局样式变量 / 主题**：跨组件复用的 design tokens（颜色、间距、圆角等），作为独立 registry 条目发布与引用。
- 与现有 [Component Preview Runtime](./component-preview-runtime.md) 和 [Resource Types](./resource-types.md) 兼容，并明确扩展点。

**范围**

- 组件 bundle 内样式的允许形式与构建行为。
- 主题 / tokens 的 registry 类型、存储结构与消费方式。
- Preview 场景下「先加载主题，再渲染组件」的约定与实现要点。
- 不覆盖：设计稿到代码的生成、Figma 同步等上游流程。

---

## 2. 两种策略总览

| 策略 | 适用场景 | 形态 | 版本与依赖 |
|------|----------|------|------------|
| **样式在 bundle 内** | 组件专属样式（多状态、动效、布局） | 组件源码中的 Tailwind / 同目录 CSS / inline 样式 | 随组件版本一起发布，无独立 theme 依赖时可单独预览 |
| **样式作为 registry 项** | 全局 design tokens、主题变量 | 独立 `registry:theme` 条目，内容为 CSS 变量或生成出的 CSS | 独立版本；组件通过 `registryDependencies` 声明依赖 |

二者可组合：组件 bundle 内写「仅本组件用」的样式，同时通过 `registryDependencies` 依赖某 theme，在预览与消费时先加载 theme 再渲染组件。

---

## 3. 组件级样式（打包在 bundle 内）

### 3.1 允许的样式形式

组件条目（`registry:block` / `registry:ui`）的 `files` 内，允许以下形式，且均视为「组件 bundle 的一部分」：

- **Tailwind 类名**：在 TSX 中使用 `className="..."`，依赖 Preview Runtime 已提供的 Tailwind CDN（当前实现已支持）。
- **同目录 CSS**：与组件同属同一 bundle 的 `.css` 文件（如 `input.css`、`Input.module.css`），在 TSX 中通过相对路径 `import "./input.css"` 等引用。
- **内联样式**：TSX 中的 `style={{ ... }}`，无需额外约定。
- **CSS-in-JS（可选）**：若未来在 build 时能解析并内联或提取，可在后续版本纳入；v1 不强制要求。

规则：

- 所有被组件入口（或间接）`import` 的样式文件，必须出现在该条目的 `files` 中，路径与 import 路径一致（与现有「本地 import 必须落在 bundle.files」规则一致）。
- 不允许组件 bundle 内的代码依赖「仅存在于 registry 其他条目」的样式文件（例如不可 `import "@owner/theme-default"` 的未打包内容）；对全局变量的依赖见 4.2、5.2。

### 3.2 构建行为（Preview）

- **Tailwind**：不进入 esbuild bundle，由 Preview Runtime HTML 统一提供 Tailwind CDN；组件只需使用类名即可。
- **.css 文件**：
  - 若 esbuild 配置支持 CSS（如 `loader: 'css'` 且不 external），可打包为 JS 内的字符串或通过注入运行时插入 `<style>`（具体由实现选择）。
  - 若采用「单独产出 CSS」：build 可输出 `preview.js` + `preview.css`；Preview Runtime 需在加载 `preview.js` 之前注入 `preview.css`（见 5.2）。
- 构建失败（如缺少被 import 的 CSS 文件）时，与现有规范一致：不写入预览产物，返回结构化错误（message, file, line, column）。

### 3.3 小结

- 组件级、仅本组件使用的样式：**一律放在组件 bundle 内**，不单独建 registry 条目。
- 多状态、动效、布局等与实现强绑定的样式，均采用上述形式之一即可。

---

## 4. 主题 / Tokens 作为独立 Registry 项

### 4.1 类型与语义

- **Registry 类型**：`registry:theme`。
- **语义**：一条 theme 条目表示「一套可复用的全局样式变量（design tokens）或少量全局规则」，供多个组件或整站使用。例如 `theme-default`、`theme-dark`、`tokens-mobile`。

与 [resource-types.md](./resource-types.md) 中「按主题管理、单条目单文件（或少数文件）」的建议一致；不按「单个 token」拆条目。

### 4.2 数据与文件结构

- **存储**：沿用 `registry_items` + `registry_files`，`type = "registry:theme"`。
- **文件约定**：
  - 至少包含一个「可被直接注入页面」的样式文件，推荐主文件名为 `theme.css` 或 `tokens.css`（或通过 meta 指定入口路径）。
  - 内容为 **CSS 变量** 和/或少量全局规则，例如：

```css
/* theme.css */
:root {
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --radius-md: 0.5rem;
  --spacing-unit: 0.25rem;
}
```

  - 可选：同时提供 `tokens.json` 等机器可读格式，用于工具链或 Tailwind 插件；v1 不强制，Preview 以 CSS 为准。
- **多文件**：允许一个 theme 条目下多个文件（如 `theme.css` + `theme-dark.css`），通过 meta 或约定指定 Preview / 消费时使用的入口（例如 `meta.entryPath: "theme.css"`）。

### 4.3 版本与权限

- 与现有条目一致：主题条目有独立 `currentVersion`，版本不可变，更新即发布新版本。
- 可见性：`public` / `private`，与组件相同权限模型；私有主题仅 owner 或授权用户可拉取。

### 4.4 消费方式

- **项目侧**：通过 Registry API 或 MCP 拉取指定 theme 条目的文件内容，写入项目内 `globals.css` 或 Tailwind 配置或 Design Tokens 管线。
- **组件 / Block**：在 `registryDependencies` 中声明对主题的依赖，格式与现有约定一致，例如 `@owner/theme-default`（或带版本 `@owner/theme-default@1.0.0`，若实现支持）。
- **Preview**：见第 5 节；先解析并注入依赖的 theme CSS，再加载并执行组件 preview bundle。

---

## 5. Preview 运行时行为

### 5.1 加载顺序

当被预览的条目为组件或 Block 且声明了 `registryDependencies` 时：

1. **解析依赖**：从 `registryDependencies` 中识别类型为 `registry:theme` 的条目（按 owner/name，可选版本）。
2. **拉取 theme 内容**：按依赖顺序拉取每个 theme 条目的入口样式文件内容（见 4.2）。
3. **注入 CSS**：在 Preview Runtime 的 `<head>` 中，在 Tailwind 之后、在 `preview.js` 之前，按顺序注入上述 CSS（内联 `<style>` 或通过 link 引用服务端生成的 theme CSS URL）。
4. **加载组件 bundle**：保持现有逻辑，加载并执行 `preview.js`，渲染组件。

若组件无 `registryDependencies` 或其中无 theme，则跳过 2–3，仅加载 Tailwind + 组件 bundle（与当前行为一致）。

### 5.2 组件对 CSS 变量的使用

- 组件 bundle 内样式（Tailwind、本地 CSS、inline）中，**允许**使用 `var(--color-primary)` 等引用，这些变量由已注入的 theme CSS 提供。
- 不在组件 bundle 内定义「全局」`:root` 变量（避免覆盖 theme）；组件专属变量可使用更具体的选择器或 Shadow DOM（若未来支持）。

### 5.3 Theme 单独预览（可选）

若产品需要「仅预览某 theme 效果」：可提供单独路由或查询参数，仅注入该 theme 的 CSS + 简单占位内容（如一段使用 `var(--...)` 的示例 HTML），不加载组件 bundle。此为可选扩展，不要求 v1 实现。

---

## 6. 依赖声明与解析

### 6.1 registryDependencies 格式

- 现有字段：`registryDependencies: string[]`，每项为 `@owner/name` 或（若实现支持）`@owner/name@version`。
- 约定：若依赖项为 `registry:theme`，则 Preview 与消费工具应按「主题」处理（先拉取并注入 CSS）；若为 `registry:ui` / `registry:block`，按现有组件依赖逻辑处理（如 Copy 时一并拉取）。

### 6.2 解析顺序与重复

- 按数组顺序解析；若多个 theme 定义同一变量名，后注入的覆盖先注入的。
- 同一 theme 在依赖中出现多次时，建议只注入一次（按首次出现顺序）。

---

## 7. 实现检查清单（v1）

以下为最小可交付项，便于分步实现与验收。

- [x] **组件 bundle 内 CSS**  
  - 若组件 `files` 含 `.css` 且被 import：esbuild 能处理（打包或产出 CSS），且 Preview 能正确加载（或内联）这些样式。
- [x] **registry:theme 类型**  
  - 支持创建/发布 `type = "registry:theme"` 的条目，至少一个入口 CSS 文件，内容为 CSS 变量/规则。
- [x] **Preview 依赖 theme**  
  - 当组件/Block 的 `registryDependencies` 中包含 theme 条目时，Preview 在加载 `preview.js` 前按顺序注入对应 theme CSS。
- [x] **文档与 MCP**  
  - 在 RESOURCE_TYPES 或本 SPEC 中注明 theme 的发布与拉取方式；MCP/API 能按 owner/name（及可选版本）拉取 theme 文件内容。

可选后续：

- Theme 单独预览页。
- `tokens.json` 与 Tailwind 插件集成。
- 版本固定语法 `@owner/name@version` 的解析与缓存策略。

---

## 8. 与现有文档的关系

- **[component-preview-runtime.md](./component-preview-runtime.md)**：本 SPEC 扩展「Preview Runtime HTML」的职责（增加 theme CSS 注入顺序与条件），不改变 ComponentBundle、esbuild 入口与错误处理等已有约定。
- **[resource-types.md](./resource-types.md)**：本 SPEC 将「样式」拆成两类（组件内 bundle + 独立 theme 条目），并细化 theme 的存储、发布与消费，与其中「按主题发布、registry:theme」建议一致。

---

## 9. 修订记录

| 日期       | 说明     |
|------------|----------|
| 2025-03-17 | 初版：组件级样式 + registry:theme 约定与 Preview 行为 |
