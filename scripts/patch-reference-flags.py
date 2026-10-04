"""Expose regional-indicator flag ligatures as stable private-use font glyphs.

Chromium on Windows may shape a two-indicator Unicode flag as country letters
before the bundled font's GSUB ligature can render. The private-use character
is only a display glyph; the renderer keeps and copies the original Unicode.
Requires fonttools when updating the bundled Noto Color Emoji flag subset.
"""

from pathlib import Path

from fontTools.ttLib import TTFont


font_path = Path(__file__).resolve().parents[1] / "src/renderer/reference-flags.ttf"
font = TTFont(font_path)
font.recalcTimestamp = False
ligatures = font["GSUB"].table.LookupList.Lookup[0].SubTable[0].ligatures
mapping = {}
for first in range(26):
    leading = f"u{0x1F1E6 + first:X}"
    for ligature in ligatures.get(leading, []):
        if len(ligature.Component) != 1:
            continue
        trailing = ligature.Component[0]
        if not trailing.startswith("u1F1"):
            continue
        second = int(trailing[1:], 16) - 0x1F1E6
        if 0 <= second < 26:
            mapping[0xE000 + first * 26 + second] = ligature.LigGlyph

if len(mapping) < 250:
    raise RuntimeError(f"Expected the country flag subset, found {len(mapping)} ligatures")
for table in font["cmap"].tables:
    if table.isUnicode() and table.format in (4, 12):
        table.cmap.update(mapping)
font.save(font_path)
print(f"Mapped {len(mapping)} regional flag glyphs")
