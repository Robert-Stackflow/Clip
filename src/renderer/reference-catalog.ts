import metadata from './reference-data/catalog-metadata.json';
const {kaomojiGroups,groups,mimeDescriptions,asciiNames}=metadata;
import emoji from './reference-data/emoji.json';
import symbols from './reference-data/symbols.json';
import entities from './reference-data/entities.json';
import mime from './reference-data/mime-details.json';
import mimeSourceDescriptions from './reference-data/mime-descriptions.json';
import colors from './reference-data/colors.json';
import {interfaceLanguage} from '../shared/i18n';
export const tx=(zh:string,english:string)=>interfaceLanguage()==='en'?english:zh;
export type Entry={glyph:string;title:string;detail:string;group:string;copy:string;secondary?:string;color?:string;tones?:Map<number,string>;variants?:string[];extensions?:string[]};

export const groupLabel=(name:string)=>{const names=(groups as Record<string,string[]>)[name];return names?tx(names[0],names[1]):name;};
const modifier=/[\u{1F3FB}-\u{1F3FF}]/gu;
const family=(glyph:string)=>glyph.replace(modifier,'').replace(/\uFE0F/g,'');
function emojiEntries():Entry[]{
 const families=new Map<string,Entry>();
 for(const [glyph,title,group,detail] of emoji as string[][]){
  const key=family(glyph);let item=families.get(key);
  if(!item){item={glyph,title:title.replace(/: .*skin tone.*$/,''),group,detail,copy:glyph,tones:new Map(),variants:[]};families.set(key,item);}
  item.variants!.push(glyph);
  const tones=Array.from(glyph.matchAll(modifier),match=>match[0].codePointAt(0)!-0x1F3FA);
  if(!tones.length){item.glyph=glyph;item.copy=glyph;item.title=title;item.tones!.set(0,glyph);}
  else if(tones.every(tone=>tone===tones[0]))item.tones!.set(tones[0],glyph);
 }
 return [...families.values()];
}
export const toneGlyph=(item:Entry,tone:number)=>item.tones?.get(tone)||item.tones?.get(0)||item.glyph;
const symbolGroups=new Map((symbols as string[][]).map(([glyph,,group])=>[glyph,group]));
function entityGroup(glyph:string){return symbolGroups.get(glyph)||(/^[A-Za-zÀ-ʯ]/u.test(glyph)?'Letters':/^[0-9]/.test(glyph)?'Digits':'Other');}
function colorGroup(hex:string){
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min;
 if(delta<.06||max<.12)return 'Neutral';
 let hue=(max===rgb[0]?(rgb[1]-rgb[2])/delta:max===rgb[1]?(rgb[2]-rgb[0])/delta+2:(rgb[0]-rgb[1])/delta+4)*60;hue=(hue+360)%360;
 return hue<16||hue>=345?'Red':hue<45?'Orange':hue<70?'Yellow':hue<165?'Green':hue<195?'Cyan':hue<255?'Blue':hue<295?'Purple':'Pink';
}
function mimeDescription(type:string){
 const description=(mimeDescriptions as Record<string,string[]>)[type];if(description)return tx(description[0],description[1]);
 const sourceDescription=(mimeSourceDescriptions as Record<string,string>)[type];if(sourceDescription)return sourceDescription;
 const [group,subtype]=type.split('/');
 const suffix=subtype.endsWith('+json')?'JSON':subtype.endsWith('+xml')?'XML':subtype.endsWith('+zip')?'ZIP':subtype.endsWith('+cbor')?'CBOR':'';
 return suffix?tx(`${groupLabel(group)}，使用 ${suffix} 格式；${subtype} 定义其具体用途`,`${groupLabel(group)} using ${suffix}; ${subtype} defines its purpose`):tx(`${groupLabel(group)}媒体类型；具体格式由 ${subtype} 的规范定义`,`${groupLabel(group)} media type; its format is defined by the ${subtype} specification`);
}
export function referenceCatalog():Record<string,{label:string;source:string;items:Entry[]}>{return {
 emoji:{label:'Emoji',source:'https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt',items:emojiEntries()},
 kaomoji:{label:tx('颜文字','Kaomoji'),source:'',items:Object.entries(kaomojiGroups).flatMap(([group,values])=>values.map(glyph=>({glyph,title:groupLabel(group),detail:'',group,copy:glyph})))},
 symbols:{label:tx('符号','Symbols'),source:'https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt',items:(symbols as string[][]).map(([glyph,title,group,code])=>({glyph,title,detail:'U+'+code,group,copy:glyph}))},
 entities:{label:tx('HTML 实体','HTML entities'),source:'https://html.spec.whatwg.org/entities.json',items:(entities as string[][]).map(([title,glyph])=>({glyph,title,detail:Array.from(glyph,c=>'U+'+c.codePointAt(0)!.toString(16).toUpperCase()).join(' '),group:entityGroup(glyph),copy:title,secondary:glyph}))},
 colors:{label:tx('命名颜色','Named Colors'),source:'https://www.w3.org/TR/css-color-4/#named-colors',items:(colors as string[][]).map(([title,color])=>({glyph:'',title,detail:color.toUpperCase(),group:colorGroup(color),copy:color,secondary:title,color}))},
 mime:{label:'MIME',source:'https://www.iana.org/assignments/media-types/',items:(mime as [string,string[],string][]).map(([type,extensions,charset])=>({glyph:type,title:type,detail:mimeDescription(type)+(charset?` · ${charset}`:''),group:type.split('/')[0],copy:type,extensions}))},
 ascii:{label:'ASCII',source:'https://www.rfc-editor.org/rfc/rfc20',items:Array.from({length:128},(_,code)=>({glyph:code<32?asciiNames[code]:code===32?'␣':code===127?'DEL':String.fromCharCode(code),title:code<32?asciiNames[code]:code===32?'SPACE':code===127?'DEL':String.fromCharCode(code),detail:`${code} · 0x${code.toString(16).toUpperCase().padStart(2,'0')} · ${code.toString(2).padStart(8,'0')}`,group:code<32||code===127?'Control':code<48?'Punctuation':code<58?'Digits':code<65?'Punctuation':code<91?'Uppercase':code<97?'Punctuation':code<123?'Lowercase':'Punctuation',copy:code<32||code===127?'\\x'+code.toString(16).toUpperCase().padStart(2,'0'):String.fromCharCode(code)}))}
};}
