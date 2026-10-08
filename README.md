# Clip

Windows 剪贴板工作台，使用 Electron、TypeScript、SQLite 和 Windows 原生组件。功能参考 OneClip，界面组件、页面骨架和开发工作流参考本地 `D:\Repositories\One`。

当前源码版本为 **0.51.2**，应用名称为 **Clip**，应用标识为 `com.cloudchewie.clip`。正式资料默认存放在 `%APPDATA%\Clip`，开发资料在 `work/Clip/dev-profile`；会话、日志、崩溃记录、备份与后台服务资料分别保存在所属 Clip 目录内。不读取或迁移旧应用资料，不提供旧协议和旧备份格式的兼容。Codex 继续使用本机已有程序，安装包不携带 Codex 运行时。截图、录制、图片编辑和贴图由 Frame 负责，Clip 保留剪贴板图片采集、预览、复制、导出和元数据读取。功能状态见 [当前状态与待办](docs/development/当前状态与待办.md)，历史设计与验收见 [文档索引](docs/README.md)。

## 开发与运行

开发目录固定为 `D:\Repositories\Clip`。双击 [Start-Clip-Dev.cmd](Start-Clip-Dev.cmd)，或在该目录执行：

```powershell
npm run dev
```

首次启动编译当前代码。界面与样式修改后自动刷新；主进程、预加载修改后正常退出并重启；原生源码修改后重新运行开发命令。开发窗口在任务栏显示为 `Clip · Dev`，与正式版 `Clip` 区分。窗口不在前台时先从任务栏找开发窗口；开发进程仍在时无需重复启动。开发设置保存在 `work/Clip/dev-profile`，自动记录默认开启，手动暂停状态会保存。

需要交付时生成完整 Electron 目录包，运行其中的 `Clip.exe`。移动程序时保留整个目录。关闭窗口后程序驻留托盘，从托盘菜单选择“退出”才会结束运行。

Codex AI 服务使用本机已有的 Codex，安装包不携带 Codex 运行时。优先检测 PATH 和 npm 全局安装，也支持 Codex 桌面应用附带的程序；在 AI 服务编辑窗口可以手动选择程序或恢复自动检测。支持选择 npm 的 `codex.ps1`、`codex.cmd`、`codex.bat`、`codex.js` 及无扩展名入口，解析到同一安装目录内的原生程序；读取模型时重新启动当前程序，避免升级后沿用旧进程的列表。未安装时会显示提示，其他功能照常使用。Clip 的 Codex 授权与本机 CLI/桌面应用的账户数据分开保存。

## 目录

| 目录 | 内容 |
| --- | --- |
| `src/main`、`src/preload`、`src/renderer`、`src/shared`、`src/web` | 应用源码 |
| `native` | Windows 原生桥接与 Rust 文档读取器 |
| `assets` | 图标等静态资源 |
| `build`、`installer` | NSIS 引擎配置与图形安装器源码 |
| `scripts`、`tests` | 开发、构建和回归验证 |
| `docs` | 使用说明、开发资料、调研和历史记录 |
| `licenses` | 第三方许可 |
| `dist` | 当前编译结果，覆盖复用 |
| `work` | 开发配置、原生编译缓存和测试临时文件 |
| `verification` | 固定位置的检查报告 |
| `release` | 最新两个可运行版本 |

生成目录和依赖不提交 Git。不再复制小版本源码、依赖或完整工作区。发布脚本使用单个暂存目录，校验后保留最新两版。

## 常用检查

```powershell
npm run typecheck
npm test
npm run test:dev
npm run verify -- foundation-044
npm run package
```

`npm test` 运行逻辑回归；`test:dev` 验证实际 Electron 刷新与正常重启；`verify` 使用固定测试目录并清理该次生成样本。真实剪贴板、键鼠、跨设备和安装回退检查按各自范围单独执行。

目录包的构建一致性校验不能代替全部功能验收。双实体设备同步、局域网组播、混合 DPI 及日常目标应用的完整桌面兼容性仍需单独验收。已清理可确认的旧生成物，保留未标记的旧工作目录与最新两个可运行版本；构建直接生成到新的版本目录，不覆盖正在运行的版本。开发入口持续复用 `dist` 和 `work/Clip/dev-profile`，不复制完整工作区。

[文档索引](docs/README.md) · [使用说明](docs/user-guide/使用.md) · [开发与存储规则](docs/development/代码与构建管理.md) · [One 组件来源](docs/research/ONE-UI-MIGRATION.md)
