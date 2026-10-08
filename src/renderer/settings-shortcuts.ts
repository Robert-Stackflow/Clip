import {t as tr} from '../shared/i18n';
import {setupShortcut,shortcutFeedback} from './shortcut';
import {shortcutLabel} from '../shared/shortcut';
import {immediateSettings} from './inline-settings';

/** Startup conflicts belong to the same field as save-time conflicts. */
export function showShortcutRegistrationErrors(host:HTMLElement,error:string){
 const unassigned:string[]=[],inputs=[...host.querySelectorAll<HTMLInputElement>('input[data-shortcut-control]')];
 for(const message of (error||'').split('；').filter(Boolean)){
  const matches=inputs.filter(input=>input.dataset.value&&message.includes(' '+shortcutLabel(input.dataset.value)+' '));
  if(matches.length)for(const input of matches)shortcutFeedback(input,new Error(message));
  else if(/Win\+V/i.test(message)&&host.querySelector<HTMLInputElement>('#quick-panel-shortcut'))shortcutFeedback(host.querySelector<HTMLInputElement>('#quick-panel-shortcut')!,new Error(message));
  else unassigned.push(message);
 }
 const remaining=host.querySelector<HTMLElement>('#shortcut-unassigned-error');if(remaining){remaining.hidden=!unassigned.length;remaining.textContent=unassigned.join('；');}
}

/** Each setting reads the latest options so another section cannot overwrite it. */
export async function mountAuxiliaryShortcuts(host:HTMLElement,toast:(value:unknown)=>void){
 const api=window.clip,[desktop,efficiency]=await Promise.all([api.desktopState(),api.efficiencyState()]);
 if(!host.isConnected)return;
 const fields:[string,string,string,boolean,()=>Promise<void>][]=[
  ['desktop-shortcut',tr('打开拖放窗口'),desktop.options.shelfShortcut,true,async()=>{const current=await api.desktopState();await api.configureDesktop({...current.options,shelfShortcut:host.querySelector<HTMLInputElement>('#desktop-shortcut')!.dataset.value!});}],
  ['replies-shortcut',tr('打开快捷回复'),efficiency.options.repliesShortcut,true,async()=>{const current=await api.efficiencyState();await api.configureEfficiency({...current.options,repliesShortcut:host.querySelector<HTMLInputElement>('#replies-shortcut')!.dataset.value!});}],
 ];
 for(const [id,label,value,optional,save]of fields){
  const row=document.createElement('div');row.className='setting-row';
  const caption=document.createElement('label');caption.htmlFor=id;caption.textContent=label;
  const input=document.createElement('input');input.id=id;input.dataset.value=value;input.setAttribute('aria-label',label+' '+tr('快捷键'));
  row.append(caption,input);host.append(row);setupShortcut(input,toast,optional);immediateSettings(row,save,toast);
 }
}
