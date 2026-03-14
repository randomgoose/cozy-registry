# Cozy Registry 待办

基于产品文档 Phase 1 完成后的下一步规划。按优先级分组，未勾选为待做。

---

## 一、验证与收尾（优先）

- [ ] **MCP 验证**：在 Cursor 中通过 Cozy MCP 说「列出组件」「获取 hero-section 代码」，确认改名与流程正常
- [ ] **部署验证**：推送到 Vercel，配置 `DATABASE_URL`、`NEXT_PUBLIC_APP_URL`，确认生产环境可访问

---

## 二、Phase 2 补强

- [ ] **提交规范与校验**：按 [SUBMISSION_GUIDELINES.md](./SUBMISSION_GUIDELINES.md) 落地硬性校验（内容长度上限、可选：默认导出、危险模式过滤）及文档/UI 提示
- [ ] **发布体验**：完善发布页的校验与错误提示、成功后的跳转与反馈
- [ ] **「Add to project」说明**：在 README 或文档中写清用户如何把组件用到自己的项目（复制代码 / 未来 CLI 示例，如 `npx shadcn add <registry-url>/r/...`）
- [ ] **组件 schema 扩展**：视需要为组件增加 `tags`、`useWhen` 等 AI 用字段，为后续 `search_components` 做准备

---

## 三、产品文档「待讨论」落地

- [ ] **组件/模块 schema 详细设计**：在文档中明确字段、必填/可选、与 shadcn 的对应关系（可新建 `docs/SCHEMA.md`）
- [ ] **样式与组件关联机制**：确定规则（如每组件可绑一套样式/主题），并在 DB 或 API 预留扩展

---

## 四、Figma Make 体验

- [ ] **OAuth 登录**：实现 MCP 的 OAuth 2.0 提供方（授权页 + token 端点），使 Figma Make 用户可在 Connect 时跳转 Cozy Registry 登录/注册，无需手动填 Bearer Token（参见 [FIGMA_MAKE_MCP.md](./FIGMA_MAKE_MCP.md) 末尾「能否在 Figma Make 里直接登录/注册」）

## 五、体验与质量

- [ ] **浏览与筛选**：首页/列表支持按类型、owner 筛选或简单搜索（title/name）
- [ ] **预览稳定性**：预览页错误边界、更多 demo props 或默认 fallback
- [ ] **健康检查**：确认 `/api/health` 满足部署与监控需求（DB、关键 env）

---

## 六、参考

- 产品愿景与阶段： [PRODUCT.md](./PRODUCT.md)（Phase 1 已完成，Phase 2/3 与待讨论事项）
- 设置与 API： [SETUP.md](../SETUP.md)
