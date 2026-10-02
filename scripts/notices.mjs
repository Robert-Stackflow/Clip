import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {rustNotices} from './rust-notices.mjs';
const version=JSON.parse(await readFile('package.json','utf8')).version;
const output=[`Clipper ${version} — Third-party notices`,'Electron includes Chromium and Node.js. See LICENSE.electron.txt and LICENSES.chromium.html alongside Clipper.exe.','OneClip is a functional reference only; no OneClip source code is included.',''];
const quickjs=(await readdir('node_modules/@jitl')).filter(n=>n.startsWith('quickjs-')).map(n=>'@jitl/'+n);
const pki=new Set();async function visit(name){if(pki.has(name))return;pki.add(name);const pkg=JSON.parse(await readFile(join('node_modules',name,'package.json'),'utf8'));for(const child of Object.keys(pkg.dependencies||{}))await visit(child);}await visit('@peculiar/x509');await visit('reflect-metadata');await visit('better-sqlite3-multiple-ciphers');for(const name of ['@codemirror/commands','@codemirror/language','@codemirror/language-data','@codemirror/search','@codemirror/state','@codemirror/view','@lezer/highlight','music-metadata','exifr','pdf-lib','yauzl','@xmldom/xmldom'])await visit(name);
for(const name of new Set(['electron','image-size','koffi','lucide','@koromix/koffi-win32-x64','quickjs-emscripten','quickjs-emscripten-core',...quickjs,...pki])){
 const root=join('node_modules',name);const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));output.push(`${name} ${pkg.version} (${pkg.license})`);
 for(const file of await readdir(root))if(/^licen[sc]e(?:\..*)?$/i.test(file))output.push(await readFile(join(root,file),'utf8'));
 output.push('');
}
output.push(await readFile('licenses/SQLite3MultipleCiphers.txt','utf8'));
output.push(rustNotices);
await writeFile('THIRD_PARTY_NOTICES.txt',output.join('\n'));
