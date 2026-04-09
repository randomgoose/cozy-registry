Status: discussion
Owner: engineering
Last updated: 2026-04-09
Source of truth: no

# Project As Workspace And Publication Unit Discussion Note

## 1. Why This Note Exists

当前系统中的 `project` 已经不只是一个列表过滤条件了。

随着以下能力逐步进入主路径：

- project-scoped identity
- project default theme / theme layers
- preview / docs / artifact 的 project context
- project-first publishing default

`project` 已经开始承担比“资源分组”更强的职责。

这份 note 不是为了立刻拍板一个大方案，而是为了把一个逐渐变清晰的方向先记录下来：

**project 未来是否应该从 namespace / grouping，进一步成长为一个更有结构、更整体性的 workspace-like space，甚至 publication unit。**

## 2. Current State

当前 project 已经具备或正在具备的角色：

### 2.1 Namespace

- registry identity 正在收口到 `owner + project + name`
- project 不再只是展示分组，而是 canonical identity 的一部分

### 2.2 Design Context Boundary

- project 支持默认 theme relationship
- resource 可以追加自己的 theme layers
- preview / artifact / docs 正在共享 project-level style context

### 2.3 Ownership / Organization Boundary

- project 越来越像 owner 之下的一个正式资源空间
- UI、MCP、publish 流程都在向 project-first 收口

也就是说：

**project 现在已经不只是“挂组件的文件夹”，而是在逐步变成“有上下文的系统边界”。**

## 3. The Intuition Behind The Next Step

当前 item 模型在很多真实场景里会显得过于零散。

例如一个 project 里可能同时包含：

- `registry:theme`
- `registry:ui`
- `registry:block`
- chart tokens
- components token layers
- docs page
- story gallery
- future icons / typography / docs config

这些资源并不是一堆互不相干的条目，而更像共同构成了一个：

- design system
- workspace
- library
- publication surface

因此会自然出现一个问题：

**project 是否应该被正式看作一个更有结构和整体性的空间，而不只是 item 的命名空间。**

## 4. Three Ways To Think About Project

### 4.1 Project as Namespace

这是当前已经成立的层：

- identity boundary
- naming boundary
- canonical grouping

它解决的是：

- 资源归属
- 同名 item 的合法并存
- canonical ref

### 4.2 Project as Workspace

这是当前正在隐约形成、但还没正式建模的层：

- project 不只是“包含很多 item”
- project 还应包含这些 item 之间更强的结构关系

它可能表达：

- 默认 theme layers
- docs / story grouping
- 默认资源关系
- project-level config
- 资源分组与导航结构

它解决的是：

- 整体性
- 可理解性
- design system 的项目级视图

### 4.3 Project as Publication Unit

这是更进一步、但很值得提前记录的方向：

- publish 不只围绕单个 item
- project 也可能成为一个整体被浏览、预览、同步、导出、安装的单位

它可能意味着：

- project overview
- project docs
- project stories
- project snapshot / release
- project-level install / sync surface

它解决的是：

- “设计系统不是一堆零散组件，而是一个整体”

## 5. Why This Might Matter

### 5.1 More Faithful To Real Team Work

团队通常维护的不是单颗粒 item，而是：

- 一个 design system
- 一个 marketing system
- 一个 dashboard system

project 作为 workspace / publication unit 更符合这种现实。

### 5.2 Better System-Level Defaults

很多规则其实是 project 级别的，而不是 item 级别的：

- default theme layers
- docs structure
- story grouping
- default install context
- project-specific conventions

### 5.3 Better Preview / Docs / Story Experience

如果 project 有更强的整体语义，后面很多能力会更自然：

- project overview page
- project docs shell
- story index / docs navigation
- shared preview context

### 5.4 Better AI / Agent Reasoning

AI 更容易理解：

- 这个资源属于哪个系统
- 应该继承什么上下文
- 这个 project 的“正式空间”里还有哪些相关资源

相比一堆零散 item，这种工作区语义更容易被稳定推理。

## 6. What This Does Not Mean Yet

这条方向不等于：

- 现在就把 project 做成完整文件系统
- 现在就做 monorepo / IDE / browser code workspace
- 现在就把 item publish 废掉

这份 note 的重点不是“做一个很重的 workspace 产品”，而是：

**承认 project 未来可能成长为一个更强的结构边界与 publication surface。**

## 7. A Possible Evolution Path

### Phase A: Project as Structured Space

先做到：

- canonical namespace
- default theme layers
- project-level resource relationships
- story / docs grouping
- project manifest / config

这时 project 已经比“标签”强很多，但还不重。

### Phase B: Project as Workspace Metadata Container

再加入：

- project docs navigation
- project defaults / presets
- project-level preview / install conventions
- richer grouping and structure metadata

### Phase C: Project as Publication Unit

如果未来有足够需求，再考虑：

- project-level export / import
- project snapshot / release
- project install / sync surface
- project-level review / promotion flow

## 8. Key Open Questions

未来讨论这条方向时，最值得先拍板的不是具体实现，而是这些问题：

1. `project` 的最长期待角色是什么：
   - namespace
   - workspace
   - publication unit
   - 还是三者兼有但分阶段演进

2. project-level publication unit 是否应成为正式产品概念，而不只是内部组织概念

3. 哪些能力应继续留在 item 级：
   - versioning
   - install
   - preview
   - dependency graph

4. 哪些能力未来应可以 project-level 汇总：
   - docs
   - stories
   - theme layers
   - install suggestions
   - snapshot / release

5. 这条方向与 current project-first publishing、theme layers、multi-story preview 的关系如何收口成一个更统一的模型

## 9. Working Thesis

当前最值得保留的一句工作假设是：

**project 不应只被视为资源命名空间，而应逐步成长为一个有结构的设计系统空间；长期甚至可能成为 publication unit。**

这不是立刻要做的承诺，但值得作为后续 design discussion 的主线之一。

## 10. Related Docs

- [Project-Scoped Registry Identity Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/project-scoped-registry-identity-spec.md)
- [Project-First Publishing Default Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/project-first-publishing-default-spec.md)
- [Project Resource Relationship Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/project-resource-relationship-spec.md)
- [Multi-Story Preview Page Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/multi-story-preview-page-spec.md)
