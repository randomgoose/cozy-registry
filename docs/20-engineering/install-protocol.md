Status: draft
Owner: engineering
Last updated: 2025-02-14
Source of truth: yes

# Install Protocol

## 目标

Cozy 的安装协议用于定义：

- 一个 registry item 被安装到项目后，项目里必须留下哪些结果
- 后续如何识别当前安装版本
- 如何进行 `check` 和 `upgrade`

这套协议是 **Cozy-specific** 的项目侧协议，不是 shadcn 官方标准的一部分。

兼容性原则：

- **Registry item format** 继续保持 shadcn-compatible
- **Project install state** 由 Cozy 自己定义和读取

## 协议原则

### 1. 双入口，单协议

安装动作可以由不同执行者完成：

- AI agent / MCP
- Cozy CLI
- 未来 IDE 插件

但执行结果必须一致。

### 2. lockfile 是 source of truth

项目安装状态的唯一真相是：

`cozy-registry.lock.json`

代码头注释只作为：

- 文件级可读标记
- AI 扫描提示
- lockfile 丢失时的降级恢复线索

### 3. 面向 bundle

协议优先服务 `registry:block` bundle：

- 多文件
- 相对 import
- 本地样式文件
- 辅助实现文件

不能只按单文件组件来设计。

## 安装结果

安装一个 item 后，项目里必须存在三类结果：

1. 资产源码文件
2. 项目级安装记录
3. 文件级来源标记

## 项目级 lockfile

文件名固定：

`cozy-registry.lock.json`

### 最小结构

```json
{
  "version": 1,
  "items": {
    "@acme/hero-section": {
      "type": "registry:block",
      "version": "0.3.0",
      "source": "https://registry.example.com/api/r/acme/hero-section?v=0.3.0",
      "installedFiles": [
        "src/registry/acme/hero-section/index.tsx",
        "src/registry/acme/hero-section/webgl.ts",
        "src/registry/acme/hero-section/styles.css"
      ],
      "installedAt": "2025-02-14T10:30:00.000Z"
    }
  }
}
```

### 必填字段

- `version`
- `items`
- `items[@owner/name].type`
- `items[@owner/name].version`
- `items[@owner/name].source`
- `items[@owner/name].installedFiles`

### 可选字段

- `installedAt`
- `registryDependencies`
- `themeDependencies`
- `meta`

## 文件级注释头

只要求写在安装产物的主入口文件。

格式固定：

```ts
// cozy-registry: @acme/hero-section v0.3.0
```

说明：

- 不要求每个辅助文件都写
- 主要用于人读和 AI 局部扫描

## 默认安装路径

Phase 1 建议采用稳定默认路径：

```text
src/registry/{owner}/{name}/...
```

例如：

```text
src/registry/acme/hero-section/index.tsx
src/registry/acme/hero-section/webgl.ts
src/registry/acme/hero-section/styles.css
```

原因：

- 便于升级覆盖
- 便于从 lockfile 反查实际文件
- 降低 AI / CLI 实现复杂度

## 动作协议

Phase 1 定义 3 个核心动作：

### `add`

作用：

- 首次安装一个 registry item 到项目

输入：

- `coordinate`: `@owner/name`
- `version?`
- `targetDir?`

行为：

1. 拉取指定版本，未指定则拉取当前版本
2. 将 bundle 写入项目目录
3. 在入口文件写注释头
4. 更新 `cozy-registry.lock.json`

`install_component_bundle` 的返回结果至少应明确包含：

- `protocolApplied`
- `lockfileUpdated`
- `lockfilePath`
- `entryCoordinate`
- `installedFiles`

当前 MCP 工具对应：

- `plan_component_install`
- `install_component_bundle`

### `check`

作用：

- 检查项目里已安装项是否有更新

行为：

1. 读取 lockfile
2. 查询 registry 当前版本
3. 比较已安装版本和最新版本

输出至少应包含：

- `coordinate`
- `installedVersion`
- `latestVersion`
- `upgradable`
- `hasConflicts`（若系统已检测到本地改动风险）

当前 MCP 工具对应：

- `get_project_registry_status`
- `check_component_update`
- `check_project_updates`

### `upgrade`

作用：

- 将某个已安装项切换到目标版本

输入：

- `coordinate`
- `toVersion?`

行为：

1. 读取 lockfile 找到已安装项
2. 读取当前已安装版本对应的 registry bundle，作为升级基线
3. 拉取目标版本 bundle
4. 对 `installedFiles` 执行冲突检测
5. 无冲突时覆盖文件并更新入口文件注释头
6. 更新 lockfile 版本信息

当前 MCP 工具对应：

- `upgrade_component_in_project`

## 升级冲突策略

### Phase 1 策略：保守升级

Phase 1 采用保守升级策略：

- **默认不静默覆盖用户改过的本地文件**
- **检测到冲突时停止升级**
- **仅在显式 `force` 模式下允许覆盖**

### 为什么采用保守升级

原因：

- Cozy 是源码分发，不是运行时包管理
- 用户安装后很可能继续修改本地文件
- 若升级时静默覆盖，会直接吃掉本地改动
- 复杂三方合并在 Phase 1 成本过高且不稳定

### 冲突检测规则

对于 lockfile 中某个安装项：

1. 找到当前安装版本 `installedVersion`
2. 拉取该版本的 registry bundle，作为“基线快照”
3. 读取项目当前本地文件
4. 读取目标升级版本 bundle
5. 对每个 `installedFile` 比较：

- 如果本地文件内容等于基线快照  
  说明该文件未被本地修改，可以安全升级

- 如果本地文件内容不等于基线快照  
  说明该文件已被本地修改，标记为冲突

### 冲突时的默认行为

- 输出冲突文件列表
- 停止升级
- 保持 lockfile 和本地文件不变

### `force` 模式

Phase 1 允许显式 `force` 升级：

- 用户明确确认覆盖本地改动
- 系统可覆盖冲突文件
- 风险由执行者承担

AI / MCP 在执行 `force` 前，必须先向用户明确说明：

- 哪些文件存在冲突
- 覆盖后会丢失哪些本地改动

### Phase 1 不做的事情

- 自动三方合并
- 复杂 patch 生成
- 图形化冲突解决器
- 对 TSX / CSS / WebGL 文件做“智能 merge”

## shadcn add 的定位

`shadcn add` 可以继续作为兼容安装入口，但不作为 Cozy 完整升级闭环的主入口。

原因：

- 它可以拉取源码
- 但不能天然保证写入 Cozy lockfile
- 也不能天然保证后续升级链路一致

因此：

- **shadcn add**：兼容消费入口
- **Cozy install protocol**：升级闭环主协议

## 后续待定问题

- bundle 文件删除与 orphan file 清理策略
- `registry:theme` 的安装与升级是否与 block 共用同一协议
- AI / CLI / IDE 三种执行入口的优先级和 UX 差异
- `force` 升级后的备份策略
