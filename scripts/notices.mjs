import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {rustNotices} from './rust-notices.mjs';
const version=JSON.parse(await readFile('package.json','utf8')).version;
const output=[`Clipper ${version} — Third-party notices`,'Electron includes Chromium and Node.js. See LICENSE.electron.txt and LICENSES.chromium.html alongside Clipper.exe.','OneClip is a functional reference only; no OneClip source code is included.',''];
const quickjs=(await readdir('node_modules/@jitl')).filter(n=>n.startsWith('quickjs-')).map(n=>'@jitl/'+n);
const pki=new Set();async function visit(name){if(pki.has(name))return;pki.add(name);const pkg=JSON.parse(await readFile(join('node_modules',name,'package.json'),'utf8'));for(const child of Object.keys(pkg.dependencies||{}))await visit(child);}await visit('@peculiar/x509');await visit('reflect-metadata');await visit('better-sqlite3-multiple-ciphers');for(const name of ['@codemirror/commands','@codemirror/language','@codemirror/language-data','@codemirror/search','@codemirror/state','@codemirror/view','@lezer/highlight','music-metadata','exifr','pdf-lib','yauzl','@xmldom/xmldom'])await visit(name);
await visit('heic-decode');
for(const name of new Set(['electron','image-size','koffi','lucide','color-name','marked','katex','commander','@koromix/koffi-win32-x64','quickjs-emscripten','quickjs-emscripten-core',...quickjs,...pki])){
 const root=join('node_modules',name);const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));output.push(`${name} ${pkg.version} (${pkg.license})`);
 for(const file of await readdir(root))if(/^licen[sc]e(?:\..*)?$/i.test(file))output.push(await readFile(join(root,file),'utf8'));
 output.push('');
}
output.push(await readFile('licenses/SQLite3MultipleCiphers.txt','utf8'));
output.push('Unicode emoji and Unicode character names — https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt and https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt');
output.push(await readFile('src/renderer/reference-data/UNICODE-LICENSE.txt','utf8'));
output.push('Noto Color Emoji COLRv1 (flag glyph subset) — SIL Open Font License 1.1 — https://github.com/googlefonts/noto-emoji');
output.push(await readFile('licenses/NotoColorEmoji-OFL.txt','utf8'));
output.push('mime-db 1.54.0 — offline MIME extension data — https://github.com/jshttp/mime-db');
output.push(await readFile('src/renderer/reference-data/MIME-DB-LICENSE.txt','utf8'));
output.push('Apache Tika MIME descriptions — https://github.com/apache/tika/tree/ccec84eb030fbfddcceffe063621e74ca81b13a3/tika-core/src/main/resources/org/apache/tika/mime');
output.push(await readFile('src/renderer/reference-data/TIKA-LICENSE.txt','utf8'));
output.push(await readFile('src/renderer/reference-data/TIKA-NOTICE.txt','utf8'));
output.push('Wikidata MIME type descriptions and extension mappings (human-reviewed and paraphrased) — CC0 1.0 — https://www.wikidata.org/wiki/Property:P1163 and https://www.wikidata.org/wiki/Property:P1195 and https://www.wikidata.org/wiki/Wikidata:Licensing');
output.push('Quick Reference — complete Git, LaTeX, Bash, Linux and Regex documents — https://github.com/jaywcjlove/reference');
output.push(await readFile('src/renderer/reference-data/QUICKREF-LICENSE.txt','utf8'));
output.push(rustNotices);
await writeFile('THIRD_PARTY_NOTICES.txt',output.join('\n').replaceAll('\r\n','\n'));
