import {t as tr} from '../shared/i18n';
import koffi from 'koffi';
// WinRT ABI definitions from Windows SDK 10.0.26100.0. No biometric data is read.
const guid=(text:string)=>{const b=Buffer.from(text.replaceAll('-',''),'hex');b.subarray(0,4).reverse();b.subarray(4,6).reverse();b.subarray(6,8).reverse();return b;};
const statics=guid('af4f3f91-564c-4ddc-b8b5-973447627c65'),interop=guid('39e050c3-4e74-441a-8dc0-b81104df949c'),asyncInfo=guid('00000036-0000-0000-c000-000000000046'),resultIID=guid('fd596ffd-2318-558f-9dbe-d21df43764a5');
let api:any;const operations=new Set<()=>void>();
function checked(hr:number){if(hr<0)throw new Error(tr`Windows Hello 不可用（${(hr>>>0).toString(16)}）`);}
function init(){if(api)return api;if(process.platform!=='win32'||process.arch!=='x64')throw new Error(tr('Windows Hello 需要 Windows x64'));const lib=koffi.load('combase.dll');api={
 initialize:lib.func('int32 __stdcall RoInitialize(uint32 type)'),uninitialize:lib.func('void __stdcall RoUninitialize()'),
 create:lib.func('int32 __stdcall WindowsCreateString(str16 value,uint32 length,_Out_ void **result)'),remove:lib.func('int32 __stdcall WindowsDeleteString(void *value)'),
 factory:lib.func('int32 __stdcall RoGetActivationFactory(void *name,void *iid,_Out_ void **result)'),
 plain:koffi.proto('int32 __stdcall ClipComPlain(void *self)'),out:koffi.proto('int32 __stdcall ClipComOut(void *self,_Out_ int32 *result)'),
 operation:koffi.proto('int32 __stdcall ClipComOperation(void *self,_Out_ void **result)'),query:koffi.proto('int32 __stdcall ClipComQuery(void *self,void *iid,_Out_ void **result)'),
 verify:koffi.proto('int32 __stdcall ClipComVerify(void *self,uintptr_t hwnd,void *message,void *iid,_Out_ void **result)')};return api;}
function call(instance:any,index:number,type:any,...args:any[]){const table=koffi.decode(instance,'void *'),fn=koffi.decode(table,index*8,'void *');return koffi.call(fn,type,instance,...args);}
function release(value:any){if(value)call(value,2,api.plain);}
function string(value:string){const out=[null];checked(api.create(value,value.length,out));return out[0];}
async function operation(hwnd?:bigint):Promise<number>{const a=init(),hr=a.initialize(0);if(hr<0&&(hr>>>0)!==0x80010106)checked(hr);let factory:any,op:any,info:any,name:any,message:any,cancelled=false;
 const cancel=()=>{cancelled=true;if(info)try{call(info,9,a.plain);}catch{}};operations.add(cancel);
 try{name=string('Windows.Security.Credentials.UI.UserConsentVerifier');const f=[null];checked(a.factory(name,hwnd===undefined?statics:interop,f));factory=f[0];const out=[null];
  if(hwnd===undefined)checked(call(factory,6,a.operation,out));else{if(!hwnd)throw new Error(tr('需要有效的解锁窗口'));message=string(tr('解锁 Clip 剪贴板历史'));checked(call(factory,6,a.verify,hwnd,message,resultIID,out));}op=out[0];
  const i=[null];checked(call(op,0,a.query,asyncInfo,i));info=i[0];const until=Date.now()+(hwnd===undefined?10000:90000);
  while(true){if(cancelled||Date.now()>until){cancel();throw new Error(tr('Windows Hello 验证已取消或超时'));}const state=[0];checked(call(info,7,a.out,state));if(state[0]===1)break;if(state[0]!==0)throw new Error(tr('Windows Hello 验证未完成'));await new Promise(r=>setTimeout(r,50));}
  const result=[-1];checked(call(op,8,a.out,result));return result[0];
 }finally{operations.delete(cancel);if(info){try{call(info,10,a.plain);}catch{}release(info);}release(op);release(factory);if(name)a.remove(name);if(message)a.remove(message);if(hr>=0)a.uninitialize();}
}
export async function helloAvailable(){try{return await operation()===0;}catch{return false;}}
export async function helloVerify(hwnd:bigint){return await operation(hwnd)===0;}
export function cancelHello(){for(const cancel of operations)cancel();}
