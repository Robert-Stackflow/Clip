import {t as tr} from '../shared/i18n';
import koffi from 'koffi';
import {commitClipboardBlocks,type ClipboardBlock} from './clipboard-blocks';
import {persistableFormat,clipboardFormatId,MAX_FORMATS} from '../shared/formats';
let api:any;
let appWindowCallback:ReturnType<typeof koffi.pointer>|undefined;
export let nativeError='';
export function initNative(){try{
  if(process.platform!=='win32'||process.arch!=='x64')throw new Error(tr('当前版本需要 Windows x64'));
  const u=koffi.load('user32.dll'),k=koffi.load('kernel32.dll'),s=koffi.load('shell32.dll');
  api={enumWindows:u.func('bool __stdcall EnumWindows(void*,intptr_t)'),enumFormats:u.func('uint32 __stdcall EnumClipboardFormats(uint32)'),formatName:u.func('int __stdcall GetClipboardFormatNameW(uint32,void*,int)'),ancestor:u.func('uintptr_t __stdcall GetAncestor(uintptr_t,uint32)'),foreground:u.func('uintptr_t __stdcall GetForegroundWindow()'),owner:u.func('uintptr_t __stdcall GetClipboardOwner()'),sequence:u.func('uint32 __stdcall GetClipboardSequenceNumber()'),pid:u.func('uint32 __stdcall GetWindowThreadProcessId(uintptr_t hwnd, _Out_ uint32 *pid)'),openProcess:k.func('uintptr_t __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)'),image:k.func('bool __stdcall QueryFullProcessImageNameW(uintptr_t handle,uint32 flags,void *buffer,_Inout_ uint32 *size)'),close:k.func('bool __stdcall CloseHandle(uintptr_t handle)'),
    open:u.func('bool __stdcall OpenClipboard(uintptr_t hwnd)'),closeClipboard:u.func('bool __stdcall CloseClipboard()'),get:u.func('uintptr_t __stdcall GetClipboardData(uint32 format)'),has:u.func('bool __stdcall IsClipboardFormatAvailable(uint32 format)'),register:u.func('uint32 __stdcall RegisterClipboardFormatW(str16 name)'),empty:u.func('bool __stdcall EmptyClipboard()'),set:u.func('uintptr_t __stdcall SetClipboardData(uint32 format,uintptr_t handle)'),
    drag:s.func('uint32 __stdcall DragQueryFileW(uintptr_t handle,uint32 index,void *buffer,uint32 count)'),alloc:k.func('uintptr_t __stdcall GlobalAlloc(uint32 flags,uintptr_t bytes)'),lock:k.func('void * __stdcall GlobalLock(uintptr_t handle)'),unlock:k.func('bool __stdcall GlobalUnlock(uintptr_t handle)'),free:k.func('uintptr_t __stdcall GlobalFree(uintptr_t handle)'),globalSize:k.func('uintptr_t __stdcall GlobalSize(uintptr_t handle)'),driveType:k.func('uint32 __stdcall GetDriveTypeW(str16 root)'),move:k.func('void __stdcall RtlMoveMemory(void *target,void *source,uintptr_t bytes)'),
    setForeground:u.func('bool __stdcall SetForegroundWindow(uintptr_t hwnd)'),attachInput:u.func('bool __stdcall AttachThreadInput(uint32,uint32,bool)'),setWindowPosition:u.func('bool __stdcall SetWindowPos(uintptr_t hwnd,uintptr_t after,int x,int y,int width,int height,uint32 flags)'),isWindow:u.func('bool __stdcall IsWindow(uintptr_t hwnd)'),isIconic:u.func('bool __stdcall IsIconic(uintptr_t hwnd)'),visible:u.func('bool __stdcall IsWindowVisible(uintptr_t hwnd)'),send:u.func('uint32 __stdcall SendInput(uint32 count,void *input,int size)'),key:u.func('int16 __stdcall GetAsyncKeyState(int key)'),rect:u.func('bool __stdcall GetWindowRect(uintptr_t hwnd,void *rect)'),className:u.func('int __stdcall GetClassNameW(uintptr_t hwnd,void *name,int length)')};
}catch(e){nativeError=String(e);}}
export const nativeAvailable=()=>!!api;
export const sequence=()=>api?.sequence() as number || 0;
export function windowInfo(hwnd:number){if(!api||!hwnd)return null;const ids=[0];api.pid(hwnd,ids);if(!ids[0])return null;let name='',executable='';const handle=api.openProcess(0x1000,false,ids[0]);if(handle)try{const buffer=Buffer.alloc(65536),size=[32768];if(api.image(handle,0,buffer,size)){executable=buffer.toString('utf16le',0,size[0]*2);name=executable.split('\\').pop()||'';}}finally{api.close(handle);}return {hwnd,pid:ids[0],name,executable};}
export const foreground=()=>windowInfo(api?.foreground()||0);
export function foregroundBelongsTo(hwnd:number){if(!api)return true;const foreground=api.foreground();if(foreground===hwnd)return true;return !!foreground&&api.ancestor(foreground,3)===hwnd;}
/** A native hook does not carry RegisterHotKey's foreground activation permission. */
export function activateNativeWindow(hwnd:number){
 if(!api||!hwnd||!api.isWindow(hwnd))return false;const owner=[0],targetThread=api.pid(hwnd,owner);if(owner[0]!==process.pid)return false;
 if(foregroundBelongsTo(hwnd)||api.setForeground(hwnd))return true;
 const current=api.foreground(),foregroundThread=current?api.pid(current,[0]):0;
 if(!foregroundThread||foregroundThread===targetThread||!api.attachInput(targetThread,foregroundThread,true))return false;
 try{return !!api.setForeground(hwnd);}finally{api.attachInput(targetThread,foregroundThread,false);}
}
export function foregroundTarget(){const hwnd=api?.foreground();if(!hwnd)return null;const name=Buffer.alloc(512),length=api.className(hwnd,name,256),kind=name.toString('utf16le',0,length*2);if(['Progman','WorkerW','Shell_TrayWnd','Shell_SecondaryTrayWnd','NotifyIconOverflowWindow','TopLevelWindowForOverflowXamlIsland','#32768'].includes(kind))return null;return windowInfo(hwnd);}
export const owner=()=>windowInfo(api?.owner()||0);
export function moveNativeWindow(hwnd:number,x:number,y:number){return !!api?.setWindowPosition(hwnd,0,x,y,0,0,0x15);}
export const windowExists=(hwnd:number)=>!!api?.isWindow(hwnd);
export function privateClipboard(){
  if(!api)return false;
  if(['ExcludeClipboardContentFromMonitorProcessing','Clipboard Viewer Ignore','org.nspasteboard.ConcealedType'].some(n=>api.has(api.register(n))))return true;
  const f=api.register('CanIncludeInClipboardHistory');if(!api.has(f))return false;
  if(!api.open(0))throw new Error(tr('剪贴板忙，请稍后重试'));try{const h=api.get(f);if(!h)return true;const p=api.lock(h);if(!p)return true;try{return koffi.decode(p,'uint32')===0;}finally{api.unlock(h);}}finally{api.closeClipboard();}
}
export function readFiles():string[]|undefined{
  if(!api?.has(15))return undefined;if(!api.open(0))throw new Error(tr('剪贴板忙'));
  try{const h=api.get(15);if(!h)return undefined;const n=api.drag(h,0xffffffff,null,0);if(n>256)throw new Error(tr('一次最多记录 256 个文件'));const files:string[]=[];for(let i=0;i<n;i++){const len=api.drag(h,i,null,0);if(len>32767)throw new Error(tr('路径过长'));const b=Buffer.alloc((len+1)*2);api.drag(h,i,b,len+1);files.push(b.toString('utf16le',0,len*2));}return files.length?files:undefined;}finally{api.closeClipboard();}
}
export function writeFiles(files:string[],hwnd:number){
  if(!api)throw new Error(tr('Windows 文件剪贴板不可用'));const list=Buffer.from(files.join('\0')+'\0\0','utf16le'),b=Buffer.alloc(20+list.length);b.writeUInt32LE(20,0);b.writeUInt32LE(1,16);list.copy(b,20);
  const h=api.alloc(0x42,b.length);if(!h)throw new Error(tr('剪贴板内存分配失败'));let transferred=false;
  try{const p=api.lock(h);if(!p)throw new Error(tr('剪贴板内存访问失败'));try{api.move(p,b,b.length);}finally{api.unlock(h);}if(!api.open(hwnd))throw new Error(tr('剪贴板正被其他应用使用'));try{if(!api.empty()||!api.set(15,h))throw new Error(tr('写入文件剪贴板失败'));transferred=true;}finally{api.closeClipboard();}}finally{if(!transferred)api.free(h);}
}
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export async function pasteTo(hwnd:number,valid:()=>boolean=()=>true,dismiss:()=>void=()=>{}){
  if(!valid())throw new Error(tr('粘贴已取消'));
  if(!api||!hwnd||!api.isWindow(hwnd))throw new Error(tr('没有可用的目标窗口，已复制，请切换应用后按 Ctrl+V'));
  // Restore while Clipper still owns the foreground permission. A transient
  // menu/activation handoff can require attaching the two input queues.
  const previous=api.foreground();
  const restore=()=>{if(api.foreground()===hwnd||api.setForeground(hwnd))return;const targetThread=api.pid(hwnd,[0]),sourceThread=previous?api.pid(previous,[0]):0;if(!targetThread||!sourceThread||targetThread===sourceThread||!api.attachInput(targetThread,sourceThread,true))return;try{api.setForeground(hwnd);}finally{api.attachInput(targetThread,sourceThread,false);}};
  restore();await delay(40);if(api.foreground()===previous)restore();dismiss();await delay(100);
  for(let i=0;i<30;i++){if(![0x10,0x11,0x12,0x5b,0x5c].some(k=>api.key(k)&0x8000))break;await delay(25);}
  if([0x10,0x11,0x12,0x5b,0x5c].some(k=>api.key(k)&0x8000))throw new Error(tr('请松开修饰键后重新粘贴'));
  if(!foregroundBelongsTo(hwnd))throw new Error(tr('无法恢复目标窗口，已复制，请手动 Ctrl+V'));
  if(!valid())throw new Error(tr('粘贴已取消'));
  const keys=[[0x11,0],[0x56,0],[0x56,2],[0x11,2]],buffer=Buffer.alloc(40*4);keys.forEach(([key,flags],i)=>{buffer.writeUInt32LE(1,i*40);buffer.writeUInt16LE(key,i*40+8);buffer.writeUInt32LE(flags,i*40+12);});
  if(api.send(4,buffer,40)!==4){const release=buffer.subarray(80);api.send(2,release,40);throw new Error(tr('目标应用拒绝自动粘贴，已复制，请手动 Ctrl+V'));}
}

export function mouseButtons(){return {left:!!(api?.key(1)&0x8000),right:!!(api?.key(2)&0x8000),middle:!!(api?.key(4)&0x8000)};}
export function foregroundBounds(){const hwnd=api?.foreground();if(!hwnd)return undefined;const name=Buffer.alloc(512),length=api.className(hwnd,name,256);if(['Progman','WorkerW','Shell_TrayWnd','Shell_SecondaryTrayWnd'].includes(name.toString('utf16le',0,length*2)))return undefined;const b=Buffer.alloc(16);if(!api.rect(hwnd,b))return undefined;return {x:b.readInt32LE(0),y:b.readInt32LE(4),width:b.readInt32LE(8)-b.readInt32LE(0),height:b.readInt32LE(12)-b.readInt32LE(4)};}

export function captureWindowInfo(hwnd:number){if(!api||!Number.isSafeInteger(hwnd)||!hwnd||!api.isWindow(hwnd)||!api.visible(hwnd)||api.isIconic(hwnd))return null;const info=windowInfo(hwnd),b=Buffer.alloc(16);if(!info||!api.rect(hwnd,b))return null;const width=b.readInt32LE(8)-b.readInt32LE(0),height=b.readInt32LE(12)-b.readInt32LE(4);if(width<2||height<2)return null;return {...info,width,height};}

export function readClipboardFormats(names:readonly string[],maximum:number,bestEffort=false){
 if(!api)return [];if(!api.open(0))throw new Error(tr('剪贴板忙'));try{const formats:{name:string;id:number}[]=[],seen=new Set<number>();for(const name of names){const id=typeof clipboardFormatId(name)==='number'?clipboardFormatId(name) as number:api.register(name);if(api.has(id)){formats.push({name,id});seen.add(id);}}
 for(let id=api.enumFormats(0),count=0;id&&count++<256;id=api.enumFormats(id)){if(seen.has(id)||id<0xc000)continue;const buffer=Buffer.alloc(258),length=api.formatName(id,buffer,129);if(length<1||length>128)continue;const name=buffer.toString('utf16le',0,length*2);if(persistableFormat(name)){formats.push({name,id});seen.add(id);}}
 let total=0;const result:({name:string;data:string}[])&{omitted?:string[]}=[];const omit=(name:string)=>{if((result.omitted?.length||0)<32)(result.omitted??=[]).push(name);};for(const f of formats){if(result.length>=MAX_FORMATS){omit(f.name);continue;}const h=api.get(f.id);if(!h)continue;const size=Number(api.globalSize(h));if(!Number.isSafeInteger(size)||size<1)continue;if(size>maximum||total+size>maximum){if(bestEffort){omit(f.name);continue;}throw new Error(tr('原始剪贴板格式超过容量限制'));}const p=api.lock(h);if(!p)continue;try{result.push({name:f.name,data:Buffer.from(koffi.decode(p,'uint8',size)).toString('base64')});total+=size;}finally{api.unlock(h);}}return result;
 }finally{api.closeClipboard();}
}
export async function writeClipboardBlocks(blocks:ClipboardBlock[],hwnd:number,valid:()=>boolean=()=>true){
 if(!api||!hwnd)throw new Error(tr('Windows 剪贴板不可用'));const native=api;
 await commitClipboardBlocks({register:native.register,alloc:native.alloc,lock:native.lock,unlock:native.unlock,free:native.free,open:native.open,empty:native.empty,set:native.set,close:native.closeClipboard,
  copy:(target,data)=>{if(data.length<=64*1024){native.move(target,data,data.length);return Promise.resolve();}return new Promise<void>((resolve,reject)=>native.move.async(target,data,data.length,(error:Error|null)=>error?reject(error):resolve()));}
 },blocks,hwnd,valid);
}

export function localMetadataDrive(path:string){return /^[A-Za-z]:\\/.test(path)&&[2,3,5,6].includes(api?.driveType(path.slice(0,3)));}

export function hasVirtualFiles(){return !!api&&['FileGroupDescriptorW','FileGroupDescriptor'].some(name=>api.has(api.register(name)));}
export const limitAttachmentProcess=(pid:number)=>limitChildProcess(pid,256);
export function limitChildProcess(pid:number,memoryMiB:number){const k=koffi.load('kernel32.dll'),create=k.func('uintptr_t __stdcall CreateJobObjectW(void*,str16)'),configure=k.func('bool __stdcall SetInformationJobObject(uintptr_t,int,void*,uint32)'),assign=k.func('bool __stdcall AssignProcessToJobObject(uintptr_t,uintptr_t)'),open=k.func('uintptr_t __stdcall OpenProcess(uint32,bool,uint32)'),close=k.func('bool __stdcall CloseHandle(uintptr_t)');const job=create(null,null),process=open(0x101,false,pid);try{if(!job||!process)throw new Error(tr('无法限制内容解析进程'));const limits=Buffer.alloc(144);limits.writeUInt32LE(0x2100,16);limits.writeBigUInt64LE(BigInt(memoryMiB)*1024n*1024n,112);if(!configure(job,9,limits,144)||!assign(job,process))throw new Error(tr('无法限制内容解析进程'));return ()=>close(job);}catch(e){if(job)close(job);throw e;}finally{if(process)close(process);}}

export function runningApplications(){if(!api)return [];const seen=new Set<number>(),items:NonNullable<ReturnType<typeof windowInfo>>[]=[];const callback=koffi.register((hwnd:number)=>{if(items.length>=256)return false;if(seen.size>=512)return false;const ids=[0];api.pid(hwnd,ids);if(seen.has(ids[0]))return true;seen.add(ids[0]);const info=windowInfo(hwnd);if(info?.executable)items.push(info);return true;},appWindowCallback??=koffi.pointer(koffi.proto('bool __stdcall ClipperAppWindow(uintptr_t,intptr_t)')));try{api.enumWindows(callback,0);}finally{koffi.unregister(callback);}return items;}
