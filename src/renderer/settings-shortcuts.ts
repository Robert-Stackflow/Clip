import {t as tr} from '../shared/i18n';
import {setupShortcut} from './shortcut';
import {immediateSettings} from './inline-settings';

/** Each setting reads the latest options so another section cannot overwrite it. */
export async function mountAuxiliaryShortcuts(host:HTMLElement,toast:(value:unknown)=>void){
 const api=window.clipper,[desktop,efficiency]=await Promise.all([api.desktopState(),api.efficiencyState()]);
 if(!host.isConnected)return;
 const fields:[string,string,string,boolean,()=>Promise<void>][]=[
  ['desktop-shortcut',tr('打开拖放窗口'),desktop.options.shelfShortcut,false,async()=>{const current=await api.desktopState();await api.configureDesktop({...current.options,shelfShortcut:host.querySelector<HTMLInputElement>('#desktop-shortcut')!.dataset.value!});}],
  ['replies-shortcut',tr('打开快捷回复'),efficiency.options.repliesShortcut,true,async()=>{const current=await api.efficiencyState();await api.configureEfficiency({...current.options,repliesShortcut:host.querySelector<HTMLInputElement>('#replies-shortcut')!.dataset.value!});}],
 ];
 for(const [id,label,value,optional,save]of fields){
  const row=document.createElement('div');row.className='setting-row';
  const caption=document.createElement('label');caption.htmlFor=id;caption.textContent=label;
  const input=document.createElement('input');input.id=id;input.dataset.value=value;input.setAttribute('aria-label',label+' '+tr('快捷键'));
  row.append(caption,input);host.append(row);setupShortcut(input,toast,optional);immediateSettings(row,save,toast);
 }
}
