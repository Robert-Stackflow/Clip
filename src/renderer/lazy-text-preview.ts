import type {TextPreviewOptions,TextPreviewSnapshot} from './text-preview';
type Reader=typeof import('./text-preview');
let reader:Promise<Reader>|undefined,stylesheet:Promise<void>|undefined;
function styles(){return stylesheet??=new Promise<void>((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('text-preview/text-preview.css',location.href).href;link.onload=()=>resolve();link.onerror=()=>{stylesheet=undefined;link.remove();reject(new Error('Text reader stylesheet unavailable'));};document.head.append(link);});}
const entry=()=>new URL('text-preview/text-preview.js',location.href).href;
export function useTextReader(text:string,code:boolean){return code||text.length>32768;}
export interface TextPreviewHandle {():void;snapshot():TextPreviewSnapshot|undefined}
export function mountTextPreview(host:HTMLElement,text:string,options:TextPreviewOptions){
 let pending:{host:HTMLElement;text:string;options:TextPreviewOptions}|undefined={host,text,options},cleanup:(()=>void)|undefined,active:{host:HTMLElement;module:Reader}|undefined,resume=options.resume;
 const path=entry();reader??=Promise.all([styles(),import(path)]).then(([,module])=>module).catch(error=>{reader=undefined;throw error;});
 void reader.then(module=>{const request=pending;pending=undefined;if(request?.host.isConnected){active={host:request.host,module};cleanup=module.renderText(request.host,request.text,request.options);}}).catch(error=>{const request=pending,live=active?.host||request?.host;pending=undefined;active=undefined;if(live?.isConnected)document.dispatchEvent(new CustomEvent('clip:feedback',{detail:error.message}));});
 const dispose:TextPreviewHandle=()=>{pending=undefined;cleanup?.();cleanup=undefined;active=undefined;resume=undefined;};
 dispose.snapshot=()=>active?.module.captureTextPreview(active.host)??resume;return dispose;
}
