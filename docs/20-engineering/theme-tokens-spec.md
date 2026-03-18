# Theme Tokens Spec (W3C / Figma / CSS Strategy)

本文档在 `style-and-theme-spec.md` 的基础上，进一步细化 **`registry:theme` 的数据模型**，明确「tokens 为真相（canonical）」「CSS 为派生物」，并约定多种 CSS 输出策略（如 `:root` / `.dark` / `[data-theme]`）。

---

## 1. 设计目标

- **统一「主题的真相」**：无论来源是 Figma Variables、W3C Design Tokens 还是手写 CSS，最终都尽量归一到标准化的 tokens 结构。
- **CSS 是可变的视图**：针对不同消费端（class dark mode / data-theme / root-only），允许从同一份 tokens 生成多种 CSS 实现。
- **对现有数据完全兼容**：已有仅包含 `theme.css` 的主题保持可用，不强制要求马上迁移。

---

## 2. 存储模型

Theme 条目仍然是 `registry_items (type = "registry:theme") + registry_files`，但在语义上区分：

- **Canonical（推荐）**：`tokens.json`
- **Derived**：`theme.css` / `theme.dark.css` / 其它 CSS 文件

### 2.1 `tokens.json`（推荐的单一事实来源）

- 文件名：`tokens.json`（约定优于配置；未来如有需要可通过 `meta.tokensPath` 覆盖）
- 结构：尽量兼容 [W3C Design Tokens](https://design-tokens.github.io/community-group/format/)：

```json
{
  "color": {
    "primary": {
      "value": "#2563eb",
      "type": "color"
    }
  }
}
```

- 允许直接保存 **Figma Variables** 导出的 JSON：
  - 包含 `variables`、`modes` 等字段；
  - 运行时/工具层可以做一次归一化（补齐 `type`、从 `valuesByMode` 提取默认 mode 值等）。

> 约定：若同时存在 `tokens.json` 与 CSS 文件，则 **tokens 是真相**，CSS 为派生；仅有 CSS 时视为 legacy 主题。

### 2.2 CSS 文件（派生视图）

- 至少包含一个可直接注入页面的 CSS 文件，推荐：
  - `theme.css`：主入口
  - 通过 `meta.entryPath: "theme.css"` 显式指定入口
- 内容以 **CSS 变量** 为主，例如：

```css
/* theme.css */
:root {
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --radius-md: 0.5rem;
  --spacing-unit: 0.25rem;
}
```

- 可以存在多个 CSS 文件，表示不同策略 / 模式（如 `theme.dark.css` / `theme.light.css`）。

---

## 3. CSS 输出策略

为了适配不同项目的主题切换约定，从同一份 tokens 支持多种 CSS 视图。

### 3.1 策略枚举

在 theme 的 `meta` 中约定：

```ts
type CssStrategy = "root" | "data-theme" | "class-dark";

meta: {
  entryPath?: string;              // 如 "theme.css"
  cssStrategies?: CssStrategy[];   // 如 ["root", "data-theme"]
}
```

- **`root`**：

```css
:root {
  --color-primary: #2563eb;
}
```

- **`data-theme`**：

```css
[data-theme="dark"] {
  --color-primary: #0f172a;
}
```

- **`class-dark`**：

```css
.dark {
  --color-primary: #0f172a;
}
```

> 实现层（工具 / CLI / MCP）可以根据策略组合生成对应的 CSS 文件，并写入 `registry_files`。

### 3.2 多文件布局示例

```text
files:
  - theme.css          // 默认 :root 视图
  - theme.dark.css     // dark 模式扩展
  - tokens.json        // canonical tokens

meta:
  entryPath: "theme.css"
  cssStrategies: ["root", "data-theme"]
```

消费端可以根据自身需求选择：

- 只用 `theme.css`（简单场景）
- 或同时加载 `theme.css` + `theme.dark.css`，并在运行时设置 `data-theme="dark"`。

---

## 4. 创建与导入流程建议

### 4.1 Web 发布页

发布 `registry:theme` 时，建议支持三种输入：

1. **直接粘贴 CSS**（最兼容旧习惯）  
2. **粘贴/上传 W3C Design Tokens JSON**  
3. **粘贴/上传 Figma Variables JSON**  

推荐行为：

- 若用户提供 JSON：
  - 将 JSON 原样保存为 `tokens.json`；
  - 基于 tokens 生成默认的 `theme.css`（至少提供 `:root` 策略），并写入 files；
  - 可在 UI 上预览解析后的 Tokens 表格（name / cssVar / type / value）。
- 若用户仅提供 CSS：
  - 保存为 `theme.css`；
  - 可选：在工具中提供「尝试从 CSS 推断 tokens.json」的功能，但不强制。

### 4.2 MCP / Figma Make 流程

为保持简单，MCP 侧推荐：

- 主要接受 **CSS 形式的 `content` 或 `files["theme.css"]`**；
- 若上游工具已生成 tokens JSON：
  - 可在 MCP 调用中额外传一个 `tokensJson` 字段；
  - 由服务端在写入时：
    - 保存 `tokens.json`；
    - 基于该 JSON 生成 `theme.css`。

---

## 5. 向后兼容与迁移

- 现有仅有 `theme.css` 的条目保持可用，视为 **CSS-first 的 legacy 主题**。
- 新增主题/工具链应尽量：
  - 把 tokens 写入 `tokens.json`；
  - 把 CSS 视作 tokens 的自动导出。
- 渐进迁移路径：
  1. 优先在新主题上引入 `tokens.json`；
  2. 为旧主题提供「一键导出 tokens.json」的脚本或 UI；
  3. 逐步在文档中把 CSS-only 标记为 legacy 模式。

---

## 6. 与现有文档的关系

- `style-and-theme-spec.md`：定义了 theme 作为 `registry:theme` 的基本语义与 Preview 行为；本文档是其「tokens 细化补充」。
- `resource-types.md`：继续沿用其中对 theme 的粒度建议（按主题聚合，而非单 token 拆分）。
