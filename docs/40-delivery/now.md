Status: active
Owner: shared
Last updated: 2026-03-20
Source of truth: yes

# Now

## 当前关注点

- 把 Phase 1 的 install / check / upgrade 协议变成用户真正能感知到的产品体验
- 优先服务 Figma Make 等远程 AI 场景，让 AI 能稳定回答项目状态、升级机会和下一步动作
- 把本地 CLI 与远程 MCP 的职责边界继续收清楚：远程 AI 负责 planning，本地环境负责 execute
- 为网页上的 Project Status / Upgrade 入口准备可复用的数据模型与推荐工作流

## 当前优先级

1. 验证 `get_project_registry_status -> analyze_project_registry -> plan_component_upgrade` 在 Figma Make 里的可用性
2. 把 Project Status 的 AI-first 数据结构接到网页可视化入口
3. 再继续推进 collections、theme、AI metadata 的产品化

## 当前风险

- 远程 AI 运行环境未必能稳定访问本地项目目录，所以不能把“直接写文件”当成 Figma Make 主路径
- 如果没有清晰的 Project Status 入口，用户会知道有 CLI / MCP 工具，但不知道当前项目已经装了什么、该先升级什么
- `projectStatus` 快照与真实本地 lockfile 之间仍需明确验证链路，避免 AI 只会规划不会落地

## 当前修复项

- `P1`：Figma Make 等远程 AI 需要一个不依赖本地文件系统的 Project Status 分析能力，当前已补 `analyze_project_registry`
- `P1`：本地 CLI 已具备 `status / add / check / upgrade`，下一步应把这些能力映射成网页入口
- `P1`：安装、升级和状态分析的文档需要继续与网页信息架构保持一致
