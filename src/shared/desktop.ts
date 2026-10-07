import type {ImageDrops} from './image-drop';
import {t as tr} from './i18n';
import type {Clip} from './types';
import {shortcutKey} from './shortcut';
export type Edge='left'|'right'|'top'|'bottom';
export type CardDirection='vertical'|'horizontal'|'grid';
export type ShelfMode='compact'|'expanded';
export type ShelfPosition='top-right'|'top-left'|'bottom-right'|'bottom-left';
export interface Rect{x:number;y:number;width:number;height:number}
export interface Point{x:number;y:number}
export interface DisplayInfo{id:number;name:string;bounds:Rect;workArea:Rect}
export interface DesktopOptions {cardDirection:CardDirection;displayId:number|null;dwellMs:number;shelfTop:boolean;shelfAutoDrag:boolean;shelfAutoHide:boolean;shelfAutoHideSeconds:number;shelfOnTop:boolean;shelfLocked:boolean;shelfPosition:ShelfPosition;shelfShortcut:string}
export const desktopDefaults:DesktopOptions={cardDirection:'grid',displayId:null,dwellMs:450,shelfTop:false,shelfAutoDrag:false,shelfAutoHide:true,shelfAutoHideSeconds:6,shelfOnTop:true,shelfLocked:false,shelfPosition:'top-right',shelfShortcut:'Control+Shift+D'};
export interface DesktopState {options:DesktopOptions;displays:DisplayInfo[];shelfVisible:boolean}
export interface ShelfState {items:Clip[];dark:boolean;locked:boolean;mode:ShelfMode}
export interface ShelfAPI {state():Promise<ShelfState>;activity(active:boolean):Promise<void>;choose():Promise<void>;dropFiles(files:File[]):Promise<void>;dropText(text:string):Promise<void>;dropImage(value:ImageDrops):Promise<void>;remove(id:string):Promise<void>;copy(id:string,paste:boolean):Promise<void>;drag(id:string):void;hide():Promise<void>;main():Promise<void>;top(value:boolean):Promise<void>;mode(value:ShelfMode,reducedMotion:boolean):Promise<void>;onChange(callback:()=>void):()=>void;onTransition(callback:(active:boolean,mode:ShelfMode,size?:{width:number;height:number})=>void):()=>void;onNotice(callback:(text:string)=>void):()=>void}
export function validateDesktop(value:unknown):DesktopOptions {const v={...desktopDefaults,...(value as object)} as DesktopOptions;
 if(!value||typeof value!=='object'||!['vertical','horizontal','grid'].includes(v.cardDirection)||!['top-right','top-left','bottom-right','bottom-left'].includes(v.shelfPosition)||[v.shelfTop,v.shelfAutoDrag,v.shelfAutoHide,v.shelfOnTop,v.shelfLocked].some(x=>typeof x!=='boolean')||v.displayId!==null&&!Number.isSafeInteger(v.displayId)||!Number.isInteger(v.dwellMs)||v.dwellMs<200||v.dwellMs>1500||!Number.isInteger(v.shelfAutoHideSeconds)||v.shelfAutoHideSeconds<3||v.shelfAutoHideSeconds>60)throw new Error(tr('桌面设置无效'));
 const shelfShortcut=shortcutKey(v.shelfShortcut);
 return {cardDirection:v.cardDirection,displayId:v.displayId,dwellMs:v.dwellMs,shelfTop:v.shelfTop,shelfAutoDrag:v.shelfAutoDrag,shelfAutoHide:v.shelfAutoHide,shelfAutoHideSeconds:v.shelfAutoHideSeconds,shelfOnTop:v.shelfOnTop,shelfLocked:v.shelfLocked,shelfPosition:v.shelfPosition,shelfShortcut};
}
export function dragGestureReady(start:Point,current:Point,elapsedMs:number):boolean {const dx=current.x-start.x,dy=current.y-start.y;return elapsedMs>=180&&dx*dx+dy*dy>=36*36;}
export const contains=(r:Rect,p:Point,margin=0)=>p.x>=r.x-margin&&p.x<r.x+r.width+margin&&p.y>=r.y-margin&&p.y<r.y+r.height+margin;
export function clampRect(value:Rect,area:Rect,minWidth=280,minHeight=220):Rect {const width=Math.min(area.width,Math.max(minWidth,Math.round(value.width))),height=Math.min(area.height,Math.max(minHeight,Math.round(value.height)));return {x:Math.round(Math.max(area.x,Math.min(area.x+area.width-width,value.x))),y:Math.round(Math.max(area.y,Math.min(area.y+area.height-height,value.y))),width,height};}
export function validRect(value:unknown):value is Rect {const v=value as Rect;return !!v&&[v.x,v.y,v.width,v.height].every(n=>Number.isFinite(n)&&Math.abs(n)<100000)&&v.width>0&&v.height>0;}
export function shelfCompactRect(area:Rect,position:ShelfPosition):Rect {const width=Math.min(300,area.width),height=Math.min(138,area.height),gap=20;return {x:position.endsWith('right')?area.x+area.width-width-Math.min(gap,area.width-width):area.x+Math.min(gap,area.width-width),y:position.startsWith('bottom')?area.y+area.height-height-Math.min(gap,area.height-height):area.y+Math.min(gap,area.height-height),width,height};}
export function shelfActivationAt(point:Point,area:Rect,position:ShelfPosition):boolean {const shelf=shelfCompactRect(area,position),right=position.endsWith('right'),bottom=position.startsWith('bottom'),x=right?shelf.x:area.x,y=bottom?shelf.y:area.y;return contains({x,y,width:right?area.x+area.width-x:shelf.x+shelf.width-x,height:bottom?area.y+area.height-y:shelf.y+shelf.height-y},point);}
export function outerEdgeAt(point:Point,display:DisplayInfo,others:DisplayInfo[],edge:Edge,thickness=4):boolean {const a=display.workArea;if(!contains(a,point))return false;const side=edge==='left'||edge==='right',axis=side?point.y-a.y:point.x-a.x,length=side?a.height:a.width,corner=Math.min(64,length/4);if(axis<corner||axis>=length-corner)return false;
 const distance=edge==='left'?point.x-a.x:edge==='right'?a.x+a.width-1-point.x:edge==='top'?point.y-a.y:a.y+a.height-1-point.y;if(distance<0||distance>=thickness)return false;
 const b=display.bounds,outside={x:edge==='left'?b.x-1:edge==='right'?b.x+b.width:point.x,y:edge==='top'?b.y-1:edge==='bottom'?b.y+b.height:point.y};return !others.some(d=>d.id!==display.id&&contains(d.bounds,outside));
}
export function topShelfAt(point:Point,display:DisplayInfo,others:DisplayInfo[]):boolean {const a=display.workArea;return Math.abs(point.x-(a.x+a.width/2))<=90&&outerEdgeAt(point,display,others,'top',8);}
export function coversDisplay(rect:Rect,display:DisplayInfo):boolean {const b=display.bounds;return rect.x<=b.x+2&&rect.y<=b.y+2&&rect.x+rect.width>=b.x+b.width-2&&rect.y+rect.height>=b.y+b.height-2;}
export function cardNavigation(index:number,count:number,columns:number,direction:CardDirection,key:string):number {if(count<1)return -1;const i=Math.max(0,index),cols=Math.max(1,columns);let step=0;if(direction==='horizontal')step=key==='ArrowRight'||key==='ArrowDown'?1:key==='ArrowLeft'||key==='ArrowUp'?-1:0;else if(direction==='vertical')step=key==='ArrowDown'?1:key==='ArrowUp'?-1:0;else{if(key==='ArrowDown')step=cols;if(key==='ArrowUp')step=-cols;if(key==='ArrowRight'&&i%cols<cols-1)step=1;if(key==='ArrowLeft'&&i%cols>0)step=-1;}return Math.max(0,Math.min(count-1,i+step));}
