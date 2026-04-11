Status: proposed
Owner: engineering
Last updated: 2026-04-10
Source of truth: no

# AI-Friendly Tool Contract And Skill Strategy

## 1. 背景

随着 Cozy Registry 越来越强调：

- MCP-first workflows
- AI-assisted publish / preview / install
- 多工具入口（Web、Figma Make、agent、future plugins）

系统不只是要“功能可用”，还要回答：

- AI 是否能一次走对
- 工具描述是否足够减少误判
- 哪些知识应该写在 MCP tool contract 里
- 哪些应由 skill / plugin 层提供

这份文档用于回答这些问题，并以真实 `publish_component` 过程中的曲折案例作为输入。

## 2. 问题陈述

在一次通过 AI + MCP 发布 `calendar` 组件到 `dashboard` project 的流程中，最终发布成功，但过程出现了多次绕路：

1. AI 先读取本地组件和依赖文件
2. 尝试直接发布到 `project = "dashboard"`
3. 返回错误：
   - `Project "dashboard" not found in the target owner scope.`
4. AI 再去查询 publish targets
5. 发现存在个人 scope 与 `@indeed-cozy` organization scope
6. 重新指定 organization scope 再发布
7. 又因 preview export 解析问题失败：
   - 系统未识别到预期的 `Calendar` export
8. AI 再调整 bundle entry / `previewExport`
9. 最终成功

这说明：

- 核心能力已经存在
- 但 agent-friendly contract 还不够强

## 3. 关键判断

### 3.1 问题不在“能力缺失”，而在“AI-visible contract 不够清晰”

当前系统已经支持：

- project-scoped publish
- multi-file bundle publish
- preview smoke
- `previewExport`
- organization publish target

但 AI 仍需自行推理过多步骤，因此容易：

- 先猜错 scope
- 误解 project 的语义
- 不知道 multi-file bundle 的理想 entry 约定
- 在错误消息不够明确时自己反复试错

### 3.2 AI-friendly 不等于“把所有逻辑都塞进 skill”

我们不应该把系统真相藏在 skill 或 prompt 里。

更合理的分层是：

- **MCP tool contract**
  - 系统正式真相
  - 稳定规则
  - 明确错误语义
- **skill / plugin**
  - 工作流编排
  - 多步调用顺序
  - 用户/AI 决策辅助

一句话：

- **truth belongs in tools**
- **workflow belongs in skills**

## 4. 这个案例暴露出的 4 个问题

### 4.1 `project` 解析仍不够 project-first

AI 传了 `project = "dashboard"`，但由于 owner scope 未明确，系统直接报：

- `Project "dashboard" not found in the target owner scope.`

这对 agent 来说仍偏底层。

更友好的 contract 应该是：

- 明确告诉 agent：
  - project slug 需要和 publish target scope 一起解析
  - 如果未指定 scope 且当前用户有多个 writable scopes，应提示下一步
- 如果该 project 在所有可写 scope 中唯一命中，可考虑自动解析

### 4.2 `publish_component` 描述还残留旧心智

当前描述仍类似：

- publish 后再“link 到 project”

但系统实际已经是 canonical project identity。

这会让 agent 继续把 `project` 理解为后置关系，而不是正式 publish scope 的一部分。

### 4.3 multi-file bundle 的“推荐入口”还不够明确

AI 虽然读到了全部依赖文件，但仍没有一次性构造出最适合 preview 的 bundle entry。

说明当前 contract 没有足够明确地告诉 agent：

- multi-file bundle 最好使用 `index.tsx` 作为 entry
- 若没有 default export，应显式设置 `previewExport`
- 若主组件不在 `index.tsx`，应通过 `index.tsx` re-export 目标组件

### 4.4 错误语义对 agent 来说仍然太“原始”

现在的错误对人类开发者已经可用，但对 agent 仍偏粗：

- `Project "dashboard" not found in the target owner scope`
- `No suitable component export found`

更理想的是返回结构化错误语义，例如：

- `PROJECT_SCOPE_NOT_RESOLVED`
- `PREVIEW_EXPORT_NOT_RESOLVED`

并附：

- 推荐修复动作
- 下一步调用建议

## 5. 我们应该把什么写进 MCP tool contract

以下内容应进入 tool description、tool schema、或稳定错误语义：

### 5.1 正式系统真相

例如：

- `project` 是 canonical project scope 的一部分
- publish 不是“先 publish 再 link”
- multi-file bundle 的正式支持方式
- hooks 是否允许
- theme layers 如何解析

### 5.2 不该让 AI 自己猜的硬规则

例如：

- 若有相对 import，必须使用 `files`
- browser-only render assumptions 会导致 preview smoke 失败
- `index.tsx` 是 multi-file bundle 的推荐 preview entry

### 5.3 稳定错误代码与修复提示

例如：

- `PROJECT_SCOPE_NOT_RESOLVED`
- `PROJECT_NOT_FOUND_IN_SCOPE`
- `PREVIEW_EXPORT_NOT_RESOLVED`
- `MULTI_FILE_BUNDLE_ENTRY_AMBIGUOUS`

## 6. 我们应该把什么放进 skill / plugin

以下内容更适合放进 skill、agent brief 或 plugin workflow 层：

### 6.1 多步工作流

例如：

1. `list_publish_targets`
2. `list_projects`
3. `diagnose_publish_readiness`
4. `publish_component`

### 6.2 决策辅助

例如：

- 如果用户没有明确 owner scope，先查 publish targets
- 如果是 multi-file bundle，先判断是否需要生成 `index.tsx`
- 如果 preview export 不明显，优先指定 `previewExport`

### 6.3 工具组合打包

这是你提到的很关键的一点：

未来很多工具里的“插件”，很可能本质上就是：

- MCP connector
- tool descriptions
- bundled workflow skills
- maybe a few opinionated wrappers

我认为这非常合理，而且很可能会成为常态。

也就是说，未来一个“Cozy plugin”更像：

- 连接器负责连到 Cozy MCP
- skill 负责教 AI 什么时候先 `list_projects`、什么时候先 `diagnose_publish_readiness`
- tool contract 负责保证系统真相稳定

## 7. 推荐分层

### Layer 1: MCP tools

负责：

- canonical system contract
- read/write primitives
- stable error semantics

### Layer 2: workflow skills

负责：

- publish workflow
- install workflow
- project-scoped workflow
- preview-debug workflow

### Layer 3: tool/plugin packaging

负责：

- 给特定工具提供默认接入体验
- 把 connector + skills + recommended prompts 打包

例如：

- Figma Make plugin
- v0 plugin
- general Codex / Claude Code plugin

## 8. 我对未来方向的判断

### 8.1 是的，后面应该用 skill / plugin 来辅助 AI 决策

但前提是：

- skill 不替代系统 contract
- skill 不承载唯一真相

skill 更像：

- “推荐工作流”
- “减少绕路的默认策略”

### 8.2 很多工具里的“插件”确实会变成 MCP + skill bundle

我认为这会越来越常见。

因为单有 MCP connector 只能“连上能力”，不能保证 agent 会顺畅地使用能力。

真正好用的插件，通常会同时包含：

- MCP connection
- workflow instructions
- tool sequencing hints
- a little domain-specific language / wrappers

### 8.3 Cozy 应该主动把自己设计成可被这种插件打包的系统

这意味着：

- tool contract 要稳定
- error 语义要稳定
- workflow skill 要清晰
- 不同入口工具都能复用同一套 publish / preview / install 逻辑

## 9. 针对 `publish_component` 的具体改进建议

### 9.1 文案修订

将 project 相关描述从：

- publish 后“link 到 project”

改成：

- publish into canonical project scope / identity

### 9.2 multi-file bundle guidance

在 tool description 中明确：

- 推荐使用 `index.tsx` 作为 entry
- 若无 default export，设置 `previewExport`
- 若主组件文件不是 `index.tsx`，由 `index.tsx` re-export

### 9.3 错误代码升级

建议增加：

- `PROJECT_SCOPE_NOT_RESOLVED`
- `PROJECT_NOT_FOUND_IN_SCOPE`
- `PREVIEW_EXPORT_NOT_RESOLVED`

### 9.4 可以考虑新增一个更薄的 workflow helper

例如：

- `prepare_publish_component`

由系统先做：

- scope resolution hints
- project resolution hints
- preview entry hints
- missing bundle file checks

然后再由 agent 调 `publish_component`

## 10. 外部全局样式与 `registry:theme`

### 10.1 典型问题

在真实项目里，组件常常会依赖：

- `globals.css`
- `App.css`
- 宿主项目中定义的 CSS variables
- Tailwind base / theme token 配置

但这些文件往往不是组件 bundle 内显式 import 的一部分，而是由宿主入口（如 `App.tsx`）引入。

这会导致：

- AI 在读取组件源码时看不到这些样式来源
- publish payload 不会自动带上这部分样式上下文
- 组件在 registry preview 中“结构正常、样式不完整”

### 10.2 推荐结论

不建议让 AI 默认偷偷把宿主 `globals.css` 一起带上。

更合理的方向是：

- 系统识别“组件依赖外部样式上下文”
- 然后引导用户或 AI 将这部分样式提升成 `registry:theme`

一句话：

- **不要自动偷带 host global CSS**
- **要自动识别缺失的 theme context**

### 10.3 哪些应进入 contract

tool / diagnostics 应能表达：

- 组件似乎依赖外部 CSS variables
- 当前 bundle 中未包含该样式上下文
- 建议动作是：
  - 发布 `registry:theme`
  - 或关联已有 theme resource

推荐补充的错误 / 诊断语义：

- `MISSING_THEME_CONTEXT`
- `GLOBAL_CSS_VARIABLES_NOT_CAPTURED`

### 10.4 哪些不应自动做

不建议默认：

- 自动把宿主 `globals.css` 拼进 bundle
- 自动把 host app 全局 CSS 当成正式 preview 依赖

因为这会把系统重新绑回宿主环境，并模糊：

- component-local style
- design-context style
- host global style

## 11. AI 是否应感知 project 上下文

### 11.1 为什么需要感知

在 project-first 模型下，AI 做 publish 决策时经常需要知道：

- 这个 project 是否已经有默认 theme layers
- 当前组件是否可以直接继承 project design context
- 是否存在足够的 theme context，因此不必重复传 theme

例如：

- 若 project 已经有能覆盖该组件的 theme layers
- 那 AI 不一定需要额外传 `themeResourceRefs`

### 11.2 为什么不能默认塞完整 project 状态

如果每次 publish 都自动把完整 project 状态注入给 AI，会带来：

- token 成本过高
- 无关上下文过多
- 过期 / 陈旧上下文风险

因此不建议：

- 将完整 project snapshot 作为每次 MCP 调用的默认上下文

### 11.3 推荐结论

project context 应该是：

- **按需查询**
- **结构化**
- **足够薄**

而不是：

- 默认隐式注入的大背景

### 11.4 推荐形态

建议后续增加一个只读 helper，例如：

- `get_project_context_for_publish`

它只返回 publish 决策真正需要的最小上下文，例如：

- `project`
- `resolvedThemeResourceRefs`
- `hasDesignContext`
- `recommendedThemeAction`
- `nameConflict`

这样 AI 可以：

- 在需要时主动查询
- 再决定 publish payload

而不是每次都背着整份 project 状态。

## 12. 建议的近期动作

1. 修订 `publish_component` tool description
2. 为 publish / preview 常见失败补结构化错误代码
3. 在 publish / diagnose diagnostics 中加入 theme-context 缺失提示
4. 为 project-first publish 设计一个薄的 project context helper
5. 为 publish workflow 写一份正式 skill
6. 将这份 skill 设计成未来插件可复用的基础能力

## 13. 一句话总结

要让 Cozy 真正 AI-friendly，不应把系统真相藏在 prompt 或 skill 里，而应采用：

- **MCP tool contract 负责真相**
- **skill / plugin 负责工作流**

这次 `calendar` 发布流程已经说明，能力本身够了，下一步最值得做的是把 contract 和 workflow 设计得更像“agent-first product”。
