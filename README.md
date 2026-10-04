# Clipper

Windows 剪贴板工作台，使用 Electron、TypeScript、SQLite 和 Windows 原生组件。功能参考 OneClip，界面组件、页面骨架和开发工作流参考本地 `D:\Repositories\One`。

当前源码版本为 **0.50.5**。原窗口粘贴顺序修正与记事本复验见 [0.50.5 验收记录](docs/history/验收-0.50.5.md)。此前粘贴失败回退见 [0.50.4 验收记录](docs/history/验收-0.50.4.md)。空记录引导和资料分类控件改进见 [0.50.3 验收记录](docs/history/验收-0.50.3.md)。近期交互与布局收尾及目录包验证见 [0.50.2 验收记录](docs/history/验收-0.50.2.md)。AI 服务和文本脚本在没有配置时显示清晰的空状态与操作引导，见 [0.50.1 验收记录](docs/history/验收-0.50.1.md)。设置按常规、交互、维护、数据分组，原数据与备份的四个入口并入设置；快速粘贴直接复用最近记录窗口，划词菜单已移除。AI 服务和文本脚本作为工具分组的独立入口，URI 放在连接与分享，局域网同步使用设备同步图标。详见 [0.50.0 验收记录](docs/history/验收-0.50.0.md)。表情符号使用原生 Unicode Emoji，人物与手势可独立选择肤色，详情预览与复制使用相同字符；不再加载离线图片。资料页使用连续虚拟列表，搜索与可自动收缩的 SegmentTab 同行，肤色选择置于左侧分类栏。CheetSheet 完整导入 QuickRef 的 Git、LaTeX、Bash、Linux、Regex 五份资料，解析成 JSON 后由本应用组件渲染，含 371 节、1,277 个代码块或表格条目；五个主题统一使用更清晰的等宽字体、较大字号和语言高亮，保留公式预览与原文复制。数据来源与更新方法见 [资料目录说明](src/renderer/reference-data/README.md)，性能与响应本轮收尾、保存副本减少见 [0.49.11 验收记录](docs/history/验收-0.49.11.md)，手动大内容后台保存见 [0.49.10 验收记录](docs/history/验收-0.49.10.md)，JPEG 导入后台转换见 [0.49.9 验收记录](docs/history/验收-0.49.9.md)，长正文搜索减少拼接见 [0.49.8 验收记录](docs/history/验收-0.49.8.md)，最近记录按需读取正文见 [0.49.7 验收记录](docs/history/验收-0.49.7.md)，同时间长文本的排序索引优化见 [0.49.6 验收记录](docs/history/验收-0.49.6.md)，最近记录闲置窗口释放见 [0.49.5 验收记录](docs/history/验收-0.49.5.md)，最近记录搜索等待优化见 [0.49.4 验收记录](docs/history/验收-0.49.4.md)，最近记录后台搜索见 [0.49.3 验收记录](docs/history/验收-0.49.3.md)，资料页闲置字体缓存回收与顶部间距见 [0.49.2 验收记录](docs/history/验收-0.49.2.md)，字体加载与滚动复测见 [0.49.1 验收记录](docs/history/验收-0.49.1.md)，代码阅读与原生 Emoji 基础验证见 [0.48.1 验收记录](docs/history/验收-0.48.1.md)，完整资料导入验证见 [0.48.0 验收记录](docs/history/验收-0.48.0.md)。正式备份恢复与旧 JSON 导入的解析、图片缩略图、保存和索引更新已移至后台，恢复中支持取消，记录读取使用一致的数据库快照。大型备份预览见 [0.47.1 验收记录](docs/history/验收-0.47.1.md)，正式恢复的测量、数据回滚与仍未解决的整体内存问题见 [0.49.0 验收记录](docs/history/验收-0.49.0.md)。

## 开发与运行

开发目录固定为 `D:\Repositories\Clipper`。双击 [Start-Clipper-Dev.cmd](Start-Clipper-Dev.cmd)，或在该目录执行：

```powershell
npm run dev
```

首次启动编译当前代码。界面与样式修改后自动刷新；主进程、预加载修改后正常退出并重启；原生源码修改后重新运行开发命令。开发设置保存在 `work/dev-profile`，自动记录默认开启；旧开发资料首次升级到 0.50.0 时恢复开启，此后保留手动暂停状态。

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
