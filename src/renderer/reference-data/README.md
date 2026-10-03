# 离线资料源与渲染

资料文字与分组元数据保存在 JSON，进入页面时才加载。reference-catalog.ts 整理条目，reference-pages.ts 管理搜索、分类和虚拟列表；cheatsheet-renderer.ts 用本应用组件渲染结构化块。程序运行和正常构建均不访问资料网站。

- emoji.json：Unicode **17.0** 的 3,944 个 fully-qualified 变体，合并为 1,926 个表情家族。来源：[emoji-test.txt](https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt)。直接显示 Unicode 字符，由系统 Emoji 字体绘制；肤色只使用规范定义的变体，笑脸没有肤色修饰符。系统字体未覆盖的较新字符可能显示缺字；Unicode 18 的新增条目尚未收录。
- symbols.json：Unicode [字符名称与选定符号区段](https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt)，2,339 项。
- entities.json：WHATWG [HTML 命名实体](https://html.spec.whatwg.org/entities.json)，2,125 项。
- colors.json：color-name 与 CSS Color 4 的 149 个名称。
- mime-details.json：IANA 类型与固定 mime-db 1.54.0 扩展名映射合并，忽略大小写去重后 2,722 项。未知扩展名明确显示无已知映射。
- mime-descriptions.json：从固定版本的 [Apache Tika MIME 数据库](https://github.com/apache/tika/blob/ccec84eb030fbfddcceffe063621e74ca81b13a3/tika-core/src/main/resources/org/apache/tika/mime/tika-mimetypes.xml) 提取与列表匹配的 168 项人工释义。优先显示元数据中的中英文常用释义，其次显示 Tika 的英文释义；其余仅按媒体分类/结构后缀说明，不臆造专用格式含义。
- mime-rfc.json：对照 [IANA 媒体类型登记表](https://www.iana.org/assignments/media-types/media-types.xml) 与 [RFC Editor 索引](https://www.rfc-editor.org/rfc/rfc-index.xml)，为 646 项登记类型附上 RFC 编号和官方标题。仅作为“登记参考”显示，不将规范标题冒充格式释义。生成脚本固定两份来源快照的 SHA-256，来源变化时需人工检查再更新。
- catalog-metadata.json：78 个手工整理颜文字、分类中英文名称、常用 MIME 释义和 ASCII 控制字符名称。ASCII 0–127 按代码点生成。
- cheatsheets.json：完整导入 [Quick Reference](https://github.com/jaywcjlove/reference) 的 Git、LaTeX、Bash、Linux、Regex 五份 Markdown，固定提交 6f382a13d72f3c4ce67f3d6f3f38f6f930d01a6c。保留原文、SHA-256、来源及段落/代码/表格/列表/引用块。共 **371 节、1,277 个代码块或表格条目**，另有说明和列表。没有嵌入 QuickRef 网页 HTML；KaTeX 本地显示公式，复制保留原语法。其他 QuickRef 主题尚未导入。
- reference-links.json：源文档中 HTTPS 链接的精确允许清单。

显式更新：

```powershell
node scripts/update-reference-data.mjs
node scripts/update-mime-details.mjs
node scripts/update-mime-descriptions.mjs
node scripts/update-mime-rfc.mjs
node scripts/update-cheatsheets.mjs 6f382a13d72f3c4ce67f3d6f3f38f6f930d01a6c
```

普通构建不下载图片或字体，不创建 Emoji 解码工作线程。虚拟列表仅挂载可见区域附近的字符条目。检查入口：node tests/reference-data.cjs。

Unicode、颜色、mime-db、Apache Tika、QuickRef 的许可分别保存在本目录。QuickRef 为 MIT。所有许可同时加入程序的 THIRD_PARTY_NOTICES.txt。

速查代码的语法解析、转义与高亮在 `cheatsheet-highlight.ts`，结构块渲染在 `cheatsheet-renderer.ts`；数据 JSON 无展示样式。代码块语言优先，行内片段继承主题，复制始终取未插入高亮标签的原始数据。
