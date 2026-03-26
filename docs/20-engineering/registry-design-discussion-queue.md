Status: draft
Owner: engineering
Last updated: 2026-03-26
Source of truth: no（讨论队列；条目状态见各节）

# Registry 设计讨论队列

本文把与 **registry 依赖与解析** 相关的改进意向，按 **合理性 + 落地优先级** 归档。  
讨论结论回写到 [Registry Dependency Management Spec](./registry-dependency-management-spec.md)（§1.1、§3.6、§3.7：显式依赖、建议与人工确认、非阻塞健康检查）等规范后再扩展实现。

---

## 优先级说明

| 优先级 | 含义 |
|--------|------|
| **P1** | 与「依赖来源可信、行为可预测」强相关；建议优先开议题 |
| **P2** | 协议/模型演进，需兼容与迁移设计 |
| **P3** | 依赖真实多版本冲突与 override 场景时再加深 |
| **P4** | 产品与目录语义，弱耦合核心存储模型 |

---

## P1 — stub inference：从「写入来源」降级为「辅助信号」（**已落地**）

**原问题**  
stub 扫描与显式声明合并后写入 `registryDependencies`，形成隐式依赖来源。

**结论（已实现）**  

- 持久化以显式 `registryDependencies` 为准；stub 推断出现在 **diagnostics**（`stubInferredRegistryDependencies`）。  
- 仅当 **`applyStubInference: true`** 时合并进写入；响应含 **`stubInferenceMergedIntoWrite`**。

**规范**：[Registry Dependency Management Spec](./registry-dependency-management-spec.md) §3.5.2。

---

## P2 — 依赖类型语义：从扁平 `string[]` 到结构化声明

**问题**  
`registryDependencies: string[]` 无法表达 **direct / peer / optional** 等语义；若未来希望 **AI 自动组合 UI** 或安装器做不同处理，扁平列表不足。

**倾向结论（待讨论定稿）**  

- 引入结构化形态（示例）：`name`、`version?`、`type: "direct" | "peer" | "optional"` 等。  
- 必须与 **shadcn 兼容消费** 协调：字符串数组的长期含义、**映射层** 或 **v2 字段**、JSON schema 版本。

**待讨论**  

- peer 在 **Cozy 预览** vs **安装到用户项目** 中的语义是否一致？  
- 与 [Install Protocol](./install-protocol.md) lockfile 的字段如何对齐？

**依赖**  

- P1 讨论稳定后，再定 **是否** 扩展字段，避免在「隐式写入未收敛」时叠复杂类型。

---

## P3 — Resolution Strategy：在 resolver 之上处理版本与覆盖

**问题**  
当前 resolver 侧重 **传递闭包 + 顺序 + 环检测**；**多版本冲突**（A 要 Button@1、B 要 Button@2）、**用户 override**、**dedupe 策略** 未在单独一层定义。

**倾向结论（待讨论定稿）**  

- 在解析管线中预留 **Resolution Strategy**（命名可再议）：version 决议、override 表、peer 校验等。  
- 可与 lockfile / 项目侧状态联动，而非仅在服务端内存中「拍脑袋」选版本。

**待讨论**  

- 首阶段是否只需 **lockfile 单版本 wins**，再引入 override？  
- 服务端 **预览** 与 **CLI 安装** 是否共用同一策略接口？

**依赖**  

- [Install Protocol](./install-protocol.md) 中 lockfile 是否为策略的 source of truth（与既有原则对齐）。

---

## P4 — 组件身份层级：Primitive / Composite / Pattern

**问题**  
条目在产品心智上常有 **层级**（基础件、组合件、模式/业务块），但存储上若全部平级，不利于筛选、文档与生成器约束。

**倾向结论（待讨论定稿）**  

- 优先 **元数据**（如 `meta.layer`、`tags`、`kind`），**不**用硬编码层级替代当前「平级 item + 依赖边」模型。  
- 与 `registry:block` / `registry:ui` 等 **类型** 的关系需写清，避免两套分类打架。

**待讨论**  

- 是否 **必填** 元数据，还是发布者可选？  
- 与 collections、namespace 文档的交叉引用方式。

**依赖**  

- 与产品信息架构相关；技术依赖弱于 P1–P3。

---

## Related

- [Registry design principles](../00-overview/registry-design-principles.md)（北极星原则）  
- [System Architecture](../00-overview/system-architecture.md)  
- [Registry Dependency Management Spec](./registry-dependency-management-spec.md)  
- [Install Protocol](./install-protocol.md)  
- [Namespace, Library and Block Spec](../30-rules/namespace-library-and-block-spec.md)

---

## 讨论顺序建议

1. **P1**（stub 语义与写入边界）— **已实现**  
2. **P2**（是否在 P1 定稿后启动结构化依赖）  
3. **P3**（与安装/锁文件路线绑定）  
4. **P4**（可并行产品讨论）
