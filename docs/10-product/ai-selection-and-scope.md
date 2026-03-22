Status: active
Owner: product
Last updated: 2026-03-22
Source of truth: yes

# AI 选型与范围控制

## 目的

这份文档用于明确 Cozy Registry 在 AI 时代的两个核心出发点，并说明我们当前能做到什么、还缺什么、下一步优先做什么。

它回答的问题是：

- Cozy Registry 和 21st.dev 这类组件发现平台到底有什么不同
- AI 是否已经能在大量组件中稳定选出合适的资源
- 人类如何给 AI 设定一个安全、可控的选择范围
- MVP、Beta 与更长期阶段各自应该把重点放在哪里

---

## 一、产品的两个核心出发点

### 1. 人类把 Cozy Registry 当成 AI 时代的组件 Registry

Cozy Registry 不只是一个网页上的组件画廊，而是一个可以被 AI 工具直接消费的 source-native registry。

这里的核心含义是：

- 资源是源码级资产，而不是单纯的视觉展示
- 资源可以被 MCP 工具读取、筛选、安装、升级和分析
- Figma Make、Cursor、后续更多支持 MCP 的工具都应该能直接接入

### 2. AI 通过 MCP 快速理解并调用组件

第二个出发点不是“AI 也能看这个网站”，而是：

- AI 能拿到结构化资源信息
- AI 能读取 bundle、元数据和范围约束
- AI 能在受控空间里做选择，而不是无边界乱选

这个方向成立后，Cozy Registry 的价值就不只是“发现组件”，而是“让组件真正进入 AI 工作流”。

---

## 二、与 21st.dev 的关系：像，但不止于像

从表面体验看，Cozy Registry 和 21st.dev 很像：

- 都有组件/区块浏览
- 都强调可复用 UI
- 都支持“浏览 -> 选中 -> 使用”

但底层定位不同。

### 21st.dev 更偏发现平台

它更像：

- 灵感发现
- 组件发现
- 人类浏览和挑选

### Cozy Registry 更偏 AI-native 分发与操作层

它更像：

- source-native registry
- AI 工具的可调用资产层
- 发布、安装、升级、项目分析的一部分

一句话区分：

- **21st.dev 更偏 discover**
- **Cozy Registry 更偏 connect + publish + install + upgrade**

因此我们不能把自己讲成“另一个 21st.dev”，而应该明确讲成：

**一个既给人浏览、也给 AI 工具直接调用的 source-native registry。**

---

## 三、当前 AI 能力的真实状态

## 3.1 已经能做到的部分

当前 Cozy Registry 已经具备：

- 列表与详情读取
- component / block / theme 的 bundle 拉取
- collection 维度的组织方式
- install / analyze / status / planning 这类 MCP 能力
- Figma Make / Cursor 等工具的 MCP 接入路径

这意味着：

- AI 已经能看有哪些资源
- AI 已经能读取某个资源的源码和元数据
- AI 已经能在一定程度上参与安装和升级流程

## 3.2 还做不到“完全放心交给 AI 自由挑选”

当前还不能说 AI 已经能在成百上千组件里稳定、可靠地自己选出最合适的资源。

原因不在于“没有 MCP”，而在于检索层还不够强：

- 缺少更稳定的语义 metadata
- 缺少更明确的范围约束
- 缺少专门给 AI 的 search / recommend 能力
- 组件 title/name 仍然会让 AI 误判用途

所以当前更准确的判断是：

- **在小规模、强约束场景里，AI 选型已经部分可用**
- **在大规模、开放式场景里，AI 选型还不够稳**

---

## 四、为什么“范围控制”比“大规模自由搜索”更重要

如果直接让 AI 在全库中自由挑选，它最容易犯的错误是：

- Landing page 任务误选 dashboard block
- marketing 页面误选 app shell 组件
- 按标题猜用途，忽略真正上下文
- 被某些高曝光组件吸引，而不是选最合适的

所以我们当前更应该强调的不是：

- “AI 已经会自己找最优组件”

而是：

- **人类先限定设计空间，AI 在这个空间里选择**

这条原则对 MVP 尤其重要。

一句话概括：

**Humans define the design space. AI chooses within it.**

---

## 五、Collection-first：MVP 最关键的约束方式

## 5.1 Collection 的角色

Collection 不只是“方便人类整理资源”，更是 AI 的第一层选择边界。

例如：

- `landing-sections`
- `dashboard-blocks`
- `commerce-ui`
- `marketing-heroes`

当人类明确告诉 AI：

- “只在这个 collection 里选”

AI 的出错空间就会明显缩小。

## 5.2 我们当前应该把 Collection 产品化成什么

在当前阶段，Collection 应该被明确当成：

- 人类给 AI 的范围控制器
- AI 选型时最重要的 guardrail

这意味着我们后续应该强化这类体验：

- “只使用某个 collection 内的资源”
- “按某个 collection 规划页面”
- “让 AI 在 collection 内推荐候选”

## 5.3 为什么 Collection-first 值得先做

因为它比“大规模语义搜索”更容易先做稳，而且对结果控制更强。

Collection-first 的优势：

- 对人类直观
- 对 AI 约束强
- 对 MVP 可解释
- 能立即降低乱选风险

---

## 六、长期能力：Collection 不够，还需要语义层

仅靠 collection 还不够，因为同一个 collection 内部仍然可能有多种用途的资源。

长期来看，还需要增加一层更适合 AI 检索的 metadata。

建议分成两类：

### 1. 人工组织层

用于人为管理和授权边界：

- collections
- ownership
- policy
- visibility

### 2. 语义检索层

用于 AI 理解“适合什么场景”：

- tags
- intent / use-case
- short summary
- design domain
- maybe layout characteristics

例如未来可以有：

- `marketing`
- `application`
- `dashboard`
- `editorial`
- `commerce`
- `auth`
- `hero`
- `form`
- `pricing`

这样 AI 的选择就不只靠 title/name 猜，而是有正式语义约束。

---

## 七、推荐的产品演进顺序

## 7.1 现在就做

这些是当前最值得做的：

- 把 Collection 明确产品化为 AI 范围控制器
- 继续让 Figma Make / Cursor 先走“有范围的 AI 选择”
- 为组件补更适合 AI 理解的基础 metadata
- 保持 MCP 的 source-native 能力稳定

目标不是“全库智能搜索”，而是：

**先让受控空间里的 AI 选择变得可靠。**

## 7.2 Beta 前做

这些是 Beta 前后最值得补的：

- 更稳定的 tags / use-case 字段
- collection-scoped recommendation 能力
- AI 侧更明确的范围传参
- 更强的页面规划/安装建议能力

例如未来更理想的 MCP 能力是：

- `search_components`
- `recommend_components_for_task`
- `recommend_components_in_collection`

## 7.3 更长期再做

这些可以放到更后面：

- 大规模语义搜索与排序
- 跨 collection 的智能推荐
- 更细粒度的兼容性 / design intent / layout metadata
- 更复杂的 ranking、embedding 或 retrieval 层

---

## 八、当前阶段的明确结论

### 1. 第二个出发点是成立的

“AI 能通过 MCP 快速理解并调用组件”这个方向本身是成立的。

但当前更适合的表达不是：

- “AI 已经能在海量资源中自由且稳定地选型”

而是：

- **AI 已经可以在受控范围内读取、理解并选择资源**

### 2. MVP 不应追求“无限开放搜索”

MVP 阶段的重点不该是：

- 让 AI 在全库自由找一切

而应该是：

- 让人先限定范围
- 让 AI 在范围内稳定选择

### 3. 这是 Cozy Registry 的长期差异化

Cozy Registry 的长期差异化不是：

- 组件数量更多
- 画廊更花哨

而是：

- 让人类控制设计空间
- 让 AI 在这个空间中直接消费 source-native UI 资产

一句话总结：

**Cozy Registry gives humans control over the design space, and gives AI direct access to source-native UI assets inside that space.**

---

## 九、对外表达建议

当前对外描述不建议只强调：

- component gallery
- UI library
- design inspiration

更建议强调：

- AI-native registry
- source-native UI assets
- works with MCP tools
- human-scoped, AI-assisted selection

更贴近当前阶段的表达可以是：

> Cozy Registry is not just a gallery. It is a source-native registry that design tools and coding agents can actually use.

或中文版本：

> Cozy Registry 不是单纯的组件画廊，而是一个可被设计工具与编码 agent 直接调用的 source-native registry。

