Status: active
Owner: product
Last updated: 2026-03-20
Source of truth: yes

# Roadmap

## 战略方向

- 主定位：面向 Web 开发的 AI-native 前端资产分发系统
- 核心用户：具备 Vibe coding 能力和意愿的设计师，以及负责消费这些资产的 AI agent
- 主切入：设计师高参与的 Web UI 资产，如 block bundles、themes、实验性 section
- 体系扩展：逐步覆盖 `registry:ui` 级别的组件库能力
- 非目标：当前阶段不把自己定义成通用团队组件仓库

## 阶段 1：让 block bundle 可安装、可升级

目标：

- `registry:block` bundle 可稳定发布
- 预览链路可用
- 安装与版本读取链路可用
- 升级判断和版本追踪链路可用
- MCP 能稳定列出、获取并辅助升级 block
- block / theme 两类高优先级资产语义成立

当前状态：

- install / upgrade / planning 主链路已基本打通，远程 AI 场景已补 `analyze_project_registry`
- 下一步重点转向网页上的 Project Status / Upgrade 入口与 Figma Make 实测验证
- 详细范围见 [phase-1-plan.md](./phase-1-plan.md)

## 阶段 2：让设计师与 AI 的 block 迭代链路真正可用

目标：

- Collections 和 policy 成为正式的组织协作边界
- 发布体验和校验更完整
- block bundle 的校验、版本化、升级提示完整成立
- 元数据更利于 AI 选择和复用
- Figma Make 等工具中的创建和迭代可以稳定进入 Registry

建议优先项：

- 发布与版本链路补强
- 提交校验升级
- Vibe coding 入口打通
- 安装/升级说明与锁文件落地
- 浏览筛选与检索

## 阶段 3：沉淀 component，形成前端资产供应链

目标：

- 从 block 生态中抽出稳定的 `registry:ui`
- 项目侧知道自己装了哪些资产、版本是多少、能否升级
- AI 能按 collection / theme / use-case 获取受控上下文
- block / component / theme 更新有 changelog、兼容性和回滚语义

建议方向：

- lockfile + 版本建议
- 更强的 metadata
- collection-first AI workflow
- 主题与品牌资产打包分发
