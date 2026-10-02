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
/** One requires both pointer-down and pointer-up outside, so dragging out of an input keeps the dialog open. */
export function openOneDialog(dialog:HTMLDialogElement,dismiss:()=>void){
 let state=states.get(dialog);if(!state){state={outsideDown:false};states.set(dialog,state);
  const outside=(event:MouseEvent)=>{const r=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);};
  dialog.addEventListener('mousedown',event=>{state!.outsideDown=outside(event);});
  dialog.addEventListener('click',event=>{const shouldDismiss=state!.outsideDown&&outside(event);state!.outsideDown=false;if(shouldDismiss)dismiss();});
  dialog.addEventListener('close',()=>{state!.outsideDown=false;const focus=state!.focus;state!.focus=undefined;if(focus?.isConnected&&!document.querySelector('dialog[open]'))focus.focus({preventScroll:true});});
 }
 dialog.setAttribute('aria-modal','true');resetDialogMotion(dialog);state.outsideDown=false;
 if(!dialog.open){state.focus=document.activeElement instanceof HTMLElement?document.activeElement:undefined;dialog.showModal();}
}
