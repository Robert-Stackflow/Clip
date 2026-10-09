# 文档索引

当前源码基线为 0.51.2。当前范围见需求，实现、交付与待办统一以 [当前状态与待办](development/当前状态与待办.md) 为准；历史规格、版本勾选项和旧测试结果不直接代表现状。

## 使用说明

- [运行与常用操作](user-guide/使用.md)
- [项目入口与开发启动](../README.md)

## 开发资料

- [代码、开发与存储规则](development/代码与构建管理.md)
- [当前状态与待办](development/当前状态与待办.md)
- [功能交付约定](development/功能交付约定.md)
- [需求](development/需求.md)
- [开发计划](development/开发计划.md)
- [设计](development/设计.md)
- [源码导航](../src/README.md)

## 专项规格

| 主题 | 文档 |
| --- | --- |
| 桌面与布局 | [桌面交互](development/桌面交互设计.md)、[托盘快捷面板](development/托盘快捷面板设计.md)、[字号与紧凑布局](development/字号与紧凑布局设计.md)、[中英界面](development/中英界面设计.md) |
| 内容组织与处理 | [效率功能](development/效率功能设计.md)、[文本处理](development/文本处理设计.md)、[堆栈规则](development/堆栈规则设计.md)、[虚拟文件夹](development/虚拟文件夹设计.md) |
| 格式、文件与图片 | [格式保真](development/格式保真设计.md)、[虚拟附件](development/虚拟附件设计.md)、[内部信息](development/内部信息设计.md)、[0.27 补充设计及历史录制范围](development/四项功能设计-0.27.md)、[图片导入性能调查](development/图片导入性能调查.md) |
| 数据与网络 | [数据保护](development/数据保护设计.md)、[历史加密](development/历史加密设计.md)、[局域网同步](development/局域网同步设计.md)、[网页共享](development/网页共享设计.md) |
| 更新与恢复 | [安装与更新](development/安装与更新设计.md)、[更新](development/更新设计.md)、[升级恢复点](development/升级恢复点设计.md)、[程序版本回退](development/程序版本回退设计.md) |

专项文档说明各功能的约束与历史设计演进；完成情况和后续验收不在各篇重复维护。

## 调研

- [One 组件迁移](research/ONE-UI-MIGRATION.md)
- [OneClip 功能借鉴与后续优化](research/ONECLIP-FUNCTION-REVIEW-0.50.15.md)
- [OneClip 功能缺口与实施进展基线](research/ONECLIP-REMAINING-FEATURES-0.50.15.md)
- [快捷 AI 窗口调研](research/DOUBAO-QUICK-AI-RESEARCH-2026-10-06.md)
- [截图、录制与 GIF 调研（Frame 迁移前）](research/CAPTURE-RECORDING-GIF-RESEARCH-2026-10-08.md)

调研记录查阅日期与当时证据；不作为当前实现承诺。截图、录制、图片编辑与贴图现归属 Frame。

## 历史

- [历史验收记录](history/README.md)
- [历史阶段与迁出规格](history/projects/README.md)

`development` 保存仍适用的规格与流程，`research` 保存来源证据，`history` 保存既有阶段、交付和验收记录。小型结构化指标保存在 `history/measurements`；原始测试资料放在 `work`，精选证据放在 `verification`，均按各自生命周期管理。历史路径不保证现在仍存在。
