# Registry Dependencies：测试方案

本文档与 [Registry Dependency Management Spec](./registry-dependency-management-spec.md) §9 验收矩阵对齐，说明 **registry 依赖**相关测什么、怎么测、分层与维护方式；文末 [§8](#8-全项目补充测试建议) 汇总**整仓**仍建议补充的测试（不限于 `registryDependencies`）。自动化用例位于 `lib/**/*.test.ts`，由 Vitest 执行（`pnpm test`）。

---

## 1. 测试分层

| 层级 | 范围 | 工具 | 目标 |
|------|------|------|------|
| **A. 单元** | 归一化、契约、stub 扫描、纯解析逻辑 | Vitest | 快速、无 DB、可 CI |
| **B. 集成** | REST/MCP + 真实 Postgres | 可选：Playwright / 手工脚本 + 测试库 | 持久化与权限端到端 |
| **C. 手动 / 探索** | Preview `?debugTheme=1` / `?debugDeps=1` | 浏览器 | 主题注入、依赖调试面板 |

当前仓库**默认落地 A 层**；B/C 在下方以清单形式保留，便于后续接入。

---

## 2. 与 Spec §9 的映射

| # | Spec 场景 | 自动化（A） | 备注 |
|---|-----------|-------------|------|
| 1 | 创建时合法 `registryDependencies` 写入快照与首版本；stub 默认不进写入，除非 `applyStubInference: true` | 契约层：`normalizePublishContract` + `registry-publish-contract.test.ts` | DB 持久化见 B |
| 2 | 更新版本时**省略字段**保留上一版依赖 | `normalizePublishContract` version + `previousRegistryDependencies` | |
| 3 | 更新版本时 `registryDependencies: []` 清空 | 同上，显式 `[]` | |
| 4 | 非法 ref → `REGDEP_INVALID_FORMAT` | `normalizeRegistryDependenciesInput` / contract | |
| 5 | 悬空 ref → 解析时 `REGDEP_NOT_FOUND` | Resolver 单测（mock DB） | |
| 6 | 环 → `REGDEP_CYCLE_DETECTED` + path | Resolver 单测（mock） | |
| 7 | 私有依赖无权限 → `REGDEP_PERMISSION_DENIED` | Resolver 单测（mock access） | |
| 8 | 主题依赖传递注入成功 | 建议 B：预览 HTML | |
| 9 | 主题解析失败不拖垮整页 | 建议 B/C | |
| 10 | MCP 与 REST 写入一致 | 契约相同则一致；可选 B 双路径对比 | |

---

## 3. 单元测试用例清单（已实现 / 规划）

### 3.1 `lib/registry-dependency-input.test.ts`

- [x] 合法 ref 列表去重、trim
- [x] 非法 ref 报错
- [x] `null` 拒绝（与「省略字段」区分）
- [x] 非数组拒绝

### 3.2 `lib/registry-dependency-stub-scan.test.ts`

- [x] 含 Cozy stub 标记 + `_deps/owner/name/` 路径时推断 `@owner/name`
- [x] 无标记或无 `_deps` 时不推断

### 3.3 `lib/registry-publish-contract.test.ts`

- [x] create：默认仅显式依赖写入；stub 出现在 diagnostics；`applyStubInference: true` 时合并 stub
- [x] version：省略字段 → `registryDependenciesToWrite === undefined`
- [x] version：显式 `[]` → 空数组
- [x] version + provenance：省略显式字段时合并 `previousRegistryDependencies` 与 provenance refs
- [x] strict + dirty provenance → `PROV_DIRTY_DEPENDENCY`
- [x] split + dirty → `PROV_SPLIT_NOT_IMPLEMENTED`
- [x] `inlineVendor`：registry 路径保留源码而非 stub

### 3.4 `lib/registry-resolver.test.ts`（mock `@/lib/registry`）

- [x] 依赖环检测抛出 `RegistryDependencyCycleError`
- [x] `getRegistryDependencyAccessForRef === "denied"` → `RegistryDependencyPermissionDeniedError`

---

## 4. 集成测试（B）建议步骤（未默认开启）

前置：`DATABASE_URL` 指向可丢弃的测试库。

1. **创建** `POST /api/registry/items`，body 含 `registryDependencies: ["@owner/dep"]`（需先有 dep 或使用公开 fixture）。
2. **更新** `POST .../versions`，无 `registryDependencies` 字段，断言 DB 中依赖未变。
3. **更新** 带 `registryDependencies: []`，断言清空。
4. **删除** `DELETE .../name`，当被其它条目引用时期望 **409** + `REGDEP_REFERENCED`。

可使用 Playwright `request` 或 `curl` + 脚本断言状态码与 JSON `code`。

---

## 5. 手动回归（C）

- Preview：`?debugTheme=1` — 控制台 `__COZY_THEME_DEBUG__`
- Preview：`?debugDeps=1` — `__COZY_DEPS_DEBUG__`（组件依赖物化、主题解析错误等）
- 故意引用不存在条目：应出现组件预览 **500** 与 `REGDEP_NOT_FOUND` 类提示（若走组件依赖链）

---

## 6. CI 建议

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
```

合并前至少跑通上述命令；集成测试按环境变量门禁可选执行。

---

## 7. 相关文件

| 文件 | 说明 |
|------|------|
| `vitest.config.ts` | Vitest + `@/*` 别名（当前使用 **Vitest 2.x**，兼容 Node 20 LTS） |
| `lib/registry-dependency-*.test.ts` | 单元测试 |
| `lib/registry-publish-contract.test.ts` | 发布契约 |
| `lib/registry-resolver.test.ts` | 解析器（mock） |

---

## 8. 全项目补充测试建议

以下为 **Registry 单测之外**仍值得补的测试（当前仓库以 §3 单元测为主；本节不重复已实现的 registry 契约用例）。

### 8.1 高优先级（风险与回归面大）

| 方向 | 建议范围 | 备注 |
|------|----------|------|
| **HTTP API 集成** | `POST /api/registry/items`、`POST /api/registry/[owner]/[name]/versions`、`DELETE` 同路径、`GET /api/r/...` | 鉴权；删除时 **409** + `REGDEP_REFERENCED`；响应体 `publishDiagnostics` / `code`；与真实 DB 一致。需可丢弃库或测试事务。 |
| **安装协议 / lockfile** | `lib/install-protocol.ts` | `materializeRegistryDependencies`、升级冲突、`cozy-registry.lock.json` 读写；多数分支可用**纯单测**（临时目录 + mock `fetch`）。 |
| **预览管线** | `lib/preview-build.ts`、`app/preview/[owner]/[name]/route.ts` | esbuild 失败页、组件依赖解析失败 **500**、主题解析失败不拖垮整页；可测「输入 files → 状态码 / HTML 片段」。全页快照慎用。 |
| **MCP 工具** | `lib/mcp-tools.ts` 中 `publish_component`、`delete_component` 等 | 与 REST 契约一致；错误信息含 `code`；可对 `createRegistryMcpServer` 传入 mock `Request` 做中层测试。 |

### 8.2 中优先级（质量与长期维护）

| 方向 | 建议范围 | 备注 |
|------|----------|------|
| **数据层** | `lib/registry.ts` | `createRegistryItem` / `createRegistryItemVersion`、`findRegistryItemsReferencing`、快照与 `registry_item_versions` 一致。需测试库，或对 repository 抽象后 mock。 |
| **TSX / Bundle 校验** | `lib/validate-tsx.ts` | `validateComponentBundle`、`extractDependencies` 边界（缺失文件、非法 import 等）。 |
| **Owner / 可见性** | `lib/owner.ts` + registry 读路径 | `resolveOwner`、`getRegistryItemByOwnerAndName` 下 public/private 组合。 |
| **Provenance 边角** | `lib/cozy-provenance.ts` 与契约组合 | 例如 provenance `files` 的 object-map 形态、与 `normalizePublishContract` 联调（§3 已覆盖主干）。 |

### 8.3 低优先级 / 可选

| 方向 | 说明 |
|------|------|
| **E2E（Playwright）** | 登录 → 发布 → 列表/预览 → 删除；维护成本高，适合关键路径冒烟。 |
| **Auth / OAuth** | 令牌、session；多在 staging 或独立安全测试。 |
| **Worker / 缩略图** | `bin/cozy-thumbnail-*`、异步任务与重试；按发布频率加测。 |
| **文档站（Nextra）** | 构建与内容路径问题；一般不写单元测，以构建流水线为准。 |

### 8.4 实施顺序建议

若只扩一类自动化：**安装协议（`install-protocol`）单测** 与 **Registry HTTP API 集成测** 性价比最高——前者无 DB 亦可覆盖大量分支，后者锁住对外契约与权限。

---

## 9. 变更说明

- 新增依赖或发布语义时：**先更新本文档 §3**，再补/改 `lib/**/*.test.ts`。
- Spec §9 增删场景时：同步更新 §2 表格与 §3 清单。
- 全项目测试范围变化时：同步更新 **§8**。
