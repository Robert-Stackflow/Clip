# Clip 0.51.0 更名验收

2026-10-08。按用户要求将 Clipper 全面更名为 Clip，应用标识采用 `com.cloudchewie.clip`。当前处于临时开发阶段，不迁移旧数据，也不提供旧应用身份、协议、备份格式或旧历史数据库版本的兼容。

## 范围

| 项目 | 当前值 |
| --- | --- |
| 程序与窗口名称 | Clip；开发窗口为 Clip · Dev |
| 应用标识、开机启动项 | `com.cloudchewie.clip` |
| 启动程序 | `Clip.exe` |
| 默认安装目录 | `%LOCALAPPDATA%\Programs\Clip` |
| 默认资料目录 | `%APPDATA%\Clip` |
| 安装器资料目录 | `%APPDATA%\Clip\installer` |
| 开发资料目录 | `work/Clip/dev-profile` |
| 隔离开发检查 | `work/Clip/development` |
| 隔离验证工作区 | `work/Clip/current` |
| 会话、日志、崩溃记录 | 所属 Clip 资料目录内的 `session`、`logs`、`crash-dumps` |
| 外部 URI | `clip-win://` |
| 内部资源、字体协议 | `clip://`、`clip-font://` |
| 备份 | `.clip`、`clip-backup`、`CLIP-ENC\x01`；只接受当前格式版本 7 |
| Windows 安装身份 GUID | `c3cffeb7-343a-5f68-9113-943b5093c7c4`，由新应用标识生成 |

界面、托盘、安装器、更新与回退组件、资源文件、预加载 API、IPC、浏览器扩展、局域网配对与网页分享身份均同步更名。配对码解码按当前前缀长度处理。构建会清理退役的旧图标输出。旧开发资料的一次性迁移、旧备份版本转换、旧附件格式分支和旧 SQL 投影触发器升级逻辑已移除。

后续按用户要求，将本地 Git 仓库完整移至 `D:\Repositories\Clip`，远端仓库更名为 `Robert-Stackflow/Clip`，仓库身份和历史保持不变。Git remote、更新来源、开发脚本及当前文档路径同步更新；旧工作区目录已移除。Windows WIC 的 `IWICBitmapClipper` 与 `CreateBitmapClipper` 属于系统 API，名称保持正确。旧应用文件和历史文档未删除，也不会被新应用自动读取。

## 验证

- 类型检查与完整构建通过；C++、C#、Rust 原生组件编译通过。
- 641 项核心回归全部通过，包含旧身份、旧环境变量、旧备份与旧数据库拒绝检查。
- 12 项开发、发布与验证工作区检查通过。
- 语言消息与绑定检查通过；没有缺失消息或未绑定入口。
- 实际 Electron 和完整目录包分别通过隔离启动检查：Clip 名称与版本、资料隔离、会话/日志/崩溃目录、预加载 API、开机参数仅驻留托盘、手动打开窗口。
- 完整 Windows x64 目录包通过 285 项编译文件一致性核对。EXE 的产品名称为 Clip，产品版本为 0.51.0.0。

程序目录：`release/0.51.0/win-unpacked`。需保留整个目录，使用其中的 `Clip.exe`。构建记录在 `release/0.51.0/verified-build.json`；隔离启动证据在 `verification/0.51.0/repository-rename/identity.json`。

本轮未修改正在运行的日常应用、旧用户资料或系统启动项，未实际执行新的安装/卸载。打包一致性和隔离启动验证不等同于全部桌面场景验收。截图、录屏与图片编辑迁出独立应用的工作仍按拆分文档推进，不属于此次更名的已完成范围。

## 仓库整理与推送前复核

新目录中的构建、12 项工作流检查及实际 Electron 的数据隔离、托盘启动和手动打开验证通过；641 项核心回归、类型检查与语言绑定检查通过。验证摘要和日志保存到 `verification/0.51.0/repository-rename`。生成目录的清理被自动审批拒绝，固定路径并校验范围后仍被拦截；旧 release、废弃候选和本次临时目录暂时保留，未达到 release 最多两版的清理要求。这些生成文件均被 Git 忽略，不纳入提交。

此轮仅整理源码、仓库路径与远端后提交推送。现有 0.51.0 安装器在仓库改名之前生成，本轮没有重新打包或安装；下一次打包会包含更新来源的变化。
