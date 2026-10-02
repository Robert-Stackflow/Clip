import {editBox,type EditOperation} from '../shared/image-edit';
export function drawMark(ctx:CanvasRenderingContext2D,op:EditOperation,size:Pick<HTMLCanvasElement,'width'|'height'>=ctx.canvas){if(['rotate','flip','crop'].includes(op.kind))return;const mark=op as Exclude<EditOperation,{kind:'crop'|'rotate'|'flip'}>;ctx.save();ctx.strokeStyle=ctx.fillStyle=mark.color;ctx.lineWidth=mark.width;ctx.lineCap=ctx.lineJoin='round';
 if(mark.kind==='pen'){if(mark.points.length){ctx.beginPath();ctx.moveTo(mark.points[0].x,mark.points[0].y);for(const p of mark.points.slice(1))ctx.lineTo(p.x,p.y);if(mark.points.length===1){ctx.arc(mark.points[0].x,mark.points[0].y,mark.width/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();}}
 else if(mark.kind==='text'){ctx.font=`${mark.width}px 'Segoe UI','Microsoft YaHei UI',sans-serif`;ctx.textBaseline='top';mark.text.split('\n').forEach((line,i)=>ctx.fillText(line,mark.at.x,mark.at.y+i*mark.width*1.3));}
 else if(mark.kind==='arrow'){const {a,b}=mark,angle=Math.atan2(b.y-a.y,b.x-a.x),size=Math.max(12,mark.width*4);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-size*Math.cos(angle-.5),b.y-size*Math.sin(angle-.5));ctx.lineTo(b.x-size*Math.cos(angle+.5),b.y-size*Math.sin(angle+.5));ctx.closePath();ctx.fill();}
 else{const b=editBox(mark.a,mark.b,size.width,size.height);if(mark.kind==='cover'){ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillRect(b.x,b.y,b.width,b.height);}else ctx.strokeRect(b.x,b.y,b.width,b.height);}ctx.restore();}
function apply(canvas:HTMLCanvasElement,op:EditOperation,scratch?:HTMLCanvasElement){
 let ctx=canvas.getContext('2d')!;if(!['crop','rotate','flip'].includes(op.kind)){drawMark(ctx,op);return;}
 const owned=!scratch;scratch??=document.createElement('canvas');try{
  scratch.width=canvas.width;scratch.height=canvas.height;scratch.getContext('2d')!.drawImage(canvas,0,0);
  if(op.kind==='crop'){canvas.width=op.box.width;canvas.height=op.box.height;ctx=canvas.getContext('2d')!;ctx.drawImage(scratch,op.box.x,op.box.y,op.box.width,op.box.height,0,0,op.box.width,op.box.height);}
  else if(op.kind==='rotate'){canvas.width=scratch.height;canvas.height=scratch.width;ctx=canvas.getContext('2d')!;ctx.translate(canvas.width,0);ctx.rotate(Math.PI/2);ctx.drawImage(scratch,0,0);ctx.setTransform(1,0,0,1,0,0);}
  else{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.translate(canvas.width,0);ctx.scale(-1,1);ctx.drawImage(scratch,0,0);ctx.setTransform(1,0,0,1,0,0);}
 }finally{if(owned)scratch.width=scratch.height=0;}
}
// New edits and redo extend the current pixels; undo replays the operation log.
export function applyEdit(canvas:HTMLCanvasElement,op:EditOperation){apply(canvas,op);}
export function renderEdits(canvas:HTMLCanvasElement,source:HTMLImageElement,ops:EditOperation[]){
 canvas.width=source.naturalWidth;canvas.height=source.naturalHeight;canvas.getContext('2d')!.drawImage(source,0,0);let scratch:HTMLCanvasElement|undefined;
 try{for(const op of ops){if(['crop','rotate','flip'].includes(op.kind))scratch??=document.createElement('canvas');apply(canvas,op,scratch);}}finally{if(scratch)scratch.width=scratch.height=0;}
}
