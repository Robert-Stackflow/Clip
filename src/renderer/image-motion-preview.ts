// Temporary motion previews are bounded independently of the full-resolution edit.
export const PREVIEW_PIXELS=4_000_000;
export function previewSize(width:number,height:number,displayWidth:number,displayHeight:number,ratio:number){
 const scale=Math.min(1,Math.max(displayWidth/width,displayHeight/height)*Math.max(1,ratio),Math.sqrt(PREVIEW_PIXELS/(width*height)));
 return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}
