"""Explicit offline atlas refresh from the pinned Twemoji 17.0.3 archive; requires Pillow."""
import io,json,tarfile,hashlib
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parent.parent
archive=root/'work/emoji-source/twemoji.tar.gz'
art={}
license_text=''
with tarfile.open(archive) as tar:
    for member in tar.getmembers():
        if not member.isfile(): continue
        if '/assets/72x72/' in member.name and member.name.endswith('.png'):
            name=Path(member.name).stem
            if all(c in '0123456789abcdef-' for c in name): art[name]=tar.extractfile(member).read()
        if member.name.endswith('/LICENSE-GRAPHICS'): license_text=tar.extractfile(member).read().decode()
if not license_text.startswith('Attribution 4.0'): raise ValueError('Missing upstream graphics license')
emoji=json.loads((root/'src/renderer/reference-data/emoji.json').read_text(encoding='utf-8'))
output=root/'assets/emoji-atlas';output.mkdir(exist_ok=True)
placements={};images=[]
for glyph,*_ in emoji:
    code='-'.join(f'{ord(c):x}' for c in glyph)
    candidates=[code,code.replace('-fe0f','')]
    match=next((key for key in candidates if key in art),None)
    if match is None: raise ValueError(f'Missing graphic for {glyph} ({code})')
    placements[glyph]=len(images);images.append(art[match])
pages=[]
for start in range(0,len(images),196):
    image=Image.new('RGBA',(1008,1008));page=len(pages)
    for offset,data in enumerate(images[start:start+196]):
        tile=Image.open(io.BytesIO(data)).convert('RGBA')
        if tile.size!=(72,72): raise ValueError('Unexpected source dimensions')
        image.paste(tile,(offset%14*72,offset//14*72))
    name=f'sheet-{page:02}.png';image.save(output/name,optimize=True)
    pages.append({'file':name,'sha256':hashlib.sha256((output/name).read_bytes()).hexdigest()})
manifest={'schemaVersion':1,'source':'https://github.com/jdecked/twemoji','version':'17.0.3','revision':'b6b55fef1e8636b540a6d016a4729ca8cdf2e60b','license':'CC-BY-4.0','tileSize':72,'columns':14,'pageSize':1008,'pages':pages,'glyphs':placements}
(root/'src/renderer/reference-data/emoji-art.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
(root/'src/renderer/reference-data/TWEMOJI-LICENSE.txt').write_text('Twemoji graphics by Twitter, Inc. and contributors. https://github.com/jdecked/twemoji\nUnmodified graphics packed into PNG atlases for offline rendering.\n\n'+license_text,encoding='utf-8')
print(f'{len(placements)} emoji variants in {len(pages)} atlases; complete Unicode snapshot coverage.')
