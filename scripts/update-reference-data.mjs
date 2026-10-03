// Refresh the offline reference catalogs from their primary registries.
// Run explicitly; normal builds use the checked-in snapshots and need no network.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import colorNames from 'color-name';

const output=resolve('src/renderer/reference-data');
await mkdir(output,{recursive:true});
const get=async url=>{const response=await fetch(url);if(!response.ok)throw new Error(`${url}: ${response.status}`);return response.text();};
const save=(name,value)=>writeFile(resolve(output,name),JSON.stringify(value));

// Keep the catalog aligned with the complete offline Twemoji 17 artwork snapshot.
const emojiText=await get('https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt');
let group='',subgroup='';
const emoji=[];
for(const line of emojiText.split(/\r?\n/)){
  if(line.startsWith('# group: ')){group=line.slice(9);continue;}
  if(line.startsWith('# subgroup: ')){subgroup=line.slice(12);continue;}
  const match=line.match(/^([0-9A-F ]+)\s*;\s*fully-qualified\s*#\s*\S+\s+E[\d.]+\s+(.+)$/);
  if(!match)continue;
  emoji.push([String.fromCodePoint(...match[1].trim().split(/\s+/).map(n=>parseInt(n,16))),match[2],group,subgroup]);
}
await save('emoji.json',emoji);

const unicodeData=await get('https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt');
const symbolRanges=[
  ['Currency',0x20a0,0x20cf],['Superscripts',0x2070,0x209f],
  ['Punctuation',0x2000,0x206f],['CJK punctuation',0x3000,0x303f],
  ['Enclosed numbers',0x2460,0x24ff],['Miscellaneous',0x2600,0x26ff],
  ['Arrows',0x2190,0x21ff],['Math',0x2200,0x22ff],
  ['Extra arrows',0x27f0,0x27ff],['Supplemental arrows',0x2900,0x297f],
  ['Supplemental math',0x2a00,0x2aff],
  ['Technical',0x2300,0x23ff],['Box drawing',0x2500,0x259f],
  ['Geometric',0x25a0,0x25ff],['Dingbats',0x2700,0x27bf],
  ['Braille',0x2800,0x283f],['Greek',0x0370,0x03ff],
  ['Roman numerals',0x2160,0x2188]
];
const symbols=[];
for(const line of unicodeData.split(/\r?\n/)){
  const [hex,name,category]=line.split(';');if(!hex||!name||!category)continue;
  const code=parseInt(hex,16),range=symbolRanges.find(([,start,end])=>code>=start&&code<=end);
  if(!range||!/[SPNL]/.test(category[0])||name.startsWith('<'))continue;
  symbols.push([String.fromCodePoint(code),name,range[0],hex]);
}
await save('symbols.json',symbols);

const entities=JSON.parse(await get('https://html.spec.whatwg.org/entities.json'));
await save('entities.json',Object.entries(entities).filter(([name])=>name.endsWith(';')).map(([name,value])=>[name,value.characters]));

const xml=await get('https://www.iana.org/assignments/media-types/media-types.xml');
const mime=[...xml.matchAll(/<file type="template">([^<]+)<\/file>/g)].map(match=>match[1]).filter(value=>/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(value));
await save('mime.json',[...new Set(mime)].sort());
await import('./update-mime-details.mjs');

const colors=Object.entries(colorNames).map(([name,rgb])=>[name,'#'+rgb.map(n=>n.toString(16).padStart(2,'0')).join('')]);
colors.push(['rebeccapurple','#663399']);
await save('colors.json',colors.sort(([a],[b])=>a.localeCompare(b)));

console.log(`Reference data: ${emoji.length} emoji, ${symbols.length} symbols, ${Object.keys(entities).length} entity aliases, ${mime.length} media types, ${colors.length} colors.`);
