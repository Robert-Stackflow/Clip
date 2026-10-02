import type {Clip,Kind} from './types';
import {clampRect,validRect,type Rect} from './desktop';
export const TRAY_LIMIT=80,TRAY_TEXT_LIMIT=32768;
export interface TrayQuery{text:string;kind:'all'|Kind;category:string}
export const trayQuery:TrayQuery={text:'',kind:'all',category:''};
export interface TrayItem extends Pick<Clip,'id'|'kind'|'title'|'preview'|'source'|'updatedAt'|'favorite'|'pinned'>{token:string;draggable:boolean}
export interface TrayState{items:TrayItem[];total:number;dark:boolean;canPaste:boolean;categories:{id:string;name:string}[]}
export interface TrayPreview{token:string;kind:Kind;title:string;source:string;bytes:number;updatedAt:number;text:string;truncated:boolean;image?:string;files:{name:string;directory:boolean;saved:boolean}[]}
export interface TrayAPI{state(query:TrayQuery):Promise<TrayState>;preview(token:string):Promise<TrayPreview>;use(token:string,paste:boolean):Promise<void>;drag(token:string):void;hide():Promise<void>;main():Promise<void>;onChange(callback:()=>void):()=>void;onNotice(callback:(text:string)=>void):()=>void}
export function validateTrayQuery(value:unknown):TrayQuery{const v=value as TrayQuery;if(!v||typeof v.text!=='string'||v.text.length>512||!['all','text','link','code','image','files'].includes(v.kind)||typeof v.category!=='string'||v.category!==''&&v.category!=='favorites'&&!/^[0-9a-f-]{36}$/.test(v.category))throw new Error('托盘搜索条件无效');return {text:v.text.trim(),kind:v.kind,category:v.category};}
export function trayPanelBounds(anchor:Rect,area:Rect):Rect{
 if(!validRect(anchor)||!validRect(area))throw new Error('托盘位置无效');
 const width=Math.min(740,area.width),height=Math.min(560,area.height),gap=8;
 let x=anchor.x+anchor.width-width,y=anchor.y>area.y+area.height/2?anchor.y-height-gap:anchor.y+anchor.height+gap;
 if(anchor.x+anchor.width<=area.x+gap){x=anchor.x+anchor.width+gap;y=anchor.y-height/2;}
 else if(anchor.x>=area.x+area.width-gap){x=anchor.x-width-gap;y=anchor.y-height/2;}
 return clampRect({x,y,width,height},area,1,1);
}
