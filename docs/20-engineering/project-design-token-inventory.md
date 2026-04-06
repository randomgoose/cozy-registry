# 项目常用 Design Token 提取

更新时间：2026-04-05

## 目的

先把项目里**已经形成共识**、**正在被复用**、以及**高频但尚未语义化**的 design token 拆出来，作为后续沉淀 `tokens.json`、Figma Variables、或统一主题包的输入。

本次提取主要基于：

- `app/globals.css` 里的全局主题变量
- `components/ui/*` 里的基础组件实现
- `app/*` 页面层里重复出现的颜色、圆角、阴影、间距、渐变

---

## 1. 已正式存在的 Foundation Tokens

### 1.1 Typography

当前已经正式定义的字体 token：

- `--font-sans`: `"Inter", "Helvetica Neue", "Segoe UI", sans-serif`
- `--font-mono`: `"SFMono-Regular", "SF Mono", "Menlo", "Consolas", monospace`

观察：

- `font-sans` 已是全局默认字体。
- 代码里高频文字层级实际是 `text-xs/relaxed`、`text-sm`、`font-medium`、`font-semibold`。
- 目前“字重/字号/行高”更多还是直接用 Tailwind utility，而不是独立 typography token。

### 1.2 Core Semantic Colors

这组已经是项目当前最明确的语义色 token：

- `background`
- `foreground`
- `card`
- `card-foreground`
- `popover`
- `popover-foreground`
- `primary`
- `primary-foreground`
- `secondary`
- `secondary-foreground`
- `muted`
- `muted-foreground`
- `accent`
- `accent-foreground`
- `destructive`
- `border`
- `input`
- `ring`

特点：

- Light / dark 两套值都已在 `app/globals.css` 中定义。
- 基础组件已经普遍消费这套语义 token，而不是直接写具体色值。
- 这组 token 可以视为当前 design system 的最小稳定核心。

### 1.3 Extended Semantic Colors

除了 core semantic colors，项目里还有三组已经成形的扩展 token：

#### 图表色

- `chart-1`
- `chart-2`
- `chart-3`
- `chart-4`
- `chart-5`

#### Sidebar 语义色

- `sidebar`
- `sidebar-foreground`
- `sidebar-primary`
- `sidebar-primary-foreground`
- `sidebar-accent`
- `sidebar-accent-foreground`
- `sidebar-border`
- `sidebar-ring`

#### On-inverse / frosted-dark panel 语义色

这组非常值得保留，因为已经明显承担“深色浮层 / 反相控件”语义，而不只是普通 dark mode：

- `on-inverse-fg`
- `on-inverse-muted-fg`
- `on-inverse-border`
- `on-inverse-surface`
- `on-inverse-surface-hover`
- `on-inverse-surface-active`
- `on-inverse-ring`
- `on-inverse-popover`
- `on-inverse-popover-fg`
- `on-inverse-popover-border`

观察：

- `on-inverse-*` 已被 `Input`、`Select`、`PreviewPropsDebugPanel` 明确复用。
- 这说明项目实际上已经有“默认 surface”之外的第二套 surface system。

### 1.4 Radius Scale

当前 radius 已经具备完整比例系统：

- `--radius`: `0.625rem`
- `--radius-sm`: `0.375rem`
- `--radius-md`: `0.5rem`
- `--radius-lg`: `0.625rem`
- `--radius-xl`: `0.875rem`
- `--radius-2xl`: `1.125rem`
- `--radius-3xl`: `1.375rem`
- `--radius-4xl`: `1.625rem`

观察：

- 组件层最常用的是 `rounded-md`。
- 页面层最常见的是 `rounded-lg`、`rounded-xl`、`rounded-2xl`、`rounded-full`。
- 目前语义和使用场景之间还没有一一对应，例如 `control / panel / dialog / pill / hero-shell` 还未命名。

---

## 2. 组件层已经稳定的高频 Token 用法

这部分不是全局变量本身，而是已经在组件中稳定复用的“准 token 约定”。

### 2.1 控件尺寸

`Button`、`Input`、`Select` 已形成稳定的 control size 体系：

- `h-5`
- `h-6`
- `h-7`
- `h-8`

可理解为：

- `control-xs`
- `control-sm`
- `control-md`
- `control-lg`

### 2.2 控件内边距与密度

高频值主要集中在：

- `px-2`
- `px-2.5`
- `py-0.5`
- `py-1`
- `py-1.5`
- `gap-1`
- `gap-1.5`
- `gap-2`

说明当前 UI 的基础密度偏紧凑，适合工具型后台和 inspector / picker 场景。

### 2.3 文字层级

组件层最稳定的文字模式：

- `text-xs/relaxed`
- `text-sm`
- `font-medium`
- `font-semibold`

可以初步理解为：

- `label / control / menu / helper` 主要落在 `xs`
- 页面正文说明更多使用 `sm`
- 标题与 section heading 则常用 `font-semibold`

### 2.4 Surface 模式

基础组件已经出现三类清晰的 surface：

#### Default surface

- `bg-background`
- `bg-popover`
- `bg-input/20`
- `border-input`
- `ring-foreground/10`

#### Subtle fill surface

- `bg-muted/90`
- `bg-muted/80`
- `bg-muted/55`
- `bg-muted/45`

#### Inverse / overlay surface

- `bg-on-inverse-surface`
- `bg-on-inverse-surface-hover`
- `bg-on-inverse-surface-active`
- `bg-on-inverse-popover`
- `border-on-inverse-border`
- `ring-on-inverse-ring/*`

这说明后续 token 结构不应该只有 `color.*`，还应考虑 `surface.*` 或 `layer.*`。

### 2.5 Popup / floating UI 模式

Dropdown / Select / Dialog 已经隐含两套浮层约定：

#### 常规浮层

- `bg-popover`
- `text-popover-foreground`
- `shadow-md`
- `ring-1 ring-foreground/10`
- `rounded-lg`

#### Inverse 浮层

- `bg-on-inverse-popover`
- `text-on-inverse-popover-fg`
- `ring-1 ring-on-inverse-popover-border`
- `shadow-xl`
- `rounded-lg`

这是一组非常适合被正式命名为 token recipe 的模式。

---

## 3. 页面层高频但尚未沉淀为语义 Token 的候选

这部分是“重复很多，但还主要靠原子 class 直接写”的值，适合作为下一轮抽象对象。

### 3.1 Neutral palette 候选

页面层大量直接使用 `zinc` 色阶，尤其集中在：

- `zinc-50`
- `zinc-100`
- `zinc-200`
- `zinc-300`
- `zinc-400`
- `zinc-500`
- `zinc-600`
- `zinc-700`
- `zinc-800`
- `zinc-900`
- `zinc-950`

这些值已经明显承担了：

- 页面背景
- 卡片边框
- 次级文字
- 深色按钮
- dark panel 背景

建议后续至少补出一层语义映射，例如：

- `content.subtle`
- `content.muted`
- `border.subtle`
- `surface.raised`
- `surface.overlay`

而不是继续在页面里直接扩散 `zinc-*`。

### 3.2 Warm / amber palette 候选

`amber` 在首页与发布页里已经承担品牌高光和提示语义：

- `amber-50`
- `amber-100`
- `amber-200`
- `amber-300`
- `amber-500`
- `amber-700`
- `amber-800`
- `amber-900`

它当前混合承担了两种角色：

- 品牌暖色高光 / hero 装饰
- warning / empty-state / setup hint

这两种语义最好拆开，否则以后会互相污染。

### 3.3 状态色候选

除了 `destructive` 语义色，页面层还在直接用：

- `red-400`
- `red-600`

说明错误态目前仍然是“基础组件语义化了，页面态还没完全语义化”。

### 3.4 特殊 surface / overlay 候选

下面这些模式在页面和 debug panel 中已经比较突出：

- `bg-zinc-950/90`
- `bg-zinc-950/92`
- `border-white/20`
- `backdrop-blur-md`
- `shadow-lg`

这类值更像：

- `surface.overlay-strong`
- `surface.overlay-frosted`
- `border.overlay`

目前它们还没有统一命名。

### 3.5 大圆角与营销壳层候选

页面层明显比组件层更常用大圆角：

- `rounded-2xl`
- `rounded-[28px]`
- `rounded-[32px]`
- `rounded-full`

这说明当前至少存在两套 radius 语义：

- 组件 / 控件半径
- 页面容器 / hero / marketing shell 半径

后续适合拆成：

- `radius.control`
- `radius.panel`
- `radius.dialog`
- `radius.hero`
- `radius.pill`

### 3.6 渐变与玻璃感候选

首页已经有很明确的视觉语言，但还没有 token 化：

- warm radial glow
- light glass gradient
- dark glass gradient
- inset highlight shadow

它们不一定适合放进最底层 theme token，但适合进入更高一层的：

- `effect.hero-glow`
- `effect.glass-panel`
- `effect.panel-highlight`

或作为 recipe token / semantic recipe 维护。

---

## 4. 当前可以认定的“项目常用 Token 集”

如果只提炼一版最实用、最能代表当前项目的 token 集，建议先认定下面这些已经成熟：

### 必保留

- `font-sans`
- `font-mono`
- `background`
- `foreground`
- `card`
- `card-foreground`
- `popover`
- `popover-foreground`
- `primary`
- `primary-foreground`
- `secondary`
- `secondary-foreground`
- `muted`
- `muted-foreground`
- `accent`
- `accent-foreground`
- `destructive`
- `border`
- `input`
- `ring`
- `sidebar-*`
- `chart-*`
- `on-inverse-*`
- `radius-sm` 到 `radius-4xl`

### 已形成组件约定，建议补成结构化 token

- control heights: `5 / 6 / 7 / 8`
- control padding: `px-2`, `px-2.5`, `py-0.5`, `py-1`, `py-1.5`
- text density: `text-xs/relaxed`, `text-sm`
- popup surface recipe
- inverse panel recipe

### 下一批优先抽象

- neutral semantic mapping（从大量 `zinc-*` 中提炼）
- warm brand / warning 区分（从 `amber-*` 中拆语义）
- overlay / frosted surface token
- marketing / hero effect token
- 大圆角容器 token

---

## 5. 网站内背景语义 Token 建议

如果只服务当前网站，不引入额外 `tokens.json`，那背景层建议直接在 `globals.css` 里沉淀为下面这组语义：

- `bg-canvas`: 整个页面的底布背景
- `bg-surface`: 默认卡片 / section / header 背景
- `bg-surface-field`: 表单输入区背景
- `bg-surface-muted`: 次级填充、小标签、avatar、轻量 hover 面
- `bg-surface-subtle`: inset 区域、说明块、弱对比容器
- `bg-surface-inverse`: 反相强调背景，例如深色按钮 / 亮色 dark button
- `bg-surface-overlay`: 浮层、菜单、glass panel 主背景
- `bg-surface-overlay-soft`: 更轻的玻璃卡片背景
- `bg-surface-overlay-inverse`: 始终偏暗的 overlay 背景
- `bg-scrim`: 遮罩层背景
- `bg-surface-warning-soft`: warning / setup hint / 暖色提示
- `bg-surface-success-soft`: success 提示
- `bg-surface-danger-soft`: error 提示
- `bg-surface-info-soft`: info 提示

这样做的目的不是增加抽象层，而是把当前散落在页面中的：

- `bg-zinc-50 / 100 / 900 / 950`
- `bg-white`
- `bg-white/88`
- `bg-zinc-950/90`
- `bg-amber-50`
- `bg-emerald-50`
- `bg-red-50`

先收敛成网站内部能复用的语义层。

---

## 6. 推荐的下一步

如果当前只服务这个网站，建议按下面顺序推进，而不是一次性把所有页面色值都收进 token：

1. 先把 `app/globals.css` 里的语义 token 继续作为唯一真相源，优先补齐网站内部缺的 `surface` / `overlay` / `status` 背景层
2. 为组件层补一层结构化 token 清单：`control`, `surface`, `content`, `border`, `radius`
3. 再从页面层抽取 `zinc` / `amber` 高频模式，映射成语义 token，而不是直接保留 raw palette
4. 最后再决定哪些渐变、阴影、玻璃效果进入全局 token，哪些保留在 recipe 层

如果未来要把 theme 当成可发布资产、或要和 Figma / MCP 交换 token，再考虑补一份 canonical `tokens.json`。

---

## 7. 这次提取的结论

这个项目并不是“还没有 design token”，而是已经有了：

- 一套比较完整的全局 semantic color token
- 一套很有价值的 inverse surface token
- 一套隐含但尚未命名的控件尺寸 / 面板 recipe

真正缺的不是基础 token，而是：

- 页面层对语义 token 的继续收敛
- neutral / warm palette 的语义映射
- surface / overlay / effect 这些更高层 token 的结构化命名

也就是说，下一步更像是 **整理与升级现有 token system**，而不是从零开始设计。
