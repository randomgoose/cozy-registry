Status: proposed
Owner: product
Last updated: 2026-03-24
Source of truth: no

# Team MVP 页面清单

## 目的

这份文档把团队功能的 MVP 范围落实到页面与入口层，回答：

- 第一个可用版本到底要有哪些页面
- 哪些页面是必须做的，哪些可以延后
- 每个页面最小需要承载什么信息与动作

相关文档：

- [team-workspaces-plan.md](./team-workspaces-plan.md)
- [team-data-model.md](../20-engineering/team-data-model.md)
- [team-permission-matrix.md](../20-engineering/team-permission-matrix.md)

---

## 一、MVP 页面设计原则

### 1. 尽量复用现有个人区信息架构

团队功能不应该引入一套完全新的产品路径。

当前个人区已经有：

- dashboard
- collections
- settings

MVP 最合理的方式是：

- 保留这套结构
- 在 scope 切换后，让页面语义从个人变成团队

也就是：

- `My items` -> `Team items`
- `Collections` 继续成立
- `Settings` 继续成立，但变成 team settings

### 2. 让“切换 scope”成为核心入口

对团队功能来说，最重要的不是增加多少个页面，而是：

**让用户始终知道自己当前在哪个 scope 下工作。**

因此 scope switcher 是整个 MVP 的第一优先级入口。

### 3. Team 页面先围绕资产协作，不做重管理后台

MVP 页面重点应该围绕：

- 资源
- collections
- 发布
- 成员

而不是先做复杂设置中心。

---

## 二、MVP 页面总览

建议把团队功能拆成下面 5 个页面/入口：

1. `Scope switcher`
2. `Team dashboard`
3. `Team collections`
4. `Team settings`
5. `Team members`

其中：

- **前 3 个是 Phase 1 必做**
- **后 2 个是 Phase 1.5 / Beta 前优先项**

---

## 三、Phase 1 必做页面

## 3.1 Scope switcher

### 角色

所有登录用户都需要。

### 位置建议

- app header 用户区域附近
- 或现有侧边栏顶部

### 目标

让用户可以在：

- `Personal`
- `Team A`
- `Team B`

之间切换，并且明显感知当前上下文。

### 最小功能

- 显示当前 active scope
- 列出当前用户所属的 teams
- 支持切换到 `Personal`
- 支持切换到某个 `Team`

### MVP 不必做

- 搜索 team
- 最近使用 team
- 多级 organization/team 面包屑

### 为什么它是第一优先级

因为没有 scope switcher，后面所有 team 页面都会显得像“多了一套隐藏功能”，而不是自然扩展。

---

## 3.2 Team dashboard

### 角色

- owner
- editor
- viewer

都应该能看。

### 目标

让用户进入某个 team 后，第一眼看到：

- 这个 team 的资源概况
- 最近更新
- collections 入口
- 团队级发布入口

### 最小内容

- Team 名称 / 简短描述
- 统计卡：
  - total items
  - public / private（如果继续保留这层）
  - collections 数量
- 最近更新项
- `View collections`
- `Publish from Figma Make / Cursor` 入口或引导

### 发布行为说明

MVP 中 team dashboard 上出现的发布入口，不应该只依赖“当前 active team”这个 UI 状态。

更准确的产品语义应该是：

- dashboard 提供当前 scope 的发布入口
- 但 MCP / AI 调用时，发布目标最好仍然可以被显式指定

也就是说：

- `activeTeamId` 可以提供默认发布上下文
- 但最终的 publish 行为应支持显式目标 team

这样可以避免：

- 用户在 UI 中切换过 scope
- AI 工具却在隐式上下文下把资源写到错误 team

### 按角色差异

#### owner / editor

显示：

- 发布入口
- collection 管理入口

#### viewer

隐藏：

- 发布入口
- collection 创建入口

### MVP 不必做

- 活动流
- 团队通知
- 复杂最近协作者展示

---

## 3.3 Team collections

### 角色

- owner
- editor
- viewer

都能看。

### 目标

让 collection 成为：

- 人类组织资源的方式
- AI 范围控制的方式

### 最小内容

- collection 列表
- 每个 collection 的：
  - title
  - slug
  - item count
  - description（可选）
- 进入 collection 详情页或弹层

### 关键动作

#### owner / editor

- 创建 collection
- 编辑 collection
- 添加/移除 item

#### viewer

- 只读浏览

### 为什么它是 Phase 1 必做

因为对 Cozy 来说，collection 不只是“整理功能”，而是团队 AI 范围控制的核心手段。

---

## 四、Phase 1.5 / Beta 前优先页面

## 4.1 Team settings

### 角色

- owner only

### 目标

承载团队级基础配置。

### 最小内容

- Team name
- Team slug
- Team avatar（可选）
- 基础说明文案

### Beta 前建议补充

- team tokens / MCP access
- visibility defaults
- integration hints

### 为什么不是 Phase 1 必做

因为没有它，团队浏览和发布依然能成立；只是 owner 管理体验还不完整。

---

## 4.2 Team members

### 角色

- owner full access
- editor / viewer read-only（可选）

### 目标

承载团队成员查看与角色管理。

### 最小内容

- 成员列表
- 角色展示
- 添加成员（owner）
- 修改角色（owner）
- 移除成员（owner）

### MVP 可选简化

如果 Better Auth 的 organization/team 管理 UI 很成熟，Cozy 第一阶段可以先不单独做完整成员页，而是：

- 先只做简化 members section
- 或直接跳到 settings 下的 members block

---

## 五、建议的页面路径

当前不需要一开始就暴露很多新路由，但建议心里先定住下面这些目标路径：

### Personal scope

- `/dashboard`
- `/collections`
- `/settings`

### Team scope

可以有两种做法：

#### 做法 A：保持当前页面路径不变，用 active scope 决定内容

例如：

- `/dashboard`
- `/collections`
- `/settings`

优点：

- 改动小
- 现有结构延续最好

缺点：

- 链接分享和深链语义较弱

#### 做法 B：引入 team-aware 路径

例如：

- `/t/[team]/dashboard`
- `/t/[team]/collections`
- `/t/[team]/settings`

优点：

- URL 语义清楚
- 更适合后续分享与多 scope 并存

缺点：

- 改动更大

### 当前建议

**Phase 1 先走做法 A。**

也就是：

- 保持现有页面路径
- 用 active scope 决定页面内容

等团队功能跑顺后，再判断是否升级成 team-aware URL。

---

## 六、与当前个人区的映射关系

为了让实现成本最低，建议这样映射：

### 当前个人 dashboard

扩展成：

- personal dashboard
- team dashboard

### 当前 collections page

扩展成：

- personal collections
- team collections

### 当前 settings page

扩展成：

- personal settings
- team settings（owner only）

也就是说，团队功能不是新开一套产品，而是让现在这套个人区变成：

- **scope-aware workspace**

---

## 七、建议的实现顺序

### Step 1

先做 `scope switcher`

### Step 2

让现有 `dashboard` 支持 team scope

### Step 3

让现有 `collections` 支持 team scope

### Step 4

补 team settings

### Step 5

补 members 管理

这个顺序的好处是：

- 每一步都能产出可见价值
- 不需要先把所有后台管理都补完
- 可以先让“team 发布与浏览”成立

---

## 八、当前推荐结论

团队功能 MVP 的页面层，建议先只做三件真正必要的事：

1. `Scope switcher`
2. `Team dashboard`
3. `Team collections`

然后把：

- `Team settings`
- `Team members`

作为紧跟其后的补强项。

这样可以让产品尽快从“个人 registry”升级成“团队 registry”，同时避免一开始陷入过重的后台和管理系统建设。

---

## 一句话总结

**团队功能 MVP 不需要很多新页面，但必须把 scope 切换、team dashboard 和 team collections 做扎实。**

只要这三块成立，Cozy Registry 就能真正从个人工具迈向团队工作流。
