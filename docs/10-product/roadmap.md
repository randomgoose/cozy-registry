Status: active
Owner: product
Last updated: 2026-03-30
Source of truth: yes

# Roadmap

## 战略方向

- 主定位：把 AI 生成的 UI 变成可安装、可治理、可被多种 AI 访问的真实代码资产
- 核心路径：推荐设计师从 Figma Make 开始，但终点必须是进入真实代码工程，而不是停留在 Figma 里
- 核心用户：具备 Vibe coding 能力和意愿的设计师，以及负责消费这些资产的 AI agent / 开发者
- 主切入：设计师高参与的 Web UI 资产，如 block bundles、themes、实验性 section
- 核心差异：不做封闭的生成工作台，而是做开放的 artifact layer，连接 Figma Make、MCP、agent 和真实 repo
- **AI 与上下文**：我们仍然希望资产附带 **可被 AI 调用的 kit / design context**（元数据、依赖、预览约定等），但 **消费端不必限于 Figma Make**——同一套 registry / MCP 接口可被 Cursor、Codex、Claude、Lovable、Supernova Portal 等不同工具与角色（产品、开发、设计等）使用。**前期对外叙事以「进真实 repo + 可治理 artifact」为主**，不必刻意展开「全工具谱系」以免分散焦点。
- 非目标：当前阶段不把自己定义成通用团队组件仓库；不与 Figma 在「谁更懂设计系统上下文」上正面竞争（我们提供的是 **跨工具的开放接口与安装治理**，而不是在 Make 里再造一个封闭的 kit 商店）

## 北极星

4 周内要让一个真实团队稳定跑通这条链路：

`Figma Make -> 发布为 registry artifact -> preview/validate -> 安装进 repo -> AI 可继续升级和修复`

成功标准：

- 坏组件不能轻易进入 registry
- 好组件可以稳定进入真实 repo
- AI 可以基于结构化上下文继续诊断、升级、修复

## 接下来 4 周

### Week 1：收敛定位，钉死主路径

目标：

- 统一产品边界：我们不是另一个 Make，而是进入真实代码库的开放层
- 统一核心对象命名：artifact / registry item / theme / dependency
- 收敛支持范围：先主打 React + TSX + Vite/Next 主路径
- 明确评估指标：publish 成功率、preview 可用率、install 成功率、AI 修复闭环成功率

本周交付：

- 对外定位统一到 “open, installable, governable code artifacts”（主叙事）
- 文案上 **不必刻意去掉**「AI kit / design context」等说法——能力上仍服务 AI 可调用的设计/代码上下文；与 Figma Make kits 的错位在于 **我们不限定只在 Make 内消费**，且终点是 **真实代码库 + MCP**。前期对外可不展开列举各类 AI 工具与角色
- 选定一个标准入口 demo：设计师从 Figma Make 产出组件，工程侧通过 registry 进入真实 repo

### Week 2：把发布门禁和安装落地做可靠

目标：

- 发布前拦住明显坏组件
- 安装、升级、diff、依赖治理足够稳定
- provenance / lockfile 能支撑后续升级与修复

本周交付：

- preview smoke validation 成为正式发布门禁
- 发布失败结果结构化：`VALIDATION_FAILED` / `PREVIEW_BUILD_FAILED` / `PREVIEW_RENDER_FAILED`
- install / upgrade / overwrite 语义继续收紧
- dependency graph、lockfile、provenance 成为 AI 可依赖的系统边界

### Week 3：把 AI / MCP / agent 接入做成优势

目标：

- AI 不只是“能发布”，还要“能读、能诊断、能修复、能升级”
- 产品内核不绑定单一 AI 工具（开放接入）；**前期对外可不强调**「Cursor / Codex / … 都能用」，避免主叙事发散

本周交付：

- MCP 能力清晰化：publish / install / diagnose / repair / upgrade
- 新增结构化诊断能力，让 agent 不必依赖长字符串报错
- 跑通一次“失败 -> 自动修复 -> 再次发布”的闭环
- 明确 artifact、安装状态、依赖关系如何被不同 agent 访问

### Week 4：把 Figma Make 入口打通成明确故事

目标：

- 把 Figma Make 定义成起点，而不是产品终点
- 让用户清楚理解 “为什么不是停在 Figma 里”

本周交付：

- 一条标准导入路径：从 Figma Make 生成结果到 registry artifact
- 一条端到端 demo：Make -> Publish -> Install -> Repair / Upgrade
- 对外话术统一：Figma Make 负责生成，我们负责进入真实代码库

## 当前缺口清单（相对上文交付项）

用于对齐「还差什么」；已落地的会在实现后收紧表述。

| 缺口 | 状态 | 说明 |
|------|------|------|
| 发布错误 `failureCategory`（VALIDATION_FAILED / PREVIEW_*）与稳定 `code` | **已推进** | REST `POST /api/registry/items` 与版本 POST 已返回 `failureCategory`；细粒度 `code` 持续与合约层对齐。 |
| MCP 结构化诊断（不发布、可编程消费） | **已推进** | 新增工具 `diagnose_publish_readiness`（JSON：`failureCategory`、`code`、`step`）；可选 `runPreviewSmoke` 对齐完整门禁。 |
| 网页侧「安装 / 升级 / lockfile」入口与说明 | **已推进** | 组织工作台增加工程师向说明，指向 MCP：`get_project_registry_status`、`analyze_project_registry`、`plan_component_upgrade`、`upgrade_component_in_project`。 |
| 与 Figma Make 端到端实测 + 标准导入路径文档 | 待办 | 流程与 demo 需在真实 Make 输出上跑通并写短流程（可复制到发布页）。 |
| 对外主叙事与 Make kits 的区分（非删词） | 待办 | 主文案突出 **artifact / repo / MCP / 跨工具消费**；可保留 kit、design context 等说法，写清「不限于 Make、终点在工程侧」。 |
| `repair` 专用 MCP（自动改代码再发布） | 待办 | 当前靠 agent + `diagnose_publish_readiness` + `publish_component` 组合；是否要做一等工具后续再定。 |

## 当前优先级

1. 把 publish / preview / validate / repair 闭环做成用户真正能感知到的产品能力
2. 把安装、升级、diff、依赖治理继续收紧，让 artifact 真正可进入真实 repo
3. 把 MCP / agent 的读取、诊断、修复接口做成开放优势
4. 把 Figma Make 到 registry artifact 的入口体验打通
5. 最后才继续扩“在 Figma 里更聪明”的能力

## 阶段 1：让 block bundle 可安装、可升级

目标：

- `registry:block` bundle 可稳定发布
- 预览链路可用
- 安装与版本读取链路可用
- 升级判断和版本追踪链路可用
- MCP 能稳定列出、获取并辅助升级 block
- block / theme 两类高优先级资产语义成立

当前状态：

- install / upgrade / planning 主链路已基本打通
- preview 与 installer 逻辑已更接近真实安装结果
- 发布门禁已开始接入 preview smoke validation
- 下一步重点转向网页上的 Project Status / Upgrade 入口与 Figma Make 实测验证
- 详细范围见 [phase-1-plan.md](./phase-1-plan.md)

## 阶段 2：让设计师与 AI 的 block 迭代链路真正可用

目标：

- Collections 和 policy 成为正式的组织协作边界
- 发布体验和校验更完整
- block bundle 的校验、版本化、升级提示完整成立
- 元数据更利于 AI 选择和复用
- Figma Make 等工具中的创建和迭代可以稳定进入 Registry
- 失败结果足够结构化，AI 能接住失败并继续修复

建议优先项：

- 发布与版本链路补强
- 提交校验升级
- Vibe coding 入口打通
- 安装/升级说明与锁文件落地
- 浏览筛选与检索
- diagnose / repair MCP 闭环

## 阶段 3：沉淀 component，形成前端资产供应链

目标：

- 从 block 生态中抽出稳定的 `registry:ui`
- 项目侧知道自己装了哪些资产、版本是多少、能否升级
- AI 能按 collection / theme / use-case 获取受控上下文
- block / component / theme 更新有 changelog、兼容性和回滚语义
- artifact 成为可被多种 AI 工具与 agent 访问的开放接口层

建议方向：

- lockfile + 版本建议
- 更强的 metadata
- collection-first AI workflow
- 主题与品牌资产打包分发
- 并行加强：**AI 可调用的 design context**（检索、预览、元数据）与 **code artifact governance**（安装、锁文件、升级），而不是二选一或「去语境化」
