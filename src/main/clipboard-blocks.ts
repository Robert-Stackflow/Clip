import {t as tr} from '../shared/i18n';

export type ClipboardBlock={format:number|string}&({data:Buffer;base64?:never}|{base64:string;data?:never});
export interface ClipboardMemory {
 register(name:string):number;
 alloc(flags:number,bytes:number):number;
 lock(handle:number):bigint|null;
 unlock(handle:number):unknown;
 copy(target:bigint,data:Buffer):Promise<void>;
 free(handle:number):unknown;
 open(hwnd:number):boolean;
 empty():boolean;
 set(format:number,handle:number):unknown;
 close():unknown;
}

// Prepare everything before opening the clipboard. A cancelled preparation leaves it untouched.
export async function commitClipboardBlocks(api:ClipboardMemory,blocks:ClipboardBlock[],hwnd:number,valid:()=>boolean){
 const live=()=>{if(!valid())throw new Error(tr('复制已取消或历史已锁定'));};
 const prepared:{id:number;handle:number;transferred:boolean}[]=[];
 const sizes=blocks.map(block=>'base64'in block?Buffer.byteLength(block.base64!,'base64'):block.data.length);
 if(!blocks.length||blocks.length>37||sizes.some(n=>!Number.isSafeInteger(n)||n<=0||n>160_000_124)||sizes.reduce((a,b)=>a+b,0)>192*1024*1024)throw new Error(tr('剪贴板格式无效'));
 try{
  for(let index=0;index<blocks.length;index++){
   live();const block=blocks[index],size=sizes[index],id=typeof block.format==='number'?block.format:api.register(block.format);
   if(!id)throw new Error(tr('剪贴板格式无效'));
   const handle=api.alloc(0x42,size);if(!handle)throw new Error(tr('剪贴板内存分配失败'));
   prepared.push({id,handle,transferred:false});const pointer=api.lock(handle);if(!pointer)throw new Error(tr('剪贴板内存访问失败'));
   try{
    let written=0;
    if('base64'in block){
     for(let offset=0;offset<block.base64!.length;offset+=256*1024){
      live();const data=Buffer.from(block.base64!.slice(offset,offset+256*1024),'base64');
      try{if(written+data.length>size)throw new Error(tr('剪贴板格式无效'));await api.copy(pointer+BigInt(written),data);written+=data.length;}finally{data.fill(0);}
     }
    }else{
     for(let offset=0;offset<size;offset+=4*1024*1024){live();const data=block.data.subarray(offset,offset+4*1024*1024);await api.copy(pointer+BigInt(offset),data);written+=data.length;}
    }
    if(written!==size)throw new Error(tr('剪贴板格式无效'));
   }finally{api.unlock(handle);}
  }
  live();if(!api.open(hwnd))throw new Error(tr('剪贴板忙'));
  try{if(!api.empty())throw new Error(tr('无法写入剪贴板'));for(const block of prepared){if(!api.set(block.id,block.handle))throw new Error(tr('无法写入剪贴板格式'));block.transferred=true;}}finally{api.close();}
 }finally{for(const block of prepared)if(!block.transferred)api.free(block.handle);}
}
