import {clampRect,validRect,type Rect} from './desktop';
import type {TrayPreview} from './tray';
export interface QuickHoverRect{left:number;top:number;width:number;height:number}
export type PreviewSide='right'|'left'|'below'|'above';
export interface QuickPreviewState{item:TrayPreview;side:PreviewSide;arrow:number;dark:boolean}
export function quickPreviewPlacement(panel:Rect,anchor:Rect,area:Rect,height=440):{bounds:Rect;side:PreviewSide;arrow:number}{
 if(!validRect(panel)||!validRect(anchor)||!validRect(area))throw new Error('Invalid preview bounds');
 const gap=12,width=Math.min(380,area.width),wantedHeight=Math.min(height,area.height);
 const right=area.x+area.width-panel.x-panel.width-gap,left=panel.x-area.x-gap;
 let side:PreviewSide=right>=width?'right':left>=width?'left':right>=left?'right':'left',w=width,h=wantedHeight;
 if(Math.max(left,right)<180){const below=area.y+area.height-panel.y-panel.height-gap,above=panel.y-area.y-gap;if(Math.max(below,above)>=140){side=below>=above?'below':'above';h=Math.min(h,Math.max(below,above));}}
 if(side==='right'||side==='left')w=Math.max(1,Math.min(width,Math.max(right,left)));
 const bounds=clampRect({x:side==='right'?panel.x+panel.width+gap:side==='left'?panel.x-w-gap:anchor.x+anchor.width/2-w/2,y:side==='below'?panel.y+panel.height+gap:side==='above'?panel.y-h-gap:anchor.y+anchor.height/2-h/2,width:w,height:h},area,1,1);
 const horizontal=side==='above'||side==='below',length=horizontal?bounds.width:bounds.height,center=horizontal?anchor.x+anchor.width/2-bounds.x:anchor.y+anchor.height/2-bounds.y;
 return {bounds,side,arrow:Math.max(Math.min(28,length/2),Math.min(center,length-Math.min(28,length/2)))};
}
export interface QuickPreviewAPI{onState(callback:(value:QuickPreviewState|null)=>void):()=>void;presence(inside:boolean):void}
declare global{interface Window{clipQuickPreview:QuickPreviewAPI}}
