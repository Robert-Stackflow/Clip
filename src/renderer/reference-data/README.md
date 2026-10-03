# 离线资料源与渲染

资料文字、分组元数据与图形映射保存在 JSON，进入页面时才加载。reference-catalog.ts 整理条目，reference-pages.ts 管理搜索、分类和虚拟列表；cheatsheet-renderer.ts 用本应用组件渲染结构化块。程序运行和正常构建均不访问资料网站。

- emoji.json：Unicode **17.0** 的 3,944 个 fully-qualified 变体，合并为 1,926 个表情家族。来源：[emoji-test.txt](https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt)。固定版本与完整离线图形保持一致；Unicode 18 的新增条目尚未收录。
- emoji-art.json / assets/emoji-atlas：Twemoji **17.0.3**，固定提交 b6b55fef1e8636b540a6d016a4729ca8cdf2e60b。原始 72×72 图形等比例装入 21 张离线 PNG；后台解码最多缓存三张图集，页面最多缓存 384 张小图，离开页面释放。所有目录变体均有图形。
- symbols.json：Unicode [字符名称与选定符号区段](https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt)，2,339 项。
- entities.json：WHATWG [HTML 命名实体](https://html.spec.whatwg.org/entities.json)，2,125 项。
- colors.json：color-name 与 CSS Color 4 的 149 个名称。
- mime-details.json：IANA 类型与固定 mime-db 1.54.0 扩展名映射合并，忽略大小写去重后 2,722 项。未知扩展名明确显示无已知映射；常用释义在元数据中，其他类型按媒体分类/结构后缀说明，不臆造专用格式含义。
- catalog-metadata.json：78 个手工整理颜文字、分类中英文名称、常用 MIME 释义和 ASCII 控制字符名称。ASCII 0–127 按代码点生成。
- cheatsheets.json：完整导入 [Quick Reference](https://github.com/jaywcjlove/reference) 的 Git、LaTeX、Bash、Linux、Regex 五份 Markdown，固定提交 6f382a13d72f3c4ce67f3d6f3f38f6f930d01a6c。保留原文、SHA-256、来源及段落/代码/表格/列表/引用块。共 **371 节、1,277 个代码块或表格条目**，另有说明和列表。没有嵌入 QuickRef 网页 HTML；KaTeX 本地显示公式，复制保留原语法。其他 QuickRef 主题尚未导入。
- reference-links.json：源文档中 HTTPS 链接的精确允许清单。

显式更新：

```powershell
node scripts/update-reference-data.mjs
node scripts/update-mime-details.mjs
node scripts/update-cheatsheets.mjs 6f382a13d72f3c4ce67f3d6f3f38f6f930d01a6c
python scripts/pack-emoji-art.py
```

图集更新先把上述 Twemoji 固定提交的 GitHub tarball 放到 work/emoji-source/twemoji.tar.gz，打包需要 Pillow；刷新时校验完整覆盖和原始图形许可。普通构建无需 Python，也不下载图形。检查入口：node tests/reference-data.cjs。

Unicode、颜色、mime-db、QuickRef 的许可分别保存在本目录。Twemoji 图形由 Twitter, Inc. 和贡献者提供，使用 **CC BY 4.0**，完整许可见 TWEMOJI-LICENSE.txt；打包仅合并图集。QuickRef 为 MIT。所有许可同时加入程序的 THIRD_PARTY_NOTICES.txt。
