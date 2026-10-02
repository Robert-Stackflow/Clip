import koffi from 'koffi';
import {toNamespacedPath,resolve,dirname} from 'node:path';
let move:((source:string,target:string,flags:number)=>boolean)|undefined,errorCode:(()=>number)|undefined;
// A same-directory move without REPLACE_EXISTING commits the new file without an
// overwrite race and works on Windows volumes that do not support hard links.
export function commitRecording(source:string,target:string){if(dirname(resolve(source)).toLowerCase()!==dirname(resolve(target)).toLowerCase())throw new Error('录制暂存必须位于目标文件夹');if(!move){const kernel=koffi.load('kernel32.dll');move=kernel.func('bool __stdcall MoveFileExW(str16 source,str16 target,uint32 flags)');errorCode=kernel.func('uint32 __stdcall GetLastError()');}if(!move(toNamespacedPath(source),toNamespacedPath(target),8)){const code=errorCode!(),error=new Error(code===80||code===183?'文件已存在，请选择新文件名':`无法保存录制（Windows ${code}）`) as NodeJS.ErrnoException;error.code=code===80||code===183?'EEXIST':'EIO';throw error;}}
