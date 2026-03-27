Status: proposed
Owner: engineering
Last updated: 2026-03-27
Source of truth: no

# AI Publish Token Efficiency Spec

## 目的

这份文档记录一个明确的后续优化方向：

- 当前 AI / MCP 发布流程可以工作
- 但在真实使用中，AI 往往需要为一次 publish 生成较大的结构化 payload
- 这会额外消耗用户的模型 token，尤其是在多轮试错、组件迭代、依赖修正时

目标不是改变 publish 的能力边界，而是：

- 让 AI 少写重复结构
- 让系统多承担 payload 组装
- 在不牺牲可控性的前提下，降低用户为发布动作支付的 token 成本

---

## 一、问题定义

当前 `publish_component` 输入通常包含：

- `name`
- `title`
- `type`
- `content` 或 `files`
- `visibility`
- `publishScope`
- `targetRef` / `teamId`
- `previewProps`
- `registryDependencies`
- `description`

其中只有一部分字段真正需要 AI 决策。

大量字段其实是：

- 可从文件路径或源码推断
- 可由系统给默认值
- 或应该由服务端在 publish 前统一规范化

如果每次都由 AI 在 prompt 中反复输出整份 payload，会带来：

1. **token 浪费**
   - 重复输出结构化字段
   - 重复解释默认值

2. **错误率上升**
   - 多字段 payload 越大，越容易填错
   - 用户不容易分辨哪些字段是“必须思考”的，哪些只是模板噪音

3. **agent 交互不自然**
   - 用户实际上想表达的是“把这个组件发到某个 team”
   - 不是“帮我手写一份完整 JSON body”

---

## 二、设计原则

### 1. 让 AI 做判断，不让 AI 做机械组装

AI 更应该负责：

- 组件是否值得发布
- 发到哪个 target
- 描述如何写
- 哪些 `registryDependencies` 需要显式声明

而不是反复负责：

- 拼完整对象
- 补重复字段
- 展开默认参数

### 2. 服务端优先承担可推断字段

如果一个字段可以从已有上下文稳定推断：

- 优先由服务端推断
- 而不是要求 AI 在 prompt 中显式重复

### 3. 发布动作应支持“短指令 -> 规范化 payload”

理想路径是：

- 用户 / AI 给出简短发布意图
- 系统输出一份 publish plan
- 用户确认后再真正提交

### 4. 保留可审计性

减少 token 消耗，不等于把 publish 变成黑盒。

优化后仍应保证：

- publish target 清楚
- 最终会写入哪些 `registryDependencies` 清楚
- preview / visibility / item 名称清楚

---

## 三、优化方向

## 3.1 新增 `list_publish_targets`

这一条已经开始实现，是 token 优化的第一步。

作用：

- 避免 AI 让用户提供内部 `teamId`
- 改成先发现可读 target，再选择

这样能减少多轮澄清成本。

---

## 3.2 新增 `prepare_publish_component`

建议新增一个“准备发布”的工具，而不是让 `publish_component` 直接承担全部推断。

### 输入

尽量短，只保留真正需要 AI 或用户选择的内容，例如：

- `content` 或 `files`
- `targetRef`
- 可选 `title`
- 可选 `visibility`

### 输出

返回规范化 publish plan，例如：

- `name`
- `type`
- `targetRef`
- `visibility`
- `previewProps`
- `registryDependencies`
- 缺失项或风险提示

### 价值

- AI 在大多数场景下只需要处理“摘要”和“确认”
- 不需要一遍遍重组完整 payload

---

## 3.3 缩减 `publish_component` 的必填面

在保留兼容性的前提下，逐步让这些字段可省略：

- `type`
- `name`
- `publishScope`
- `teamId`

### 目标状态

- `publishScope` 可从 `targetRef` 推断
- `teamId` 完全内部化
- `name` 可从文件名 / title 推断（必要时再回显确认）
- `type` 可从内容 / 上下文推断（至少在常见 UI 组件场景里）

---

## 3.4 支持更短的 publish DSL

未来可以考虑让 agent 使用更轻的交互表达，例如：

- `publish Button to @gate/trading`
- `publish components/Button.tsx to @gate/trading`

再由系统展开成完整 publish plan。

这比在 prompt 里直接生成完整 JSON 更节省 token。

---

## 3.5 支持脚本化 publish 入口

如果未来需要进一步降低 token 消耗，可以增加：

- repo 内脚本
- CLI 包装
- 或极薄的 MCP wrapper

例如：

```bash
pnpm cozy:publish components/Button.tsx --to @gate/trading
```

这样 AI 只需要决定：

- 发哪个文件
- 发到哪个 target

而不需要承担完整 payload 组装。

---

## 四、推荐实施顺序

### Phase 1

- `list_publish_targets`
- `publish_component` 优先支持可读 `targetRef`

### Phase 2

- `prepare_publish_component`
- 服务端补齐更多默认字段

### Phase 3

- CLI / script 入口
- 更短的 publish DSL

---

## 五、当前结论

当前结论非常简单：

- **token 优化值得做**
- 但它不应该阻塞 team publish 主线
- 应作为 publish 体验的第二阶段补强项

一句话概括：

**让 AI 负责判断，让系统负责组装。**
