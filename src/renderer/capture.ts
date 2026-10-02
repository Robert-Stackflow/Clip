import './capture.css';
const api=(window as any).capture;
const q=(id:string)=>document.getElementById(id)!;
let start:{x:number;y:number}|undefined,rect:{x:number;y:number;width:number;height:number}|undefined;
const clamp=(n:number,max:number)=>Math.max(0,Math.min(max,n));
function draw(){if(!rect)return;const s=q('selection');s.hidden=false;Object.assign(s.style,{left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px'});const img=q('screen') as HTMLImageElement,sx=img.naturalWidth/innerWidth,sy=img.naturalHeight/innerHeight;const width=Math.ceil((rect.x+rect.width)*sx)-Math.floor(rect.x*sx),height=Math.ceil((rect.y+rect.height)*sy)-Math.floor(rect.y*sy);q('dimensions').textContent=`${width} × ${height} 像素`;}
document.addEventListener('pointerdown',e=>{if((e.target as HTMLElement).closest('button,#capture-actions'))return;if(e.button!==0)return;start={x:e.clientX,y:e.clientY};rect=undefined;q('capture-actions').hidden=true;q('selection').hidden=true;});
document.addEventListener('pointermove',e=>{if(!start)return;const x=clamp(e.clientX,innerWidth),y=clamp(e.clientY,innerHeight);rect={x:Math.min(start.x,x),y:Math.min(start.y,y),width:Math.abs(x-start.x),height:Math.abs(y-start.y)};draw();});
document.addEventListener('pointerup',()=>{start=undefined;if(rect&&rect.width>=2&&rect.height>=2)q('capture-actions').hidden=false;});
async function save(){if(rect&&rect.width>=2&&rect.height>=2)await api.complete(rect);}
q('save').onclick=()=>void save();q('cancel').onclick=()=>void api.complete(null);q('retry').onclick=()=>{rect=undefined;q('selection').hidden=true;q('capture-actions').hidden=true;};
document.addEventListener('keydown',e=>{if(e.key==='Escape')void api.complete(null);if(e.key==='Enter')void save();});
void api.data().then((data:any)=>{(q('screen') as HTMLImageElement).src=data.image;q('save').textContent=data.purpose||'保存截图';q('capture-hint').textContent='拖动选择区域 · Enter '+(data.purpose||'保存')+' · Esc 取消';}).catch(()=>void api.complete(null));
