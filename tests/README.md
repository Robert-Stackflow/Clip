# 回归测试

`npm test` 运行生产逻辑回归，`npm run typecheck` 检查类型，`npm run test:dev` 验证实际 Electron 开发刷新和正常重启。

文件名中的版本号表示引入该回归的版本，不是代码副本。持续使用的功能、性能、语言、布局和原生桥接测试保留；旧的逐版本冻结、复制交付和重复打包脚本由 Git 历史保存。

`fixtures` 保存来源固定样本和隔离数据。真实键鼠、日常剪贴板与跨设备测试不由开发刷新测试代替。所有生成文件放在固定 `work` 目录。

真实 Office 来源测试会改动 Windows 系统剪贴板。`capture-word-rich`、`capture-excel-private` 和 `capture-powerpoint-rich` 在剪贴板非空时直接拒绝运行；开始复制前还核对剪贴板序列，Word/Excel 的 COM 脚本在实际 `Copy()` 前再次核对。不要为了运行测试自动清空用户剪贴板。测试辅助窗口的恢复逻辑只能覆盖可读取的格式，不应把它当成任意原始格式的完整备份。一次性探测也必须先使用同样的保护。

默认逻辑回归将随机样本放入 `work/current/core/fixtures`，结束后清理。`npm run test:workflow` 检查开发隔离、版本保留和清理边界；`npm run verify -- foundation-044 options-044 chrome-044 collection-042 auxiliary-043` 检查当前界面与固定的 One 来源样本。

对旧版本进行性能对比时，显式提供 `CLIPPER_OPTIONS_BASELINE_ASAR`、`CLIPPER_CHROME_BASELINE_ASAR` 或 `CLIPPER_COLLECTION_BASELINE_ASAR`。没有基线时只报告当前行为和当前测量，不使用已删除工作区，也不宣称已完成旧版对比。完整程序兼容性、真实设备和安装回退仍需独立验收。
