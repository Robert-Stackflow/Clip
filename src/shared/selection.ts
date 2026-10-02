import type {Point,Rect} from './desktop';
export const SELECTION_LIMIT=32768;
export const SELECTION_BYTES=128*1024;
export interface SelectionOptions {enabled:boolean;shortcut:string;delayMs:number;excludedApps:string[]}
export const selectionDefaults:SelectionOptions={enabled:false,shortcut:'Control+Alt+X',delayMs:200,excludedApps:[]};
export type SelectionAction='copy'|'save'|'translate'|'summarize'|'script'|'exclude';
export type SelectionStatus='ok'|'none'|'unsupported'|'protected'|'stale'|'large'|'unavailable';
export interface SelectionRead {id:string;status:SelectionStatus;text?:string;rects:Rect[]}
export interface SelectionRequest {id:string;hwnd:number;pid:number;x:number;y:number;allowedForeground?:number}
export interface SelectionState {options:SelectionOptions;status:string}
export interface SelectionView {token:string;preview:string;characters:number;source:string;dark:boolean;keyboard:boolean}
export interface SelectionInput {text:string;action:'translate'|'summarize'|'script'}
export interface SelectionAPI {state():Promise<SelectionView|null>;action(token:string,action:SelectionAction):Promise<void>;hide():Promise<void>;onChange(callback:()=>void):()=>void}
export function validateSelection(value:unknown):SelectionOptions{
 if(!value||typeof value!=='object')throw new Error('划词设置无效');const v={...selectionDefaults,...value} as SelectionOptions;
 if(typeof v.enabled!=='boolean'||!Number.isInteger(v.delayMs)||v.delayMs<100||v.delayMs>1000||!Array.isArray(v.excludedApps)||v.excludedApps.length>100||v.excludedApps.some(s=>typeof s!=='string'||!/^[^\\/:*?"<>|\r\n]{1,120}\.exe$/i.test(s)))throw new Error('划词设置或排除应用无效');
 if(typeof v.shortcut!=='string'||!/^(?:(?:Control|Alt|Shift|Super)\+){2,}(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(v.shortcut))throw new Error('划词快捷键需包含至少两个修饰键');
 const parts=v.shortcut.split('+').slice(0,-1);if(new Set(parts).size!==parts.length)throw new Error('快捷键修饰键不能重复');
 return {enabled:v.enabled,shortcut:v.shortcut,delayMs:v.delayMs,excludedApps:[...new Set(v.excludedApps.map(s=>s.toLowerCase()))]};
}
export function validateSelectionRead(value:unknown,id:string):SelectionRead{
 const v=value as SelectionRead;if(!v||v.id!==id||!['ok','none','unsupported','protected','stale','large','unavailable'].includes(v.status)||!Array.isArray(v.rects)||v.rects.length>64)throw new Error('选区接口返回无效结果');
 if(v.status==='ok'&&(typeof v.text!=='string'||!v.text.trim()||v.text.length>SELECTION_LIMIT||new TextEncoder().encode(v.text).length>SELECTION_BYTES))throw new Error('选中文字为空或超过限制');
 const rects=v.rects.filter(r=>r&&[r.x,r.y,r.width,r.height].every(n=>Number.isFinite(n)&&Math.abs(n)<100000)&&r.width>0&&r.height>0);
 return {id,status:v.status,...(v.status==='ok'?{text:v.text}:{}),rects};
}
export function selectionBounds(point:Point,area:Rect,width=430,height=96):Rect{
 const mx=Math.min(8,Math.max(0,(area.width-1)/2)),my=Math.min(8,Math.max(0,(area.height-1)/2));width=Math.min(width,Math.max(1,area.width-mx*2));height=Math.min(height,Math.max(1,area.height-my*2));const x=Math.round(Math.max(area.x+mx,Math.min(area.x+area.width-width-mx,point.x-width/2))),below=point.y+16,y=below+height<=area.y+area.height-my?below:point.y-height-16;
 return {x,y:Math.round(Math.max(area.y+my,Math.min(area.y+area.height-height-my,y))),width,height};
}
