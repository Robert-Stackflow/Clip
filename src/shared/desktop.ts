import {t as tr} from './i18n';
import type {Clip} from './types';
export type Edge='left'|'right'|'top'|'bottom';
export type CardDirection='vertical'|'horizontal'|'grid';
export interface Rect{x:number;y:number;width:number;height:number}
export interface Point{x:number;y:number}
export interface DisplayInfo{id:number;name:string;bounds:Rect;workArea:Rect}
export interface DesktopOptions {cardDirection:CardDirection;dockEnabled:boolean;dockEdge:Edge;displayId:number|null;dwellMs:number;autoHide:boolean;shelfTop:boolean;shelfOnTop:boolean;shelfShortcut:string}
export const desktopDefaults:DesktopOptions={cardDirection:'grid',dockEnabled:false,dockEdge:'right',displayId:null,dwellMs:450,autoHide:true,shelfTop:false,shelfOnTop:true,shelfShortcut:'Control+Shift+D'};
export interface DesktopState {options:DesktopOptions;displays:DisplayInfo[];shelfVisible:boolean;quickVisible:boolean}
export interface ShelfState {items:Clip[];dark:boolean;onTop:boolean}
export interface ShelfAPI {state():Promise<ShelfState>;choose():Promise<void>;dropFiles(files:File[]):Promise<void>;dropText(text:string):Promise<void>;remove(id:string):Promise<void>;copy(id:string,paste:boolean):Promise<void>;drag(id:string):void;hide():Promise<void>;main():Promise<void>;top(value:boolean):Promise<void>;onChange(callback:()=>void):()=>void;onNotice(callback:(text:string)=>void):()=>void}
export function validateDesktop(value:unknown):DesktopOptions {const v={...desktopDefaults,...(value as object)} as DesktopOptions;
 if(!value||typeof value!=='object'||!['vertical','horizontal','grid'].includes(v.cardDirection)||!['left','right','top','bottom'].includes(v.dockEdge)||[v.dockEnabled,v.autoHide,v.shelfTop,v.shelfOnTop].some(x=>typeof x!=='boolean')||v.displayId!==null&&!Number.isSafeInteger(v.displayId)||!Number.isInteger(v.dwellMs)||v.dwellMs<200||v.dwellMs>1500)throw new Error(tr('桌面设置无效'));
 if(typeof v.shelfShortcut!=='string'||! /^(?:(?:Control|Alt|Shift|Super)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(v.shelfShortcut)||v.shelfShortcut.split('+').length<3)throw new Error(tr('拖放快捷键需包含至少两个修饰键'));
 const modifiers=v.shelfShortcut.split('+').slice(0,-1);if(new Set(modifiers).size!==modifiers.length)throw new Error(tr('快捷键修饰键不能重复'));
 return {cardDirection:v.cardDirection,dockEnabled:v.dockEnabled,dockEdge:v.dockEdge,displayId:v.displayId,dwellMs:v.dwellMs,autoHide:v.autoHide,shelfTop:v.shelfTop,shelfOnTop:v.shelfOnTop,shelfShortcut:v.shelfShortcut};
}
export const contains=(r:Rect,p:Point,margin=0)=>p.x>=r.x-margin&&p.x<r.x+r.width+margin&&p.y>=r.y-margin&&p.y<r.y+r.height+margin;
export function clampRect(value:Rect,area:Rect,minWidth=280,minHeight=220):Rect {const width=Math.min(area.width,Math.max(minWidth,Math.round(value.width))),height=Math.min(area.height,Math.max(minHeight,Math.round(value.height)));return {x:Math.round(Math.max(area.x,Math.min(area.x+area.width-width,value.x))),y:Math.round(Math.max(area.y,Math.min(area.y+area.height-height,value.y))),width,height};}
export function validRect(value:unknown):value is Rect {const v=value as Rect;return !!v&&[v.x,v.y,v.width,v.height].every(n=>Number.isFinite(n)&&Math.abs(n)<100000)&&v.width>0&&v.height>0;}
export function dockRect(area:Rect,edge:Edge):Rect {const side=edge==='left'||edge==='right',width=Math.min(area.width,side?450:1000),height=Math.min(area.height,side?760:380);const x=edge==='left'?area.x:edge==='right'?area.x+area.width-width:area.x+(area.width-width)/2,y=edge==='top'?area.y:edge==='bottom'?area.y+area.height-height:area.y+(area.height-height)/2;return clampRect({x,y,width,height},area,1,1);}
export function outerEdgeAt(point:Point,display:DisplayInfo,others:DisplayInfo[],edge:Edge,thickness=4):boolean {const a=display.workArea;if(!contains(a,point))return false;const side=edge==='left'||edge==='right',axis=side?point.y-a.y:point.x-a.x,length=side?a.height:a.width,corner=Math.min(64,length/4);if(axis<corner||axis>=length-corner)return false;
 const distance=edge==='left'?point.x-a.x:edge==='right'?a.x+a.width-1-point.x:edge==='top'?point.y-a.y:a.y+a.height-1-point.y;if(distance<0||distance>=thickness)return false;
 const b=display.bounds,outside={x:edge==='left'?b.x-1:edge==='right'?b.x+b.width:point.x,y:edge==='top'?b.y-1:edge==='bottom'?b.y+b.height:point.y};return !others.some(d=>d.id!==display.id&&contains(d.bounds,outside));
}
export function topShelfAt(point:Point,display:DisplayInfo,others:DisplayInfo[]):boolean {const a=display.workArea;return Math.abs(point.x-(a.x+a.width/2))<=90&&outerEdgeAt(point,display,others,'top',8);}
export function coversDisplay(rect:Rect,display:DisplayInfo):boolean {const b=display.bounds;return rect.x<=b.x+2&&rect.y<=b.y+2&&rect.x+rect.width>=b.x+b.width-2&&rect.y+rect.height>=b.y+b.height-2;}
export function cardNavigation(index:number,count:number,columns:number,direction:CardDirection,key:string):number {if(count<1)return -1;const i=Math.max(0,index),cols=Math.max(1,columns);let step=0;if(direction==='horizontal')step=key==='ArrowRight'||key==='ArrowDown'?1:key==='ArrowLeft'||key==='ArrowUp'?-1:0;else if(direction==='vertical')step=key==='ArrowDown'?1:key==='ArrowUp'?-1:0;else{if(key==='ArrowDown')step=cols;if(key==='ArrowUp')step=-cols;if(key==='ArrowRight'&&i%cols<cols-1)step=1;if(key==='ArrowLeft'&&i%cols>0)step=-1;}return Math.max(0,Math.min(count-1,i+step));}

