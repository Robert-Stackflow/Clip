import {icon} from './ui';
import {t} from '../shared/i18n';
import {resetDialogMotion} from './dialog-motion';

const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** One dialog.ts heading/body/actions skeleton; body and actions are trusted UI markup. */
export function dialogParts(title:string,body:string,actions:string,form=false){
 const prefix=form?'modal':'window-confirm';
 return `<header class="one-dialog-heading${form?' modal-heading':''}"><h2 id="${prefix}-title">${esc(title)}</h2><button type="button" id="${prefix}-close" class="icon-button quiet" aria-label="${esc(t('关闭'))}">${icon('close')}</button></header><div class="one-dialog-body${form?' modal-body':''}">${body}</div>${form?'<div id="modal-error" role="alert"></div>':''}<footer class="one-dialog-actions${form?' modal-footer':' confirm-actions'}">${actions}</footer>`;
}
const states=new WeakMap<HTMLDialogElement,{focus?:HTMLElement;outsideDown:boolean}>();
const dismissLocks=new WeakMap<HTMLFormElement,number>();
/** Keep a running form in place until its operation settles. Locks belong to the form, not the reused dialog. */
export function lockOneDialogDismiss(dialog:HTMLDialogElement){
 const form=dialog.querySelector('form');if(!form)return ()=>{};
 resetDialogMotion(dialog);
 dismissLocks.set(form,(dismissLocks.get(form)||0)+1);
 return ()=>{const count=dismissLocks.get(form)||0;if(count<=1)dismissLocks.delete(form);else dismissLocks.set(form,count-1);};
}
export function oneDialogDismissLocked(dialog:HTMLDialogElement){const form=dialog.querySelector('form');return !!form&&!!dismissLocks.get(form);}
function focusField(dialog:HTMLDialogElement){
 const available=(element:HTMLElement)=>!element.matches(':disabled')&&!element.closest('[hidden],[inert]')&&element.getClientRects().length>0&&getComputedStyle(element).visibility==='visible';
 if(Array.from(dialog.querySelectorAll<HTMLElement>('[autofocus]')).some(available))return;
 const active=document.activeElement;if(active!==dialog&&!(active instanceof Element&&active.closest('.one-dialog-heading button')))return;
 const field=Array.from(dialog.querySelectorAll<HTMLElement>('.one-dialog-body input:not([readonly]),.one-dialog-body textarea:not([readonly]),.one-dialog-body [contenteditable="true"]')).find(element=>(!(element instanceof HTMLInputElement)||!['hidden','checkbox','radio','range','color','file','button','submit','reset'].includes(element.type))&&available(element));
 field?.focus({preventScroll:true});
}
/** One requires both pointer-down and pointer-up outside, so dragging out of an input keeps the dialog open. */
export function openOneDialog(dialog:HTMLDialogElement,dismiss:()=>void){
 let state=states.get(dialog);if(!state){state={outsideDown:false};states.set(dialog,state);
  const outside=(event:MouseEvent)=>{const r=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);};
  dialog.addEventListener('mousedown',event=>{state!.outsideDown=outside(event);});
  dialog.addEventListener('click',event=>{const shouldDismiss=state!.outsideDown&&outside(event);state!.outsideDown=false;if(shouldDismiss)dismiss();});
  dialog.addEventListener('close',()=>{state!.outsideDown=false;const focus=state!.focus;state!.focus=undefined;if(focus?.isConnected&&!document.querySelector('dialog[open]'))focus.focus({preventScroll:true});});
 }
 dialog.setAttribute('aria-modal','true');const heading=dialog.querySelector<HTMLElement>('.one-dialog-heading h2[id]');if(heading)dialog.setAttribute('aria-labelledby',heading.id);resetDialogMotion(dialog);state.outsideDown=false;
 if(!dialog.open){state.focus=document.activeElement instanceof HTMLElement?document.activeElement:undefined;dialog.showModal();focusField(dialog);}
}
