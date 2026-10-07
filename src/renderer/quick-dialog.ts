import {dialogParts,openOneDialog} from './dialog-shell';
import {closeDialog,resetDialogMotion} from './dialog-motion';
import {t as tr} from '../shared/i18n';
import {requiredForm} from './form-validation';

/** Session-owned forms disappear when the popup hides, so an old confirmation cannot act on a new session. */
export function quickDialog(title:string,body:string,label:string,submit:(form:HTMLFormElement)=>Promise<void>,signal:AbortSignal){
 return new Promise<boolean>(resolve=>{
  if(signal.aborted){resolve(false);return;}
  const dialog=document.createElement('dialog');dialog.className='one-dialog quick-dialog';
  dialog.innerHTML=`<form>${dialogParts(title,body,`<button type="button" id="quick-dialog-cancel" class="quiet">${tr('取消')}</button><button type="submit" class="primary">${label}</button>`,true)}</form>`;
  const form=dialog.querySelector('form')!,validate=requiredForm(form);let running=false,done=false;
  const cleanup=(saved:boolean)=>{if(done)return;done=true;signal.removeEventListener('abort',abort);resetDialogMotion(dialog);dialog.close();dialog.remove();resolve(saved);};
  const abort=()=>cleanup(false),cancel=async()=>{if(running||done)return;await closeDialog(dialog);cleanup(false);};
  form.onsubmit=event=>{event.preventDefault();if(running||done||signal.aborted||!validate())return;running=true;form.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=true);
   void submit(form).then(async()=>{if(!done){await closeDialog(dialog);cleanup(true);}}).catch(error=>{if(done)return;running=false;dialog.querySelector('#modal-error')!.textContent=error instanceof Error?error.message:String(error);form.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=false);});
  };
  dialog.querySelector<HTMLButtonElement>('#modal-close')!.onclick=()=>void cancel();dialog.querySelector<HTMLButtonElement>('#quick-dialog-cancel')!.onclick=()=>void cancel();
  dialog.addEventListener('cancel',event=>{event.preventDefault();void cancel();});dialog.addEventListener('keydown',event=>event.stopPropagation());signal.addEventListener('abort',abort,{once:true});document.body.append(dialog);openOneDialog(dialog,()=>void cancel());
 });
}
