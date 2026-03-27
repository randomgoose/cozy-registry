Status: proposed
Owner: engineering
Last updated: 2026-03-27
Source of truth: no

# Team Publish Target Spec

## 目的

这份 spec 定义团队发布场景下的目标选择规则，解决当前这条用户路径里的断点：

- 用户可以创建 workspace / team
- 但 agent / MCP 在发布到 team 时，当前依赖 `teamId`
- `teamId` 是系统内部标识，不是适合人类或 agent 直接交互的目标引用

这份文档要回答：

- agent 应该如何发现“我可以发布到哪些 team”
- publish 输入应该使用什么可读目标
- 在没有显式目标时，系统如何 fallback

---

## 一、问题定义

当前 MVP 的 team publish 依赖：

- `publishScope: "team"`
- `teamId`

这有三个问题：

1. `teamId` 不是可读命名空间  
   它是内部主键，不适合作为用户选择目标时的输入。

2. agent 无法天然感知用户有哪些可写 team  
   如果不额外提供 team 列表，agent 只能要求用户手动提供 `teamId`。

3. 当前 active team 不应成为唯一写入依据  
   浏览上下文和写入目标是两件事。只依赖 `activeTeamId` 容易把资源发到错误 team。

因此：

- `teamId` 应继续保留在系统内部
- 但不应继续暴露为 team publish 的主要交互参数

---

## 二、设计原则

### 1. 人类选择 team，系统解析成 `teamId`

团队发布时：

- 人类看到的是 workspace / team 名称
- agent 使用的是可读 target ref
- 服务端最终解析为真实 `teamId`

### 2. 写入目标必须显式优先于浏览上下文

publish / update 这类写入操作：

- 优先使用显式 target
- 只有在没有显式 target 时，才考虑 `activeTeamId`

### 3. 可写 target 应该可枚举

在多 workspace / 多 team 场景下：

- agent 不应凭空猜 team
- 应先通过工具或 API 列出可写 targets
- 然后让用户选择

### 4. canonical ref 与内部主键分离

对外输入 / 输出：

- `@user/item`
- `@org/team/item`

对内落库：

- `user_id`
- `team_id`

---

## 三、canonical publish target

### 3.1 Personal

个人发布目标使用：

- `personal`

资源 canonical ref 仍然是：

- `@userHandle/itemName`

### 3.2 Team

团队发布目标使用：

- `@orgSlug/teamSlug`

资源 canonical ref 则是：

- `@orgSlug/teamSlug/itemName`

说明：

- `organization` 负责顶层命名空间
- `team` 负责团队级资源空间
- `teamSlug` 只要求在 organization 内唯一

---

## 四、publish 输入契约

## 4.1 目标形态

未来的 publish 输入建议支持以下字段：

```ts
type PublishTargetInput =
  | { scope: "personal" }
  | {
      scope: "team";
      targetRef?: `@${string}/${string}`;
      organizationSlug?: string;
      teamSlug?: string;
      teamId?: string;
    };
```

### 推荐优先级

#### 第一优先

- `targetRef`
  - 例如 `@gate/trading`

#### 第二优先

- `organizationSlug + teamSlug`

#### 第三优先（兼容保留）

- `teamId`

说明：

- `teamId` 仍然保留用于向后兼容
- 但它应该从“主交互参数”降级为“内部兼容参数”

---

## 五、target 解析规则

服务端解析 publish target 时，按以下顺序执行：

### 5.1 `scope = "personal"`

直接解析为：

- `{ kind: "personal", userId }`

### 5.2 `scope = "team"` 且显式提供 `targetRef`

例如：

- `@gate/trading`

解析为：

- `organizationSlug = "gate"`
- `teamSlug = "trading"`
- 再解析为真实 `teamId`

### 5.3 `scope = "team"` 且提供 `organizationSlug + teamSlug`

服务端直接解析为 team 实体。

### 5.4 `scope = "team"` 且只提供 `teamId`

允许继续支持，但视为兼容路径。

### 5.5 `scope = "team"` 且没有显式目标

进入 fallback 规则。

---

## 六、fallback 规则

publish 没有显式 team target 时，服务端或 agent 应按下面顺序处理：

### 6.1 如果当前存在 `activeTeamId`

可作为默认 target，但必须满足：

- 当前用户对该 team 有写权限
- 角色为 `owner` 或 `editor`

### 6.2 如果没有 active team，但用户只有一个可写 team

可以默认这个 team。

### 6.3 如果用户存在多个可写 team

不能猜测。应明确要求选择：

- 由 agent 询问用户
- 或由 UI 让用户选择

### 6.4 如果用户没有任何可写 team

返回清晰错误：

- 没有 team publish 权限
- 或需要先创建 / 加入 team

---

## 七、agent / MCP discovery 流程

## 7.1 必要能力

MCP 需要一条只读能力，列出当前用户可写的 publish targets。

建议新增工具：

- `list_publish_targets`

或：

- `list_workspaces`

但建议名称更贴近发布行为，优先使用：

- `list_publish_targets`

## 7.2 返回结构建议

```ts
type PublishTarget = {
  kind: "personal" | "team";
  label: string;
  targetRef: string;
  organizationId?: string;
  organizationSlug?: string;
  organizationName?: string;
  teamId?: string;
  teamSlug?: string;
  teamName?: string;
  role?: "owner" | "editor" | "viewer";
  writable: boolean;
  isActive?: boolean;
};
```

### 示例

```json
[
  {
    "kind": "personal",
    "label": "Personal",
    "targetRef": "personal",
    "writable": true
  },
  {
    "kind": "team",
    "label": "Gate / Trading",
    "targetRef": "@gate/trading",
    "organizationSlug": "gate",
    "organizationName": "Gate",
    "teamSlug": "trading",
    "teamName": "Trading",
    "role": "editor",
    "writable": true,
    "isActive": true
  }
]
```

## 7.3 agent 推荐工作流

对于 publish 场景，agent 应该遵循：

1. 如果用户已明确说出 team 名称  
   - 直接尝试匹配 target
2. 如果没有明确 target  
   - 调用 `list_publish_targets`
3. 如果只有一个可写 team  
   - 可以默认使用
4. 如果存在多个可写 team  
   - 询问用户要发布到哪个 team

这样可以避免：

- agent 直接要求用户输入不可读的 `teamId`
- 或 agent 误将发布写入错误 team

---

## 八、UI 行为建议

### 8.1 Scope switcher

scope switcher 继续负责：

- 浏览上下文切换
- 当前 active team 展示

但它不应该承担：

- team publish target 的唯一来源

### 8.2 Publish UI

无论是 Web publish 还是 Figma Make / MCP：

- 都应该允许用户看到可读的 publish target
- 例如：
  - `Personal`
  - `Gate / Trading`
  - `Gate / Marketing`

### 8.3 当 publish target 缺失时

UI 层也应遵循与 MCP 一致的 fallback：

- active team
- 单一可写 team
- 多个可写 team 时要求显式选择

---

## 九、当前实现状态（2026-03-27）

当前已落地：

- `publishScope: "team"` + `teamId`
- dashboard / collections / settings 的 active team 上下文
- team canonical item ref：
  - `@orgSlug/teamSlug/itemName`

当前仍未落地：

- 使用 `@org/team` 作为 publish target 输入
- `list_publish_targets` MCP 工具
- publish 缺省时的多 team 询问流程

因此当前状态应理解为：

- **team publish 能力已存在**
- **但用户路径还不够顺手**

---

## 十、推荐实现顺序

### Phase 1

- 新增 `list_publish_targets`
- MCP / REST publish 支持 `targetRef = @org/team`
- `teamId` 继续保留兼容

### Phase 2

- 在 Web publish UI 中显示可读 target 选择
- Figma Make / MCP 引导优先使用 targetRef

### Phase 3

- 对多 team 场景加入更明确的 agent 询问策略
- 把 `teamId` 从文档主路径里降级成兼容说明

---

## 一句话结论

团队发布的正确交互应该是：

- **用户选择可读的 workspace / team**
- **agent 使用 `@org/team` 这样的 target**
- **服务端最终解析成 `teamId`**

而不是让用户直接面对内部主键。
