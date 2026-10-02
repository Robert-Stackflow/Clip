export const EDIT_PIXELS=16_000_000,EDIT_STEPS=100;
export interface Point{x:number;y:number}
export interface Box{x:number;y:number;width:number;height:number}
export type EditOperation={kind:'crop';box:Box}|{kind:'rotate'|'flip'}|{kind:'pen';points:Point[];color:string;width:number}|{kind:'rect'|'arrow'|'cover';a:Point;b:Point;color:string;width:number}|{kind:'text';at:Point;text:string;color:string;width:number};
export function editSize(width:number,height:number){if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>16384||height>16384||width*height>EDIT_PIXELS)throw new Error('图片编辑支持最多 1,600 万像素、最长边 16,384 像素');return {width,height};}
export function editBox(a:Point,b:Point,width:number,height:number):Box {const x=Math.max(0,Math.min(width-1,Math.floor(Math.min(a.x,b.x)))),y=Math.max(0,Math.min(height-1,Math.floor(Math.min(a.y,b.y)))),right=Math.max(x+1,Math.min(width,Math.ceil(Math.max(a.x,b.x)))),bottom=Math.max(y+1,Math.min(height,Math.ceil(Math.max(a.y,b.y))));return {x,y,width:right-x,height:bottom-y};}
export interface ImageEditorState{url:string;name:string;dark:boolean}
export interface ImageEditorAPI{state():Promise<ImageEditorState>;dirty(value:boolean):Promise<void>;save(png:string,mode:'history'|'copy'|'export'):Promise<string|null>;onChange(callback:()=>void):()=>void}
