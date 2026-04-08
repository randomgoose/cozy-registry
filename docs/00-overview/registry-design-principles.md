Status: active
Owner: engineering
Last updated: 2026-04-08
Source of truth: yes（原则层；具体契约以各专项 spec 为准）

# Registry 设计原则（北极星）

本文只保留当前共识的**强约束方向**，作为产品与工程决策的参照。  
不包含具体 API 形态、不替代 [Registry Dependency Management Spec](../20-engineering/registry-dependency-management-spec.md) 等实现细节。

---

## 必须遵守的原则

1. **Explicit > Inference**  
   可执行语义（依赖图、安装、预览）以**显式声明**为准；启发式推断只能作辅助信号，不能静默替代显式契约。

2. **Deterministic > Heuristic**  
   同一输入在发布与解析路径上应得到**稳定、可复现**的结果；启发式可用于建议或置信度，不应单独作为唯一依据。

3. **Source-first**  
   分发与消费以**源码**为中心（多文件 bundle、相对引用），不以编译产物作为 registry 交付物。

4. **Extraction 与 Publish 分层**  
   「从源码中抽取可复用组件」是**独立能力**；发布是**契约下的落库动作**。产品主流程上宜：**先抽取 / 审核，再发布**——但不排除脚本、API、迁移等其它入口，只要满足同一套契约。

5. **In development, prefer model convergence over compatibility**
   在当前仍处于高频迭代、尚未正式上线的阶段，遇到核心语义冲突时，应优先：
   - 收口到单一正式模型
   - 消除 UI / 构建 / 数据层的双重语义
   - 把兼容路径明确标成 temporary bridge

   不应因为提前保留过多兼容层，而让系统同时存在两套都“看起来成立”的真相，例如：
   - `attach to project`
   - `canonical project item`

   这条原则是**当前开发阶段特有的偏向**。正式上线后，应改写为更平衡的原则：在保证单一 source of truth 的前提下，系统性评估兼容成本、迁移策略与外部用户影响。

---

## 与专项文档的关系

- 依赖、解析、预览、安装：**见** [Registry Dependency Management Spec](../20-engineering/registry-dependency-management-spec.md)、[Install Protocol](../20-engineering/install-protocol.md)、[System Architecture](./system-architecture.md)。  
- 讨论中的扩展（结构化依赖类型、解析策略层、组件层级元数据等）：**见** [Registry design discussion queue](../20-engineering/registry-design-discussion-queue.md)。

---

## 刻意不写入本文的（避免过早定稿）

- 是否禁止手工编辑依赖图、是否移除 provenance 参与写入等**强产品裁决**。  
- 具体 Extraction 规则集、UI 形态、import 别名约定。  
- 与 shadcn 对外 JSON 字段一一对应的「v1 类型定义」。

以上在**有实现与迁移方案**时再单独立项成 spec。

---

## 落地状态（工程）

| 原则 | 当前落地 |
|------|----------|
| Explicit > Inference | 发布契约默认不将 stub 推断写入 `registryDependencies`；可选 `applyStubInference`；Web 发布页支持显式填写 `registryDependencies`。 |
| Deterministic > Heuristic | 同一请求体 + 契约归一化 → 稳定写入；stub 结果始终在 `publishDiagnostics` 中可查。 |
| Source-first | 既有：多文件 bundle、源码分发；未改。 |
| Extraction 与 Publish 分层 | `lib/extraction/types.ts` 提供抽取阶段类型骨架；完整抽取引擎待迭代。 |
| In development, prefer model convergence over compatibility | 新增：用于当前开发阶段的决策偏向，避免 UI/构建/数据层长期保留双重语义；正式上线后需改写为更兼顾兼容与迁移的版本。 |
