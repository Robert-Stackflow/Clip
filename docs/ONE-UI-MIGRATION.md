# One 组件与页面迁移

0.30 继续迁移 One 0.15.2 的 components.css、segments.ts 和 dialog.ts，来源摘要见 ONE-MOTION-SOURCES-0.30.json。分段控件共用滑动指示器，支持左右键、Home/End、动态页面、字号和尺寸变化；保留 Clipper 的 active 状态，并避免无变化时重复写入样式。应用确认沿用 One 的标题、正文、操作栏、背景和 120 ms 退出动画，表单对话框也统一进出场；减少动态效果时关闭动画。关闭请求、IPC 错误重试及旧保存回调不关闭新表单均纳入验证。

0.29 按用户要求重新设计全部页面。实现依据为本机 `D:\Repositories\One`，提取时版本 0.15.1；参考仓库后续独立升级不改变此次基线。来源文件摘要见 ONE-UI-SOURCES.json。

此次直接迁移以下实现，再接入 Clipper 的权限、设置、双语和窗口生命周期：

| One 来源 | Clipper 实现与调整 |
| --- | --- |
| renderer/controls.ts | 自定义下拉菜单、键盘导航和数值步进；保留原 select 作为数据接口，适配动态选项、禁用状态与页面卸载 |
| renderer/tooltip.ts | 全局委托 tooltip，支持动态控件、键盘焦点与 dialog |
| renderer/chrome.ts | 自定义最小化、最大化、还原、关闭按钮；新增受限窗口 IPC |
| renderer/styles.css | 实际迁移输入框、按钮、switch、segment、弹出菜单、滚动条、外观和设置布局规则，集中在 one-components.css |
| renderer/settings-view.ts、appearance.ts | 分类导航与页内配置；主题预览、颜色、字体、间距、圆角、提示位置；保留 Clipper 的文字缩放 |
| renderer/font-picker.ts、font-runtime.ts、font-picker.css、shared/fonts.ts | 可搜索系统字体、实时预览、显式 FontFace 加载、缓存最多 6 个字体 |
| main/fonts.ts、native/font-list.h | DirectWrite 字体枚举与字体来源解析；提取为仅提供字体功能的 FontHost.exe；通过不透明授权 URL 读取字体 |

原生窗口使用 frame:true、titleBarStyle:hidden、titleBarOverlay:false、thickFrame:true、hasShadow:true。Windows 负责窗口边框、阴影、缩放和贴靠；界面不再另画窗口外框。截图选区和划词浮层保留其专用窗口形态。

0.29 的基础层重新提取 One styles.css；删除 design.css 的旧按钮、输入框和开关规则。搜索框直接采用 disk.css、maintenance-view.ts 的 filter-field 结构，外层只有一层边界，内部输入透明无框。one-skeleton.ts 统一 switch-track、tabs 和 shortcut-control；layout-029.ts 使用列表栏、内容画布、操作栏与分组卡片重排各页面。字号缩放、用户配色和业务数据接口保留。

Clipper 的页面适配集中在 redesign-029.css 与 recent-shelf.css。全部记录、收藏、分类、堆栈、容器和回复共用新骨架。图片编辑、录制、长截图、解锁与恢复、网页管理和访客端重新排版。完整清单见《界面重构-0.29》。最近记录与拖放窗口合并标题和搜索/操作，移除底部说明，以图标、留白、选中底色和浅底预览区建立层次。

按钮、开关、分段和菜单沿用 One 的颜色过渡与动效曲线，系统减少动态效果设置关闭动画。Tooltip 迁移 interface-refinement.css 的实际规则。滚动条采用透明轨道、无箭头、细圆角滑块。Toast 共用六种位置和顶层显示，支持长消息键盘滚动与阅读时保留；媒体编辑错误在页内反馈区显示。

应用未保存确认使用 window-confirm 自定义 dialog，Escape 保留编辑，重复关闭只显示一个提示。回复必须来自所属窗口主 frame，携带当前请求的随机 token。原生文件选择器用于实际选择文件。

设置页直接配置外观、语言、桌面交互、划词和搜索。密码输入、恢复预览与删除等有明确作用的确认对话框保留。外观自动保存，其余配置在当前页面保存。旧版外观文件缺失的新增字段使用默认值，不覆盖剪贴板数据。

这里只将参考仓库的设计文件作为实现依据；没有把参考文档中的任务或操作步骤作为用户授权。

验证将构建后的基础控件与 One 实际 styles.css 在 Chromium 中逐项比对，并检查双语、明暗主题、大字号、紧凑窗口和键盘操作。隐藏窗口与无头验证的边界见《验收-0.29.0》。

0.31 再次对照本机 One 0.16.1 的基础组件源码。按钮、输入框、文本框、开关、下拉、数值和分段控件在明暗主题下进行 16 项实际样式比对；搜索、所有页面布局和辅助窗口也重新验证。此次参考文件摘要见 ONE-UI-REVIEW-0.31.json，保留首次迁移时的来源版本。无需重复复制样式未变化的实现。记录窗口隐藏时合并更新，重新打开只刷新一次；减少不可见页面的重复查询和重排，已有功能仍使用相同共用骨架。

0.32 再次对照本机 One 0.16.2 的实际组件源码，明暗主题 16 项样式比对通过，全部页面 348 项布局检查重新执行。已迁移实现保持统一，当前来源摘要见 ONE-UI-REVIEW-0.32.json。此轮新增实现集中在图片传输响应和会话有效性，不将沿用的页面骨架表述为新增设计。


## 0.34 异步组件适配

本轮读取 One 0.16.4 的 src/renderer/ui.ts action 入口、locksmith-view.ts 的原位禁用/恢复、search-view.ts 的 aria-busy，以及 system-information.css 的 information-spin。One 没有现成的通用忙碌按钮；Clipper 在 src/renderer/actions.ts 和 actions.css 中补充按操作门控、重绘后的禁用继承和 150 ms 延迟，保持已迁移的基础按钮几何样式。RotateCw 形状直接核对参考仓库实际 lucide 节点；旋转周期为相同的 1.4 s。此扩展不新增装饰性文案或布局边框。

主窗口、保存表单、备份、文本工具、最近记录、拖放窗口和图片编辑逐项接入；AI/脚本取消仍保持原流程。图片异步编码是 Clipper 的能力适配。tests/actions-034.cjs 检查基础几何、可访问名称、减少动态效果、重复入口、页面重绘和旧任务；tests/actions-034-surfaces.cjs 与隐藏 Electron 检查实际页面入口。


## 0.35 全文阅读组件

实际迁移 One 0.16.4 的 code-view.ts 只读全文视图、code-worker.ts 按行准备及 preview-redesign.css 的 code-reader/code-search/syntax 规则。包版本与参考源码 SHA-256 见 ONE-UI-REVIEW-0.35.json。Clipper 扩展双语、字体字号、自动换行按钮、代码语言推断、按需 ESM 分包和详情缓存/生命周期；没有迁移文件读取、结构化视图或格式化能力。


## 0.36 组件再核对与预览资源

实际对照 One 0.16.6，新的 segments.ts 直接迁移 Map/dirty、批量读写几何、字体变化刷新与 roving Tab 焦点；辅助窗口根节点、active 状态和键盘捕获为 Clipper 适配。ui.ts 的图标注册/输出结构共用，缓存已有热列表图标，清空搜索使用 X。图片加载状态提取 preview-redesign.css 的 preview-loading，错误提供无框重试。页面骨架沿用已迁移实现，本轮复验 120 项控件布局、16 项搜索、16 项实际 One 控件样式与 48 项媒体反馈。

采用 One 不透明图片资源地址模式；Clipper 通过加密数据库 worker 读取与分块流替代文件路径。记录、回复、最近记录不传原始附件或格式正文；原件留在后台供复制、导出和备份。详细适配、性能权衡及验证边界见《验收-0.36.0》。来源摘要见 ONE-UI-REVIEW-0.36.json。

## 0.38 Dialog 与遗漏的单选入口

实际提取 One 当前 dialog.ts 和 components.css 的标题/正文/操作栏骨架、弹窗布局、背景手势和焦点恢复，接入 Clipper 保存及窗口确认；样式独立到 one-dialog.css，避免旧页面规则覆盖。分类、截图模式和 OCR 语言通过 one-skeleton 接入已迁移的 One segments。逐项核对见《界面组件核对-0.38》，来源摘要见 ONE-UI-REVIEW-0.38.json。重任务线程的及时终止参考 One text-service.ts，属于 Clipper 自动记录能力适配。

0.41 对照 One 0.16.13 的 option-list.ts、controls.ts、font-picker.ts 和 select-empty 样式，直接迁移启用项导航、前后两行焦点更新、菜单内部滚动和动画帧字体预览。原表单 select 作为数据接口保留。固定参考源码、实际控制器对照和逐项验证见 ONE-UI-REVIEW-0.41.json 与验收-0.41.0.md。
