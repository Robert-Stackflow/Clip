# Clipper 图形安装器

独立的 C# / WPF 前端，采用 One 的白色表面、灰色辅助区域、圆角与深色主按钮。界面、插画及交互在本目录实现。安装引擎使用本项目的 NSIS 配置和安全退出检查；不打开第二个向导、不启动 Electron 来显示安装界面。

欢迎、文件准备、校验、写入、完成、错误与重试都使用同一个窗口。中英文切换立即更新安装器界面，不改写应用语言设置。文件准备百分比来自实际写入字节，安装引擎工作时只显示活动进度。准备阶段可取消；开始写入后等待完成，避免中途强制结束。完成页提供「启动 Clipper」与「完成」。安装器检查旧版进程、可用空间、已注册版本和安装文件校验；发现更新版本时拒绝降级。

## 构建

在有正常依赖的 Windows 源码目录执行 `npm run package:installer:custom`。该命令先构建 NSIS 引擎，再用 Windows 的 .NET Framework C# 编译器嵌入引擎及界面。默认图形安装器输出到 `work/custom-installer-build/Clipper/Clipper-<版本>-Setup-x64.exe`，原始 NSIS 引擎保留在 `release/<版本>/`。发布的是图形安装器。勿在共享依赖的验证工作区执行依赖安装或原生重建。

已有引擎时可单独执行：

```powershell
& ./installer-ui/build.ps1 -Payload ./release/0.22.0/Clipper-0.22.0-Setup-x64.exe -AppAsar ./release/0.22.0/win-unpacked/resources/app.asar
```

构建脚本生成版本、NSIS 身份和 SHA-256 常量，输出旁边的 JSON 记录实际校验值。临时引擎在运行前验证，安装后再次检查应用 asar。在安装磁盘使用独立随机临时目录，只清理自身文件。覆盖安装前保留程序文件、自有注册与开始菜单，调用旧版正常卸载引擎后安装新版；失败后恢复旧程序与入口。该事务不启动应用或处理历史格式降级。日志位于 `%LOCALAPPDATA%/ClipperInstaller/Logs`。普通运行需要 .NET Framework 4.8；发布包当前没有代码签名。

## 验证

`--render-preview <目录>` 在后台绘制实际 WPF 的两种语言、四种状态、100%/150%/200% 图像，并检查语言切换、按钮启用、百分比与取消规则；不显示窗口或控制输入。`--verify-payload <结果.json>` 验证实际嵌入的引擎、单调字节进度和安装前取消。

`tests/custom-installer.cjs` 用独立 NSIS 应用身份及工作区目录编译测试前端，验证正在运行时拒绝、首次安装、重复安装、卸载、应用校验、开始菜单、注册入口和资料保留。测试模式的安装目录在构建时限定为本项目自己的验证目录；生产构建不接受 `--verify-install`。测试从不启动剪贴板应用。

当前图形安装器支持 `/S` 静默安装；它尚未接入联网自动更新协议。GitHub 更新目标已确定为 `Robert-Stackflow/Clipper`，发布与更新属于后续独立工作。
