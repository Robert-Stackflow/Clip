# Offline reference catalogs

These checked-in snapshots are loaded only when the user opens 表情符号 or CheetSheet. Run `node scripts/update-reference-data.mjs` to refresh the registry-derived catalogs; normal builds never fetch network resources.

- `emoji.json`: fully-qualified emoji from Unicode's [emoji-test.txt](https://www.unicode.org/Public/emoji/latest/emoji-test.txt).
- `symbols.json`: selected symbol ranges from Unicode's [UnicodeData.txt](https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt).
- `entities.json`: semicolon-terminated names from WHATWG's [HTML named character references](https://html.spec.whatwg.org/entities.json).
- `mime.json`: registered templates from [IANA Media Types](https://www.iana.org/assignments/media-types/).
- `colors.json`: CSS named colors from the MIT-licensed `color-name` package, plus `rebeccapurple`, checked against [CSS Color 4](https://www.w3.org/TR/css-color-4/#named-colors).
- ASCII: generated locally from code points 0–127; see [RFC 20](https://www.rfc-editor.org/rfc/rfc20).
- Kaomoji: manually curated common examples, not copied from QuickRef.
- CheetSheet: original short examples checked against [Git](https://git-scm.com/docs), [LaTeX](https://www.latex-project.org/help/documentation/), [Bash](https://www.gnu.org/software/bash/manual/bash.html), [Linux man-pages](https://man7.org/linux/man-pages/), and [JavaScript regex](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Cheatsheet).

The category choices were also compared with [QuickRef's symbol](https://quickref.cn/docs/symbol-code.html), [Git](https://quickref.cn/docs/git.html), [LaTeX](https://quickref.cn/docs/latex.html), [Bash](https://quickref.cn/docs/bash.html), [Linux](https://quickref.cn/docs/linux-command.html), and [Regex](https://quickref.cn/docs/regex.html) pages. The in-app descriptions and examples are independently written; their page content is not bundled.

The Unicode-derived data is redistributed under the included `UNICODE-LICENSE.txt`. The generated color names are under the included `COLOR-NAME-LICENSE.txt`.
