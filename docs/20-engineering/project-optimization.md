# 项目优化与健康状况（Optimization Backlog）

本文档汇总 **除自动化测试以外** 的优化方向与当前健康度判断，供后续迭代按优先级支持。测试相关清单见 [registry-dependency-test-plan.md](./registry-dependency-test-plan.md)。

**维护约定**：完成某项或调整优先级时，更新本文对应条目状态（可在 PR 中勾选或追加「已完成日期」）。

---

## 1. 总体结论

| 维度 | 评估 |
|------|------|
| 功能与工程结构 | 较成熟：Next、Drizzle、Better Auth、MCP/OAuth、多环境脚本、环境变量说明较完整。 |
| Registry 依赖域 | 有规范与 Vitest 单测覆盖，契约与解析路径相对清晰。 |
| 主要短板 | **CI/CD 自动化**、**可观测性**、**文档站/构建稳定性**、**规模化与滥用防护** 尚未系统化。 |
| 整体判断 | **小团队与日常开发健康**；**生产规模化与运维成熟度**仍有提升空间。 |

---

## 2. 工程与交付

| ID | 项 | 说明 | 优先级 |
|----|----|------|--------|
| O-01 | **仓库内 CI** | 建议至少：`pnpm exec tsc --noEmit`、`pnpm lint`、`pnpm test`、`pnpm build`（可按环境变量跳过重依赖步骤）。当前仓库内未见 `.github/workflows`。 | P0 |
| O-02 | **构建与文档站稳定性** | `next build` 若出现 Nextra / `private-next-content-dir` 等错误，需单独排查内容路径与 Nextra 版本，避免发布信心受文档路由影响。 | P0 |
| O-03 | **依赖与工具链对齐** | 关注 `pnpm` 对 `esbuild` peer、Vitest/Vite 的告警；定期锁定或升级，减少 CI 漂移。Vitest 2.x 与 Node 20 LTS 兼容（见测试方案文档）。 | P2 |

---

## 3. 安全与运维

| ID | 项 | 说明 | 优先级 |
|----|----|------|--------|
| O-10 | **生产密钥与默认配置** | 确保生产环境不使用默认 `BETTER_AUTH_SECRET`；部署侧或启动时强校验关键 env。 | P0 |
| O-11 | **全局限流 / 边缘防护** | API Key 在 DB 层有 rate limit 设计；MCP 等路径存在为验 token 绕过部分计数器的实现。公开暴露时建议结合 **WAF / 网关限流** 或应用层策略，并明确滥用面（注册、发布、MCP）。 | P1 |
| O-12 | **审计与结构化日志** | 当前多为 `console.*`；后续可引入 request id、用户上下文、JSON 日志，便于排障与合规。 | P1 |

---

## 4. 性能与成本

| ID | 项 | 说明 | 优先级 |
|----|----|------|--------|
| O-20 | **引用查询与 DB 扩展** | `findRegistryItemsReferencing` 等随数据量增长需关注 SQL 与索引；与规范中的反向索引/治理任务对齐。 | P2 |
| O-21 | **预览与缩略图资源** | 预览、缩略图 worker 依赖浏览器类资源（Playwright/Chromium），需关注超时、并发、队列背压与重试策略。 | P2 |
| O-22 | **外部 CDN 依赖** | 预览页依赖 `esm.sh`、Tailwind CDN 等；可用性与版本钉策略影响预览稳定性。 | P3 |

---

## 5. API 与错误形态

| ID | 项 | 说明 | 优先级 |
|----|----|------|--------|
| O-30 | **错误响应统一** | Registry 相关路径已部分使用 `code`（如 `REGDEP_*`）；其余接口可逐步统一为「机器可读 code + 人类可读 message」。 | P2 |

---

## 6. 产品与文档

| ID | 项 | 说明 | 优先级 |
|----|----|------|--------|
| O-40 | **运维 Runbook** | 部署、密钥轮换、备份、缩略图 worker 部署方式建议集中成文（可链到 README/SETUP）。 | P2 |
| O-41 | **其它域的契约化** | OAuth、团队、集合等可参考 registry 依赖：关键行为 + 文档 + 测试分层。 | P3 |

---

## 7. 建议实施顺序（摘要）

1. **P0**：CI（O-01）、生产 env 校验（O-10）、构建/文档站稳定（O-02）。  
2. **P1**：结构化日志与关键路径监控（O-12）、滥用防护策略（O-11）。  
3. **P2**：错误形态统一（O-30）、DB/引用查询与 worker 资源（O-20、O-21）、Runbook（O-40）、依赖工具链（O-03）。  
4. **P3**：外部 CDN 策略（O-22）、其它域契约（O-41）。

---

## 8. 相关文档

- [registry-dependency-test-plan.md](./registry-dependency-test-plan.md) — 测试分层与 registry 依赖用例。  
- [registry-dependency-management-spec.md](./registry-dependency-management-spec.md) — Registry 依赖规范。  
- [SETUP.md](../../SETUP.md)、[README.md](../../README.md) — 环境与快速开始（若与 Runbook 合并，可在 O-40 中更新链接）。

---

## 9. 变更记录

| 日期 | 说明 |
|------|------|
| （首版） | 从工程健康度评估整理为可跟踪 backlog。 |
