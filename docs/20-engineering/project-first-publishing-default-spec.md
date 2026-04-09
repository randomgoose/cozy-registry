Status: proposed
Owner: engineering
Last updated: 2026-04-08
Source of truth: partial

# Project-First Publishing Default Spec

## 1. Problem

当前系统在数据层与产品层之间仍保留了两种心智：

- item 属于某个 project
- item 不属于任何 project（non-project item）

这在早期迭代中有灵活性，但随着系统越来越依赖 project 作为正式上下文边界，这种双重语义会带来明显问题：

- canonical identity 越来越倾向 `owner + project + name`
- project default theme / theme layers 依赖 project context
- preview / docs / install / artifact 越来越需要 project 作为统一上下文
- MCP / AI 在 publish 时更难推理“未指定 project”到底意味着什么

一句话：

**non-project item 作为长期主路径，会持续削弱 project-first 模型。**

## 2. Decision

平台应逐步采用 **project-first publishing**：

- 用户发布 item 时，默认应属于某个 project
- 若用户未显式传入 project，系统应自动归入一个默认 project

但在系统内部，仍允许暂时保留 non-project item 作为：

- legacy compatibility state
- migration bridge
- early transitional data shape

也就是说：

- **用户侧：弱化 non-project item**
- **系统内部：保留兼容，但不继续把它当主模型扩展**

## 3. Goals

- 让发布默认落在 project context 中
- 减少 UI / build / docs / install 对“无 project”分支的特殊处理
- 与 project-scoped identity、project theme layers、docs / preview context 统一
- 保持当前开发阶段的模型收口方向

## 4. Non-Goals

本 spec 不要求第一阶段立即：

- 彻底删除数据库层的 non-project records
- 一次性迁移所有旧数据
- 改写所有历史 route / API 参数

## 5. Recommended Product Model

### 5.1 User-Facing Default

用户心智应逐步变成：

- 所有资源都属于某个 project
- 如果用户没选 project，系统会自动放进默认 project

### 5.2 Internal Compatibility Model

系统内部仍可暂时允许：

- legacy item 没有 canonical project
- 读取层兼容 non-project item

但不建议：

- 把 non-project item 继续作为默认 publish 路径
- 给新能力优先支持 non-project item

## 6. Recommended Strategy

### 6.1 Default Project Per Owner

推荐采用：

- **每个 owner 一个默认 project**

例如：

- personal owner: `default`
- org owner: `default` 或保留 namespace

当 publish 未指定 project 时：

- 自动归入该 owner 的默认 project

这是第一阶段最稳的方案，因为它：

- 规则简单
- identity 总是完整
- 不需要频繁自动创建大量临时 project

### 6.2 Why Not Auto-Create Many Projects

另一种思路是：

- 每次未指定 project 时自动创建 `sandbox` / `untitled` / `imports`

这在概念上可行，但第一阶段不建议，因为会带来：

- project 数量膨胀
- 管理复杂度上升
- AI / MCP 更难预测命名与归档策略

## 7. Identity Implications

该策略与 [Project-Scoped Registry Identity Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/project-scoped-registry-identity-spec.md) 保持一致：

- 正式 identity 应逐步收口到 `owner + project + name`

未显式传 project 时，自动归入默认 project，意味着：

- 用户不需要理解 non-project item
- 系统内部仍然能得到 project-scoped identity

## 8. Relationship To Theme / Docs / Preview

该策略会自然改善以下链路：

- project default theme / theme layers 更容易生效
- preview / artifact 更少遇到“没有 project context”的分支
- docs page 语义更稳定
- install protocol 更容易提供 project-aware 提示

## 9. Publish Semantics

### 9.1 Explicit Project

如果用户显式提供 project：

- 按显式 project 发布

### 9.2 Missing Project

如果用户未提供 project：

- 系统自动解析 owner 的默认 project
- item 归入默认 project

### 9.3 Internal Legacy Items

如果系统中仍存在 legacy non-project items：

- 继续可读
- 继续兼容旧路径
- 但不应再把它们当作推荐 publish 结果

## 10. Recommended Rollout

### Phase 1

- 明确产品默认：未指定 project 时自动归入默认 project
- MCP / API / Web publish 在文档与返回结果里统一这一点

### Phase 2

- UI 中弱化 non-project item 概念
- 详情页、列表页、dashboard 默认按 project-first 展示

### Phase 3

- 逐步减少实现层对 non-project 新写入路径的支持
- 将 non-project 收口为 compatibility state

## 11. Open Decisions

仍需拍板的问题：

1. 默认 project namespace 的具体命名是否统一为 `default`
2. org owner 与 personal owner 是否共用相同默认 project 规则
3. 默认 project 是否在 UI 中显式展示，还是更多作为隐式上下文
4. legacy non-project item 是否需要后续自动迁移

## 12. Recommended Principle

当前开发阶段，建议采用：

- **project-first UX**
- **project-scoped identity**
- **non-project only as compatibility state**

一句话：

**用户不必继续理解 non-project item，但系统可暂时保留它作为兼容层。**

## 13. Related Docs

- [Project-Scoped Registry Identity Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/project-scoped-registry-identity-spec.md)
- [Project Resource Relationship Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/project-resource-relationship-spec.md)
- [Registry 设计原则](/Users/chenchen/Documents/GitHub/my-app/docs/00-overview/registry-design-principles.md)
