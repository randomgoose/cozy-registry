Status: active
Owner: engineering
Last updated: 2026-04-12
Source of truth: partial

# Preview And Starter Known Issues Retrospective

本文档沉淀最近几轮 preview / starter / thumbnail / project identity 相关问题。

目标不是重复架构 spec，而是记录：

- 当时的用户可见症状
- 误导排查的表象
- 最终根因
- 已采用的修复方式
- 后续应继续遵守的 guardrail

---

## 1. Starter Kit 组件为什么会被降级成 `runtime-only`

### 症状

starter kit 初始化出来的组件在 UI 上显示：

- `Prebundle skipped by policy`
- `Artifact prebundle was skipped by policy because these dependencies are runtime-only: @base-ui/react/dialog, lucide-react.`

### 一开始容易误判的方向

- 误以为是 preview provider 没供上包
- 误以为是 `soft-allowed` / `trusted-built-in` 治理规则还没配好

### 最终根因

starter template 初始化时，只把：

- `files`
- `registryDependencies`

写进了 item/version 快照，

但没有把第三方依赖的 **显式 publish-time version** 一起写入：

- `declaredDependencies`
- `dependencyDecisions`

而当前 preview governance 对 trusted built-in package 的规则是：

- 没有 explicit publish-time version
- 就降级成 `runtime-only`

典型例子：

- `@base-ui/react/dialog` 会被 canonicalize 成 `@base-ui/react`
- `lucide-react` 是 trusted built-in
- 但 starter template 之前没有把它们的显式版本带进 item meta

### 修复

- starter template manifest 增加 `declaredDependencies`
- project initialization 在创建 canonical project item 时，同时传入：
  - `declaredDependencies`
  - `dependencyDecisions`

### Guardrail

凡是由 starter system 物化出的资源，只要源码里带第三方裸模块 import，就必须把对应 explicit versions 一起固化到发布快照里。

---

## 2. Starter Kit 组件为什么会报 `Could not resolve "@/lib/utils"`

### 症状

starter kit 初始化出来的 `Button` / `Dialog` 等组件，artifact build 失败：

- `Could not resolve "@/lib/utils"`

### 一开始容易误判的方向

- 误以为 preview build 的 alias resolver 坏了
- 误以为 artifact worker 没把 `@/` alias 处理到 bundle root

### 最终根因

starter template 源码本身引用了宿主 app alias：

- `@/lib/utils`

但 starter 初始化后生成的是 registry 资源，不会自带宿主 app 的 `lib/utils`。

也就是说，这不是 preview alias resolver 不会工作，而是：

- 模板源码直接依赖了不应成为 starter 资源 contract 的宿主文件

### 修复

- starter templates 改成自带本地 `utils.ts`
- `Button` / `Dialog` 改为 `import { cn } from "./utils"`

### Guardrail

starter template 必须是自描述、可独立物化的资源 bundle，不应引用宿主 app 的：

- `@/lib/*`
- `@/components/*`
- 任何 project 外部 helper

---

## 3. 为什么 runtime preview 能开，artifact preview 却炸在 starter dependency 上

### 症状

`Dialog` 这种依赖 `Button` 的 starter 组件出现：

- `Preview artifact failed`
- `Could not resolve "./_deps/.../button/index"`

同时 runtime route 下有时又能工作，导致现象不一致。

### 一开始容易误判的方向

- 误以为 stub 路径文本写错了
- 误以为 registry dependency ref 解析错了

### 最终根因

runtime route 和 artifact worker 之前并不一致：

- runtime route 会先把 `registryDependencies` resolve 成 graph，再 materialize 成安装布局
- artifact worker 之前只拿 resolved graph 去算 theme / diagnostics，没有把 dependency files 真正铺进 build workspace

所以像 `Dialog -> Button` 这种 starter dependency：

- runtime route 可以先 materialize 再 build
- artifact worker 却直接拿 root files 去 build

结果就是 artifact-only 爆炸。

### 修复

- artifact worker 也改成和 runtime route 一样：
  - resolve registry graph
  - materialize installed registry files
  - 再 build preview bundle

### Guardrail

preview 的两个主入口：

- runtime route
- artifact worker

必须共享同一套 dependency materialization model。不能只共享 theme resolution，却不共享 component dependency installation。

---

## 4. 为什么 starter dependency stub 一开始会生成错误路径

### 症状

starter template dependency stub 一开始生成的是：

- `./_deps/...`

在 project-scoped item 或安装布局下容易落到错误路径。

### 最终根因

stub 使用的是过渡期 `_deps/...` 心智，但系统后续真正稳定下来的依赖物化模型已经转向：

- canonical registry ref
- installed registry layout

两套模型混用时，路径会和最终 bundle root / install root 发生错位。

### 修复

- starter dependency stub 不再生成 `_deps/...` 相对路径
- 改为直接 re-export canonical registry dependency ref

例如：

- `export * from "@indeed-cozy/ds/button"`

后续再由 installed layout rewrite 统一改写到本地相对路径

### Guardrail

只要系统已经有 canonical dependency ref，就不要在 starter layer 再发明一套独立过渡路径协议。

---

## 5. 为什么 project-scoped item 的 installed layout 一开始也会重写错路径

### 症状

project-scoped dependency 在安装布局中会丢失 project 维度，导致重写结果像：

- `@owner/project/name`

最终只被当成：

- `@owner/name`

### 最终根因

`registry-install-layout` 早期的 dependency target index 和 install dir 逻辑没有完整保留：

- `projectKey`

所以 project-scoped canonical item 在 rewrite 时路径和索引都不完整。

### 修复

- installed layout 的 target index、install dir、root entries 全部升级为 project-aware

### Guardrail

一旦系统主身份已经是：

- `owner + project + name`

则所有下游 materialization / rewrite helper 都必须完整携带 project 维度，不能再靠 legacy `owner + name` 心智兜底。

---

## 6. 为什么 thumbnail worker 会截到 `Not found`

### 症状

thumbnail worker 对 private item 截图时，经常得到：

- `Not found`

但同一个 preview URL 在浏览器里又能打开。

### 一开始容易误判的方向

- 误以为对象存储 URL 权限有问题
- 误以为 preview artifact 本身没 ready

### 最终根因

thumbnail worker 访问的是：

- `/preview/...`

而不是直接访问 public object storage。

浏览器里能打开，是因为有登录态。  
thumbnail worker 之前没有：

- session cookie
- Bearer token
- internal auth

所以 private preview 在 app route 层就被当匿名请求处理，返回了 `Not found` 页面，worker 只是忠实地把错误页截图下来。

### 修复

- 增加内部 worker 鉴权通道
- thumbnail worker 请求 `/preview/...` 时带：
  - `x-cozy-internal-job-secret`
  - `x-cozy-request-user-id`
- `/preview/...` 校验 secret 后允许受控访问 private preview

### Guardrail

任何内部异步 worker 如果要访问私有 app route，都不应假设存在用户浏览器会话，必须走明确的 service-to-service auth。

---

## 7. 为什么 thumbnail 已经重新生成，前端还是显示旧图

### 症状

Supabase/object storage 里能看到新截图，但前端仍然显示旧缩略图。

### 最终根因

thumbnail public URL 之前没有内容级 cache busting。

即使同一路径对象被 upsert 成新图：

- 浏览器缓存
- CDN 缓存

仍可能继续展示旧内容。

### 修复

- thumbnail URL 带上 `?v=<generatedAt or content-bust>`

### Guardrail

凡是长期缓存的 public object URL，只要存在同路径覆写，就必须带 cache-busting 参数。

---

## 8. 为什么 preview smoke 会报 `Cannot read properties of null (reading 'useMemo')`

### 症状

MCP / publish path 的 `preview_smoke` 会失败，报：

- `PREVIEW_RENDER_FAILED`
- `Cannot read properties of null (reading 'useMemo')`

### 一开始容易误判的方向

- 误以为 preview smoke “不允许 React hooks”
- 误以为第三方 Slider 组件不支持 SSR

### 最终根因

问题不在“hooks 被禁”，而在 **React runtime 单例分叉**：

- `renderToString` 用的是 host 的 `react-dom/server`
- 但 smoke bundle 里的 `react` / `react/jsx-runtime` 一开始是我们自己拼出来的兼容对象和 shim

对于简单组件这可能勉强工作，但一旦碰到真正依赖 hook dispatcher 的组件，比如 `useMemo`，就会出现：

- renderer 和 component 不是同一套 React runtime
- dispatcher 为空
- 最后报 `Cannot read properties of null`

### 修复

- smoke runtime 改成统一复用 host 的：
  - `react`
  - `react/jsx-runtime`
  - `react-dom/server`
- 不再为 smoke 单独拼 React shim

### Guardrail

只要 preview smoke 要运行真实 React render，就必须保证：

- component runtime
- jsx runtime
- renderer

来自同一个 React 单例来源。

---

## 9. 为什么这些问题会反复出现

### 共性

最近这几类问题有一个共同模式：

1. 构建决策模型本身已经比较清楚
2. 真正出问题的是“不同路径对 contract 的实现不一致”

最典型的几种不一致：

- starter template 以为自己可以引用宿主 app helper
- artifact worker 和 runtime route 对 dependency materialization 不一致
- project-scoped identity 已经升级，但 install layout 还留着 legacy 心智
- thumbnail worker 访问 private preview 时没有 internal auth
- smoke renderer 和 component runtime 没用同一套 React 单例

### 经验

后续碰到类似问题，应该先优先问：

- 这是不是“两个入口实现了两套近似但不相同的 contract”？

而不是先怀疑：

- 单个页面 UI
- 单个 provider 配置
- 单个第三方包本身

---

## 10. 推荐后续 Guardrails

1. preview route 和 artifact worker 尽量复用同一批 helper，而不是只保持“语义相似”
2. starter template 的 lint / validation 应新增：
   - 禁止宿主 alias import
   - 要求显式第三方依赖版本
3. project-scoped identity 相关 helper 必须全链路保留 `projectKey`
4. 内部 worker 访问 private route 必须走 internal auth，而不是借用户 cookie
5. preview smoke 涉及 React render 时，React runtime 必须来自单一来源

---

## References

- [Preview And Project Style Closure Checklist](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/preview-and-project-style-closure-checklist.md)
- [Project Resource Relationship Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/project-resource-relationship-spec.md)
- [Compatible Bundled Delivery Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/compatible-bundled-delivery-spec.md)
