# Cozy Registry 待办

基于产品文档 Phase 1 完成后的下一步规划。按优先级分组，未勾选为待做。

---

## 一、验证与收尾（优先）

- [x] **修复版本历史 owner 解析**：统一页面与 API 的版本查询逻辑，保证 handle URL 与 userId 兼容且结果一致
- [x] **修复多文件组件升级**：让 `/api/registry/[owner]/[name]/versions` 支持 `files`，避免版本升级时删除已有 bundle 文件
- [x] **修复预览临时目录清理**：在 preview build 结束后删除临时目录，防止线上磁盘累积
- [x] **定义安装记录机制**：确定 Phase 1 的项目侧安装记录方案（lockfile、代码头注释或二者组合）
- [x] **定义升级检查链路**：明确“当前安装版本 / 最新版本 / 可升级目标”的读取与比较方式
- [x] **确定安装协议入口**：明确 AI / MCP、Cozy CLI、`shadcn add` 三者在 Phase 1 的角色分工
- [x] **定义 lockfile 最小 schema**：基于 [install-protocol.md](../20-engineering/install-protocol.md) 固化 `cozy-registry.lock.json` 的字段
- [x] **定义升级冲突策略**：落实“默认停止，显式 force 才覆盖”的升级规则与输出格式
- [x] **定义基线快照读取方式**：明确升级时如何通过 `installedVersion + source` 获取安装基线
- [x] **AI-first 项目状态分析**：补齐 `analyze_project_registry`，让 Figma Make 等远程 AI 能基于 `projectStatus` 快照回答“装了什么、哪些可升级、下一步做什么”
- [ ] **MCP 验证**：在 Cursor 中通过 Cozy MCP 说「列出组件」「获取 hero-section 代码」，确认改名与流程正常
- [ ] **部署验证**：推送到 Vercel，配置 `DATABASE_URL`、`NEXT_PUBLIC_APP_URL`，确认生产环境可访问
- [ ] **Figma Make 状态链路验证**：实测 `get_project_registry_status -> analyze_project_registry -> plan_component_upgrade`，确认 AI 能稳定回答项目状态与升级建议
- [ ] **排查 theme 发布问题**：记录并修复 theme 资源在发布流程中的异常，补一个最小复现样例，并验证 theme thumbnail 生成与回写链路

---

## 二、Phase 2 补强

- [ ] **网页 Project Status 入口**：在站内提供一个可视化入口，展示已安装项、当前版本、可升级状态与推荐下一步
- [ ] **提交规范与校验**：按 [submission-guidelines.md](../30-rules/submission-guidelines.md) 落地硬性校验（内容长度上限、可选：默认导出、危险模式过滤）及文档/UI 提示
- [ ] **发布体验**：完善发布页的校验与错误提示、成功后的跳转与反馈
- [ ] **「Add to project」说明**：在 README 或文档中写清用户如何把组件用到自己的项目（复制代码 / 未来 CLI 示例，如 `npx shadcn add <registry-url>/r/...`）
- [ ] **组件 schema 扩展**：视需要为组件增加 `tags`、`useWhen` 等 AI 用字段，为后续 `search_components` 做准备

---

## 三、产品文档「待讨论」落地

- [ ] **组件/模块 schema 详细设计**：在文档中明确字段、必填/可选、与 shadcn 的对应关系（可新建 `docs/SCHEMA.md`）
- [ ] **样式与组件关联机制**：确定规则（如每组件可绑一套样式/主题），并在 DB 或 API 预留扩展
- [ ] **资源类型扩展（样式 / 图标 / 组件 / Block）**：按 [resource-types.md](../20-engineering/resource-types.md) 落地——`registry:theme` 按主题发布、`registry:icon-set` 按集合发布，组件/Block 保持现状；API 与 MCP 支持 theme、icon-set 的拉取与依赖声明

---

## 四、Figma Make 体验

- [ ] **OAuth 登录**：实现 MCP 的 OAuth 2.0 提供方（授权页 + token 端点），使 Figma Make 用户可在 Connect 时跳转 Cozy Registry 登录/注册，无需手动填 Bearer Token（参见 [figma-make-mcp.md](../20-engineering/figma-make-mcp.md) 末尾「能否在 Figma Make 里直接登录/注册」）

## 五、体验与质量

- [ ] **浏览与筛选**：首页/列表支持按类型、owner 筛选或简单搜索（title/name）
- [ ] **预览稳定性**：预览页错误边界、更多 demo props 或默认 fallback
- [ ] **卡片展开复用预览**：优化资源卡片从列表展开到弹层时的 preview 复用/缓存策略，避免 iframe 在打开弹层时重新加载
- [ ] **健康检查**：确认 `/api/health` 满足部署与监控需求（DB、关键 env）

---

## 六、参考

- 产品愿景与阶段： [vision.md](../10-product/vision.md)（Phase 1 已完成，Phase 2/3 与待讨论事项）
- Phase 1 方案： [phase-1-plan.md](../10-product/phase-1-plan.md)
- 安装协议： [install-protocol.md](../20-engineering/install-protocol.md)
- 设置与 API： [SETUP.md](../SETUP.md)
