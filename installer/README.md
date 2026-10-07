# Clipper 安装器

安装器按本地 One 的单窗口方案实现：Electron 负责安装位置、进度、完成与失败界面，NSIS 负责写入、注册和卸载。图形界面位于 `installer/`；NSIS 的运行进程保护和跨磁盘升级处理位于 `build/installer.nsh`。

`npm run package:installer` 构建 `release/<版本>/Clipper-<版本>-Setup-x64.exe`，这是默认交付的图形安装器。同目录中的 `Clipper-<版本>-Setup-Engine-x64.exe` 是嵌入的 NSIS 安装引擎；`npm run package:installer:engine` 只生成引擎。普通 `npm run package` 仍只生成完整可运行目录。

用户可编辑安装路径或浏览目录。安装器先检查版本、运行进程、目录和空间，再在安装盘准备并校验引擎。迁移或重装时先备份旧程序、注册表入口与开始菜单快捷方式；失败后恢复旧版，个人资料始终保留。安装完成后校验 `app.asar`。错误页展示可操作的简短提示，技术详情可展开查看并在卡片内部滚动。应用内更新调用安装包的 `/S` 参数，沿用相同的安装与回滚逻辑并通过退出码报告结果。

开发验证使用独立产品身份：`node tests/installer-lifecycle.cjs` 构建并验证 NSIS；`node tests/electron-installer-install.cjs` 验证图形安装器的首次安装、换目录与失败回滚；`node tests/electron-installer-ui.cjs` 检查界面和失败页。测试不会调用日常 Clipper 身份或资料目录。正式签名、干净系统与公开更新链路仍需单独验收。
