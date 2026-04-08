Status: draft
Owner: engineering
Last updated: 2026-04-07
Source of truth: no

# AI Misreasoning Guardrails Log

本文用于持续收集 Cozy Registry / MCP / preview / publish 链路中，AI 因为工具描述、错误信息或系统 contract 不够清晰，而产生错误推断的案例。

目标不是记录“AI 做错了什么”本身，而是帮助团队系统性回答：

- AI 为什么会误判
- 误判暴露了哪一层 contract 不够清晰
- 应该把 guardrail 补到哪里

本文应作为持续维护的工程日志，而不是一次性设计文档。

## 1. Why This Document Exists

在 AI-first / MCP-first 的工作流里，很多错误不是代码 bug，而是：

- 工具描述不清
- 错误语义太粗
- 系统真实 contract 与 AI 可见 contract 不一致
- 模型用通用经验替代了本项目事实

这些问题如果不单独记录，团队会反复遇到：

- AI 删除本来允许的模式
- AI 用错误的简化规则改代码
- AI 把真实失败归因到错误原因

因此需要一个集中位置，收集：

- 误判案例
- 修复建议
- 最终落地的 guardrail

## 2. How To Use This Log

每当出现以下情况时，都应新增一条记录：

- AI 对系统能力做了错误假设
- AI 对失败原因做了错误归因
- AI 因为工具描述缺失而做了不必要的代码修改
- AI 对 preview / publish / install / dependency / theme / project 等核心 contract 理解错误

每条记录至少回答：

1. 现象是什么
2. AI 的错误推断是什么
3. 实际系统行为是什么
4. 根因是什么
5. 应该把 guardrail 补到哪里

## 3. Guardrail Insertion Points

对于这类问题，优先考虑以下补点：

### 3.1 MCP Tool Descriptions

适合写：

- 平台正式 contract
- 常见误判澄清
- “不要做什么”的 hard rule

### 3.2 Failure Diagnostics / Error Codes

适合写：

- 真实失败原因
- 不同失败类型的明确区分

目标是减少 AI 自己脑补归因。

### 3.3 Engineering Specs

适合写：

- 长期系统真相
- 术语定义
- 模式边界

### 3.4 Tests / Example Fixtures

适合写：

- “这个模式是允许的”
- “这个模式应失败”

测试可以成为 agent 可引用的 ground truth。

### 3.5 Agent Briefs / Internal Docs

适合写：

- 当前阶段最容易误判的地方
- 特定工作流下的实践约束

## 4. Entry Template

建议按以下模板记录：

### Title

一句话描述误判主题。

### Context

误判发生在哪个工作流里：

- publish
- preview smoke
- MCP tool usage
- docs generation
- install

### Incorrect Inference

AI 做了什么错误推断。

### Actual System Behavior

系统真实行为是什么。

### Root Cause

为什么 AI 会这么想。

### Recommended Guardrail

建议补在哪一层：

- tool description
- error code
- spec
- tests

### Status

- proposed
- implemented
- verified

## 5. Current Cases

## Case 1: “SSR means hooks cannot be used in preview smoke”

### Context

通过 AI + MCP 提交组件时，AI 看到 publish preview smoke 运行在 Node / SSR-like 环境中，于是主动删除了组件里的 `useState` / `useMemo`。

### Incorrect Inference

AI 的错误推断是：

- preview 在 SSR 中运行
- 因此 React hooks 无法使用
- 所以应该删除 `useState` / `useMemo`

### Actual System Behavior

当前 preview smoke 的真实行为是：

- 在 Node 环境中 bundle 并执行组件
- 用 `react-dom/server` 的 `renderToString(...)` 跑 smoke
- 但 **React hooks 并未被禁用**

仓库中已有测试证明：

- `"use client"` + `React.useState` 会通过
- `useEffect` 会通过

相关文件：

- [lib/registry-preview-smoke.ts](/Users/chenchen/Documents/GitHub/my-app/lib/registry-preview-smoke.ts)
- [lib/registry-preview-smoke.test.ts](/Users/chenchen/Documents/GitHub/my-app/lib/registry-preview-smoke.test.ts)
- [lib/registry-preview-smoke.examples.test.ts](/Users/chenchen/Documents/GitHub/my-app/lib/registry-preview-smoke.examples.test.ts)

### Root Cause

AI 使用了一个通用但错误的简化规则：

- “SSR 不适合 hooks”

并把它误套到了当前系统上。

更深层的根因是：

- 工具描述没有明确写出 “hooks are allowed”
- 错误信息也没有清楚区分“hooks allowed” 与 “browser-only runtime assumptions not allowed”

### Recommended Guardrail

优先补在：

1. MCP tool description
2. preview smoke / publish readiness diagnostics
3. internal agent brief

建议明确增加如下约束：

- Do not remove `useState`, `useMemo`, or other React hooks solely because preview smoke runs in an SSR-like Node render environment.
- Hooks are allowed.
- The real restriction is browser-only logic executed during render, such as direct `window` / `document` access.

### Status

- proposed

## 6. Recommended Next Actions

1. 在 `publish_component` / `diagnose_publish_readiness` 的 MCP tool description 中加入 hooks allowed 的澄清文案
2. 为 preview smoke 常见失败补更细粒度错误归因，减少 AI 自行脑补
3. 将当前已有 smoke 测试中的 `useState` / `useEffect` 例子视为可引用的 ground truth

## 7. Related Docs

- [Preview Third-Party Dependency Governance Spec](./preview-third-party-dependency-governance-spec.md)
- [Preview Artifact Capability Model Spec](./preview-artifact-capability-model-spec.md)
- [Preview Artifact Retrospective](./preview-artifact-retrospective.md)
- [Live Style Preview And Committed Artifact Spec](./live-style-preview-and-committed-artifact-spec.md)
