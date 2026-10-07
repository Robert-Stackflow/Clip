import {access} from 'node:fs/promises';
import {win32} from 'node:path';
import type {ClipPreview} from '../shared/preview';
import {t as tr} from '../shared/i18n';

type Context={valid():boolean;open(path:string):Promise<string>;reveal(path:string):void;copy(text:string):Promise<void>};
/** Resolve the target from the stored record, never from a renderer-supplied path. */
export async function fileAction(item:ClipPreview,index:unknown,action:unknown,ctx:Context){
 const live=()=>{if(!ctx.valid())throw new Error(tr('记录已改变、删除或历史已锁定'));};live();
 if(!Number.isInteger(index)||Number(index)<0)throw new Error(tr('文件编号无效'));
 if(typeof action!=='string'||!['open','reveal','copy-path','copy-name'].includes(action))throw new Error(tr('文件操作无效'));
 const path=item.payload.files?.[Number(index)],attachment=item.payload.attachments?.[Number(index)];
 if(!path&&!attachment)throw new Error(tr('文件不存在'));
 if(action==='copy-name'){await ctx.copy(win32.basename(path||attachment!.name));return;}
 if(!path)throw new Error(tr('此附件需先另存为本地文件'));
 if(action==='copy-path'){await ctx.copy(path);return;}
 await access(path).catch(()=>{throw new Error(tr`源文件已移动或删除：${path}`);});live();
 if(action==='reveal'){ctx.reveal(path);return;}
 const error=await ctx.open(path);if(error)throw new Error(tr('无法打开文件或文件夹：')+error);
}
