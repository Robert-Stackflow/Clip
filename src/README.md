# 源码导航

源码按 Electron 进程分层；生成物在 `dist/`，原生编译缓存与测试数据在 `work/`。构建入口见 [bundle-options.mjs](../scripts/bundle-options.mjs) 和 [build.mjs](../scripts/build.mjs)，架构边界见 [设计](../docs/development/设计.md)。

| 目录 | 入口与职责 |
| --- | --- |
| `main/` | [index.ts](main/index.ts)：应用生命周期、窗口与 IPC 组合；功能服务保存在同层模块 |
| `preload/` | [index.ts](preload/index.ts) 及各窗口同名入口：固定 bridge 接口 |
| `renderer/` | [app.ts](renderer/app.ts)、[index.html](renderer/index.html)：主界面；其余窗口使用独立页面与共享组件 |
| `shared/` | [types.ts](shared/types.ts)、[core.ts](shared/core.ts)：类型和输入校验；[i18n.ts](shared/i18n.ts) 与 `locales/` 管理语言 |
| `web/` | 网页共享访问端 |

## 按功能定位

| 功能 | 主进程模块 |
| --- | --- |
| 剪贴板采集与原生操作 | [clipboard.ts](main/clipboard.ts)、[native.ts](main/native.ts)、[capture-writer.ts](main/capture-writer.ts) |
| 存储、索引与历史保护 | [store.ts](main/store.ts)、[database.ts](main/database.ts)、[store-index.ts](main/store-index.ts)、[history-vault.ts](main/history-vault.ts) |
| 托盘菜单、最近记录与预览 | [tray-menu.ts](main/tray-menu.ts)、[tray-menu-panel.ts](main/tray-menu-panel.ts)、[tray-panel.ts](main/tray-panel.ts)、[tray-query.ts](main/tray-query.ts)、[quick-preview.ts](main/quick-preview.ts) |
| AI、对话与 Codex | [ai.ts](main/ai.ts)、[chat.ts](main/chat.ts)、[chat-window.ts](main/chat-window.ts)、[codex-runtime.ts](main/codex-runtime.ts)、[codex-provider.ts](main/codex-provider.ts) |
| 备份、同步与共享 | [backups.ts](main/backups.ts)、[sync-service.ts](main/sync-service.ts)、[sync-receiver.ts](main/sync-receiver.ts)、[web-share.ts](main/web-share.ts) |
| 图片及文件 | [image-decode.ts](main/image-decode.ts)、[image-export.ts](main/image-export.ts)、[image-host.ts](main/image-host.ts)、[metadata.ts](main/metadata.ts) |
| 脚本与后台任务 | [scripts.ts](main/scripts.ts)、[script-engine.ts](main/script-engine.ts)、[tasks.ts](main/tasks.ts) |

`capture-writer` 的 capture 表示剪贴板采集，快捷键录入也使用 capture 术语；不能仅按名称删除这些模块。截图、录制、图片编辑与贴图已经迁出到 Frame，历史规格见 [文档历史](../docs/history/README.md)。
