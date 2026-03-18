Status: active
Owner: engineering
Last updated: 2025-02-14
Source of truth: yes

# 0001 Owner And URL Canonicalization

## 背景

项目早期以 `userId` 作为 owner 标识，后续为了更好的公开链接和可读性，引入了 `handle`。这导致部分入口按 `handle` 工作，部分底层查询仍假设传入的是 `userId`。

## 决策

- 对外展示、安装链接和页面路由以 `handle` 为 canonical owner
- 所有接收 `owner` 的服务端入口都必须先 resolve 到内部 `userId`
- legacy `userId` URL 继续兼容，但不作为主链接继续扩散

## 原因

- `handle` 更适合人读、人记和分享
- `userId` 适合作为内部稳定主键，不适合做主要公开地址
- 统一 canonical owner 后，Web、API、MCP 和 lockfile 语义才会一致

## 后果

- 代码里所有 owner 查询链路都需要统一检查
- 文档和示例应逐步从 `userId` 表述迁移到 `handle`
- 旧链接仍可保留兼容，但新生成的 URL 应只输出 canonical handle
