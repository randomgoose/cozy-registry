Status: draft
Owner: engineering
Last updated: 2025-02-14
Source of truth: yes

# Engineering Rules

## 1. Owner 与 URL

- 对外 URL、API 和文档优先使用 `handle`
- 所有接受 `owner` 的入口必须兼容 `handle` 和 legacy `userId`
- 进入业务查询前先做 owner resolve，不允许部分路径按 handle、部分路径按 userId 直接查

## 2. Registry Item 语义

- `registry:block` 表示场景块，可自包含
- `registry:component` 表示可复用组件，默认更强调依赖化
- `registry:theme` 表示主题和 tokens，不作为普通 TSX 组件处理

## 3. 发布与版本

- 多文件 item 一旦允许发布，后续升级链路必须同样支持多文件，不能退化成单文件覆盖
- 每次成功发布或升级都必须写入版本快照
- 预览失败不应在静默情况下写入“看似成功但不可消费”的坏数据

## 4. Preview Runtime

- 预览必须在隔离 iframe 中运行
- 预览构建使用的临时资源必须可回收
- 主题注入顺序必须稳定，且 theme 加载失败不应直接导致整个预览接口崩溃

## 5. 文档沉淀

- 长期约束写进 `30-rules`
- 有争议但已经拍板的设计，补一篇 `50-decisions` ADR
- 当前执行项只写进 `40-delivery`
