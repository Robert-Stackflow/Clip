import emoji from './reference-data/emoji.json';
import symbols from './reference-data/symbols.json';
import metadata from './reference-data/catalog-metadata.json';
import {interfaceLanguage} from '../shared/i18n';
import type {GlyphTab} from '../shared/quick-panel';
export interface QuickEntry{glyph:string;title:string;group:string;search:string}
const labels=metadata.groups as Record<string,string[]>;
export const quickGroupLabel=(group:string)=>labels[group]?.[interfaceLanguage()==='en'?1:0]||group;
const cache=new Map<GlyphTab,QuickEntry[]>();
export function quickCatalog(tab:GlyphTab):QuickEntry[]{
 let items=cache.get(tab);if(items)return items;
 const rows:string[][]=tab==='emoji'?(emoji as string[][]).filter(([glyph])=>!/[\u{1F3FB}-\u{1F3FF}]/u.test(glyph)):tab==='symbols'?symbols as string[][]:Object.entries(metadata.kaomojiGroups).flatMap(([group,values])=>values.map(glyph=>[glyph,quickGroupLabel(group),group]));
 items=rows.filter(([glyph])=>!!glyph.trim()).map(([glyph,title,group,detail])=>({glyph,title,group,search:[glyph,title,group,quickGroupLabel(group),detail||''].join(' ').toLocaleLowerCase()}));cache.set(tab,items);return items;
}
