Status: active
Owner: shared
Last updated: 2025-02-14
Source of truth: yes

# Cozy Registry Internal Docs

这套文档按 6 层组织，目的是把“稳定事实”和“当前推进项”分开。

对外或给最终用户看的快速上手文档：

- [`user-guide/figma-make-quickstart.md`](./user-guide/figma-make-quickstart.md)

## 目录

### `00-overview`

- 面向所有协作者的快速总览
- 只放高密度、低分歧的信息

当前文件：

- [`00-overview/product-summary.md`](./00-overview/product-summary.md)
- [`00-overview/system-overview.md`](./00-overview/system-overview.md)

### `10-product`

- 产品定位、目标用户、路线与优先级
- 回答“为什么做、先做什么、不做什么”

当前文件：

- [`10-product/vision.md`](./10-product/vision.md)
- [`10-product/roadmap.md`](./10-product/roadmap.md)
- [`10-product/phase-1-plan.md`](./10-product/phase-1-plan.md)
- [`10-product/ai-selection-and-scope.md`](./10-product/ai-selection-and-scope.md)
- [`10-product/team-workspaces-plan.md`](./10-product/team-workspaces-plan.md)
- [`10-product/team-mvp-screens.md`](./10-product/team-mvp-screens.md)

### `20-engineering`

- 工程事实、协议、数据模型、运行机制
- 回答“系统现在怎么工作”

当前文件：

- [`20-engineering/component-preview-runtime.md`](./20-engineering/component-preview-runtime.md)
- [`20-engineering/figma-make-mcp.md`](./20-engineering/figma-make-mcp.md)
- [`20-engineering/team-data-model.md`](./20-engineering/team-data-model.md)
- [`20-engineering/team-permission-matrix.md`](./20-engineering/team-permission-matrix.md)
- [`20-engineering/oauth-client-strategy.md`](./20-engineering/oauth-client-strategy.md)
- [`20-engineering/install-protocol.md`](./20-engineering/install-protocol.md)
- [`20-engineering/resource-types.md`](./20-engineering/resource-types.md)
- [`20-engineering/style-and-theme-spec.md`](./20-engineering/style-and-theme-spec.md)
- [`20-engineering/theme-tokens-spec.md`](./20-engineering/theme-tokens-spec.md)
- [`20-engineering/versioning-and-lockfile.md`](./20-engineering/versioning-and-lockfile.md)

### `30-rules`

- 强约束、边界、命名和提交流程规则
- 回答“什么不能乱改”

当前文件：

- [`30-rules/engineering-rules.md`](./30-rules/engineering-rules.md)
- [`30-rules/namespace-library-and-block-spec.md`](./30-rules/namespace-library-and-block-spec.md)
- [`30-rules/submission-guidelines.md`](./30-rules/submission-guidelines.md)

### `40-delivery`

- 当前周期执行信息、任务和风险
- 回答“现在在做什么”

当前文件：

- [`40-delivery/now.md`](./40-delivery/now.md)
- [`40-delivery/todo.md`](./40-delivery/todo.md)

### `50-decisions`

- 关键设计决策记录（ADR）
- 回答“为什么这么定”

当前文件：

- [`50-decisions/0001-owner-and-url-canonicalization.md`](./50-decisions/0001-owner-and-url-canonicalization.md)

## 使用规则

- 新想法先放 `10-product/roadmap.md` 或 `40-delivery/todo.md`，不要直接写进规范文档。
- 一旦某个约束会长期影响实现，就在 `30-rules` 或 `50-decisions` 固化。
- `40-delivery` 可以频繁改；其余目录尽量只在认知发生变化时修改。
- 如果一个问题已经在 `50-decisions` 里定了，其他文档引用它，不再重复写一遍完整讨论。
