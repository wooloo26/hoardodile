# hoardodile

[English](README.md) | [文档](https://docs.hoardodile.com/)

[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)

hoardodile 是一个隐私优先、自托管的个人媒体与文档归档工具。它按单用户设计，所有数据存放在你自己的机器上，并以不可变的版本化快照保存归档，方便你用任意文件同步工具在多台主机之间同步和迁移。

## 功能特性

- **版本化归档** —— 每个发布的版本会将其文件和数据库快照冻结在 `versions/<v>/` 下；旧版本只读且永不删除
- **插件化内容类型** —— 内置图库、漫画、小说插件；未知文件类型由通用文件插件回退处理
- **组织管理** —— 资源、角色、文档、标签、留言、弹幕、搜索与用量统计
- **单用户认证** —— argon2 哈希密码 + 会话 Cookie，数据不离开你的主机
- **手动备份与换机** —— 用任意工具同步 `versions/` 目录，在应用内备份数据库，然后在新主机上恢复

## 快速开始

环境要求:**Node.js 24** 和 **pnpm**。

```bash
pnpm install
pnpm build

# 一次性初始化:写入管理员密码(可选恢复快照)
pnpm -F @hoardodile/server setup:dev

# 启动服务器(同时托管构建好的 Web 前端)
pnpm -F @hoardodile/server start
```

然后打开 <http://127.0.0.1:3000> 登录。

所有运行时配置均通过环境变量提供，完整列表见 [.env.example](.env.example)(`HOST`、`PORT`、`STORAGE_ROOT`、上传限制、会话设置等)。

## 开发

```bash
pnpm dev        # 同时启动 web + server + 插件 watch(用 DEV_PLUGINS=gallery，manga 选择插件)
pnpm test       # 全部单元/集成测试(Vitest + Turborepo)
pnpm lint       # biome 检查 + 共享写入守卫 + tsc --noEmit
pnpm format     # biome 检查并格式化写入
pnpm db:generate  # 从领域 schema 生成 Drizzle 迁移
pnpm licenses:check    # 校验依赖许可证白名单(CI 中运行)
pnpm licenses:generate # 生成 apps/web/public/licenses.json(web build/watch 时自动执行)
pnpm release    # 发布:bump 并同步版本号、打 tag、push、创建 GitHub Release
```

## 插件

| 插件 | 简介                                              |
| ---- | ------------------------------------------------- |
| 图库 | 内置媒体图库(图片、动图、视频、弹幕、留言)        |
| 漫画 | 漫画阅读器，支持滚动/翻页模式、页内留言与进度恢复 |
| 小说 | 小说阅读器                                        |

未知文件类型由 `packages/plugin-file` 内置回退插件处理。

## 贡献

欢迎提交 issue(bug 报告与功能建议)，但不接受 pull request。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[GPL-3.0](LICENSE)。第三方许可证与字体授权见应用内"设置 → 许可证"。
