import {t as tr} from './i18n';
import type {Clip,Kind} from './types';
import {clampRect,validRect,type Rect} from './desktop';
import {normalizeClipFilters,type ClipFilters} from './clip-filters';
export const TRAY_LIMIT=80,TRAY_TEXT_LIMIT=32768;
// Stable IPC marker: renderer recovery must not depend on display language.
export const TRAY_CATEGORY_MISSING='CLIPPER_TRAY_CATEGORY_MISSING';
export interface TrayQuery{text:string;kind:'all'|Kind;category:string;filters?:ClipFilters}
export const trayQuery:TrayQuery={text:'',kind:'all',category:''};
export interface TrayItem extends Pick<Clip,'id'|'kind'|'title'|'preview'|'source'|'updatedAt'|'favorite'|'pinned'|'bytes'>{token:string;previewKey:string;draggable:boolean}
export type TrayCounts=Record<'all'|Kind,number>;
export interface TrayState{items:TrayItem[];total:number;counts:TrayCounts;dark:boolean;canPaste:boolean;categories:{id:string;name:string}[];sources?:{name:string;count:number}[]}
export interface TrayPreview{token:string;kind:Kind;title:string;source:string;bytes:number;updatedAt:number;text:string;truncated:boolean;image?:string;files:{name:string;directory:boolean;saved:boolean}[]}
export interface TrayAPI{state(query:TrayQuery):Promise<TrayState>;preview(token:string):Promise<TrayPreview>;use(token:string,paste:boolean):Promise<void>;drag(token:string):void;hide():Promise<void>;main():Promise<void>;appIcons(names:string[]):Promise<Record<string,string|null>>;onChange(callback:()=>void):()=>void;onSession?(callback:(open:boolean)=>void):()=>void;onNotice(callback:(text:string)=>void):()=>void}
export function validateTrayQuery(value:unknown):TrayQuery{
 const v=value as TrayQuery,invalid=()=>new Error(tr('托盘搜索条件无效'));
 if(!v||typeof v.text!=='string'||v.text.length>512||!['all','text','link','code','image','files'].includes(v.kind)||typeof v.category!=='string'||v.category!==''&&!['favorites','pinned'].includes(v.category)&&!/^[0-9a-f-]{36}$/.test(v.category))throw invalid();
 if(v.filters!==undefined){const f=v.filters;if(!f||typeof f!=='object'||Array.isArray(f))throw invalid();for(const key of ['kinds','sources','tags','extensions'] as const)if(f[key]!==undefined&&(!Array.isArray(f[key])||f[key].length>100||f[key].some(value=>typeof value!=='string'||value.length>200)))throw invalid();for(const key of ['period','from','to','size'] as const)if(f[key]!==undefined&&typeof f[key]!=='string')throw invalid();for(const key of ['favorite','pinned'] as const)if(f[key]!==undefined&&typeof f[key]!=='boolean')throw invalid();}
 return {text:v.text.trim(),kind:v.kind,category:v.category,...(v.filters?{filters:normalizeClipFilters(v.filters)}:{})};
}
export function trayPanelBounds(anchor:Rect,area:Rect):Rect{
 if(!validRect(anchor)||!validRect(area))throw new Error(tr('托盘位置无效'));
 const width=Math.min(740,area.width),height=Math.min(560,area.height),gap=8;
 let x=anchor.x+anchor.width-width,y=anchor.y>area.y+area.height/2?anchor.y-height-gap:anchor.y+anchor.height+gap;
 if(anchor.x+anchor.width<=area.x+gap){x=anchor.x+anchor.width+gap;y=anchor.y-height/2;}
 else if(anchor.x>=area.x+area.width-gap){x=anchor.x-width-gap;y=anchor.y-height/2;}
 return clampRect({x,y,width,height},area,1,1);
}
