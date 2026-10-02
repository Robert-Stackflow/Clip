import {isImageMark,type Point,type Box,type EditOperation,type ImageMark} from './image-edit';
export type Matrix=readonly [number,number,number,number,number,number];
const identity:Matrix=[1,0,0,1,0,0];
function multiply(a:Matrix,b:Matrix):Matrix{return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
export function mapPoint(matrix:Matrix,p:Point):Point{return {x:matrix[0]*p.x+matrix[2]*p.y+matrix[4],y:matrix[1]*p.x+matrix[3]*p.y+matrix[5]};}
export function unmapPoint(m:Matrix,p:Point):Point{const x=p.x-m[4],y=p.y-m[5],d=m[0]*m[3]-m[1]*m[2];return {x:(m[3]*x-m[2]*y)/d,y:(m[0]*y-m[1]*x)/d};}
/** Mark coordinates stay in the image space in which they were created. */
export function markProjection(ops:readonly EditOperation[],index:number,width:number,height:number){
 let matrix=identity,markSize={width,height};
 for(let i=0;i<ops.length;i++){if(i===index)markSize={width,height};const op=ops[i];let transform:Matrix|undefined;
  if(op.kind==='crop'){transform=[1,0,0,1,-op.box.x,-op.box.y];width=op.box.width;height=op.box.height;}
  else if(op.kind==='rotate'){transform=[0,1,-1,0,height,0];[width,height]=[height,width];}
  else if(op.kind==='flip')transform=[-1,0,0,1,width,0];
  if(i>index&&transform)matrix=multiply(transform,matrix);
 }
 return {matrix,size:markSize};
}
export function markBounds(mark:ImageMark,measure:(text:string,size:number)=>number):Box{
 if(mark.kind==='text'){const lines=mark.text.split('\n');return {x:mark.at.x,y:mark.at.y,width:Math.max(1,...lines.map(s=>measure(s,mark.width))),height:mark.width*1.3*lines.length};}
 const points=mark.kind==='pen'?mark.points:[mark.a,mark.b],x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));return {x,y,width:Math.max(1,...points.map(p=>p.x-x)),height:Math.max(1,...points.map(p=>p.y-y))};
}
export function projectedBox(box:Box,m:Matrix):Box{const points=[{x:box.x,y:box.y},{x:box.x+box.width,y:box.y},{x:box.x,y:box.y+box.height},{x:box.x+box.width,y:box.y+box.height}].map(p=>mapPoint(m,p)),x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));return {x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y};}
export function moveMark(mark:ImageMark,dx:number,dy:number):ImageMark{const move=(p:Point)=>({x:p.x+dx,y:p.y+dy});return mark.kind==='pen'?{...mark,points:mark.points.map(move)}:mark.kind==='text'?{...mark,at:move(mark.at)}:{...mark,a:move(mark.a),b:move(mark.b)};}
function distance(p:Point,a:Point,b:Point){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function polygonHit(p:Point,points:Point[],filled:boolean,tolerance:number){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[j],b=points[i];if(distance(p,a,b)<=tolerance)return true;if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return filled&&inside;}
export function hitMark(mark:ImageMark,p:Point,tolerance:number,measure:(text:string,size:number)=>number){
 const b=markBounds(mark,measure),t=tolerance+mark.width/2;
 if(mark.kind==='text')return p.x>=b.x-tolerance&&p.y>=b.y-tolerance&&p.x<=b.x+b.width+tolerance&&p.y<=b.y+b.height+tolerance;
 if(mark.kind==='pen')return mark.points.length===1?Math.hypot(p.x-mark.points[0].x,p.y-mark.points[0].y)<=t:mark.points.some((at,i)=>i>0&&distance(p,mark.points[i-1],at)<=t);
 if(mark.kind==='arrow'){const {a,b}=mark,angle=Math.atan2(b.y-a.y,b.x-a.x),length=Math.max(12,mark.width*4);return distance(p,a,b)<=t||polygonHit(p,[b,{x:b.x-length*Math.cos(angle-.5),y:b.y-length*Math.sin(angle-.5)},{x:b.x-length*Math.cos(angle+.5),y:b.y-length*Math.sin(angle+.5)}],true,tolerance);}
 const filled=mark.filled||mark.kind==='cover',cx=b.x+b.width/2,cy=b.y+b.height/2;
 if(mark.kind==='ellipse'){const rx=b.width/2,ry=b.height/2,n=Math.hypot((p.x-cx)/rx,(p.y-cy)/ry);return filled?n<=1+t/Math.min(rx,ry):Math.abs(n-1)<=t/Math.min(rx,ry);}
 if(mark.kind==='triangle')return polygonHit(p,[{x:cx,y:b.y},{x:b.x+b.width,y:b.y+b.height},{x:b.x,y:b.y+b.height}],!!filled,t);
 if(mark.kind==='diamond')return polygonHit(p,[{x:cx,y:b.y},{x:b.x+b.width,y:cy},{x:cx,y:b.y+b.height},{x:b.x,y:cy}],!!filled,t);
 if(mark.kind==='roundrect'){const radius=Math.min(b.width,b.height)*.18,nearest={x:Math.max(b.x+radius,Math.min(b.x+b.width-radius,p.x)),y:Math.max(b.y+radius,Math.min(b.y+b.height-radius,p.y))},outer=Math.hypot(p.x-nearest.x,p.y-nearest.y);if(outer>radius+t)return false;if(filled)return true;return p.x<b.x+t||p.x>b.x+b.width-t||p.y<b.y+t||p.y>b.y+b.height-t||outer>=radius-t;}
 return polygonHit(p,[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x+b.width,y:b.y+b.height},{x:b.x,y:b.y+b.height}],!!filled,t);
}
export function findMark(ops:readonly EditOperation[],p:Point,width:number,height:number,tolerance:number,measure:(text:string,size:number)=>number){for(let i=ops.length-1;i>=0;i--){const op=ops[i];if(isImageMark(op)&&hitMark(op,unmapPoint(markProjection(ops,i,width,height).matrix,p),tolerance,measure))return i;}return -1;}
