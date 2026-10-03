# Clipper

Windows 剪贴板工作台，使用 Electron、TypeScript、SQLite 和 Windows 原生组件。功能参考 OneClip，界面组件、页面骨架和开发工作流参考本地 `D:\Repositories\One`。

当前源码版本为 **0.46.14**。备份导入除了事务内增量维护容量，还一次性索引快捷回复的去重身份，减少接近上限时的重复比较。当前验证范围和剩余限制见 [0.46.14 验收记录](docs/history/验收-0.46.14.md)。

## 开发与运行

开发目录固定为 `D:\Repositories\Clipper`。双击 [Start-Clipper-Dev.cmd](Start-Clipper-Dev.cmd)，或在该目录执行：

```powershell
npm run dev
```

首次启动编译当前代码。界面与样式修改后自动刷新；主进程、预加载修改后正常退出并重启；原生源码修改后重新运行开发命令。开发设置保存在 `work/dev-profile`，自动记录默认暂停。

需要交付时生成完整 Electron 目录包，运行其中的 `Clipper.exe`。移动程序时保留整个目录。关闭窗口后程序驻留托盘，从托盘菜单选择“退出”才会结束运行。

## 目录

| 目录 | 内容 |
| --- | --- |
| `src/main`、`src/preload`、`src/renderer`、`src/shared`、`src/web` | 应用源码 |
| `native` | Windows 原生桥接与 Rust 文档读取器 |
| `assets` | 图标等静态资源 |
| `build` | 安装器配置和 `installer-ui` 源码 |
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

目录包的构建一致性校验不能代替全部功能验收。双实体设备同步、局域网组播、混合 DPI 及日常目标应用的完整桌面兼容性仍需单独验收。旧的未标记暂存目录和部分过期版本因自动清理审批拦截而保留；当前版本直接生成到新的版本目录，不覆盖正在运行的版本。开发入口持续复用 `dist` 和 `work/dev-profile`，不复制完整工作区。

[文档索引](docs/README.md) · [使用说明](docs/user-guide/使用.md) · [开发与存储规则](docs/development/代码与构建管理.md) · [One 组件来源](docs/research/ONE-UI-MIGRATION.md)
