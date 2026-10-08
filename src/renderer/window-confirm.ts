import {dialogParts,openOneDialog} from './dialog-shell';
import type {WindowConfirmation} from '../shared/chrome';
import {t} from '../shared/i18n';
import {icon} from './ui';
import {exitDialog,resetDialogMotion} from './dialog-motion';
let active:HTMLDialogElement|undefined;
function question(request:Omit<WindowConfirmation,'token'>,answer:(response:number)=>Promise<void>){
 if(active?.open)return false;
 const dialog=document.createElement('dialog');active=dialog;dialog.className='confirm-dialog one-dialog';
 dialog.innerHTML=dialogParts(request.message,'','');dialog.setAttribute('aria-labelledby','window-confirm-title');const close=dialog.querySelector<HTMLButtonElement>('#window-confirm-close')!,actions=dialog.querySelector<HTMLElement>('.one-dialog-actions')!,body=dialog.querySelector<HTMLElement>('.one-dialog-body')!;body.textContent=request.detail;body.hidden=!request.detail;const error=document.createElement('p');error.role='alert';error.className='confirm-error';let answered=false;
 const finish=async(response:number)=>{if(answered)return;answered=true;dialog.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=true);try{if(!await exitDialog(dialog))return;await answer(response);dialog.close();dialog.remove();if(active===dialog)active=undefined;}catch(value){answered=false;resetDialogMotion(dialog);error.textContent=value instanceof Error?value.message:String(value);dialog.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=false);}};
 close.onclick=()=>void finish(request.cancelId);
 request.buttons.forEach((label,index)=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.response=String(index);button.className=index===request.defaultId?'primary':'quiet';button.onclick=()=>void finish(index);actions.append(button);});const content=document.createElement('div');content.className='confirm-content';content.append(dialog.querySelector('.one-dialog-heading')!,body,error);actions.before(content);document.body.append(dialog);
 dialog.addEventListener('cancel',event=>{event.preventDefault();void finish(request.cancelId);});dialog.addEventListener('keydown',event=>event.stopPropagation());openOneDialog(dialog,()=>void finish(request.cancelId));actions.querySelector<HTMLButtonElement>(`[data-response="${request.defaultId}"]`)?.focus();return true;
}
export function confirmAction(message:string){return new Promise<boolean>(resolve=>{if(!question({message,detail:'',buttons:[t('保留'),t('放弃并关闭')],defaultId:0,cancelId:0},async response=>resolve(response===1)))resolve(false);});}
export function setupWindowConfirmation(){const api=window.clipChrome;if(!api?.onConfirm)return;api.onConfirm(request=>{if(!question(request,response=>api.answerConfirm(request.token,response)))void api.answerConfirm(request.token,request.cancelId).catch(()=>{});});}
