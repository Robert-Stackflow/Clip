// Window controls migrated from One's chrome.ts; native frame remains owned by Windows.
import {t as tr} from '../shared/i18n';
import type {ChromeAPI,WindowState} from '../shared/chrome';
declare global{interface Window{clipperChrome?:ChromeAPI}}
export const windowCloseButton=(prefix='window',label=tr('关闭'))=>`<button id="${prefix}-close" type="button" aria-label="${label}" title="${label}"><svg viewBox="0 0 16 16"><path d="m3.5 3.5 9 9m0-9-9 9"/></svg></button>`;
export const windowControls=(prefix='window')=>`<div class="window-controls"><button id="${prefix}-minimize" type="button" aria-label="${tr('最小化')}" title="${tr('最小化')}"><svg viewBox="0 0 16 16"><path d="M3 8h10"/></svg></button><button id="${prefix}-maximize" type="button" aria-label="${tr('最大化')}" title="${tr('最大化')}"><svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9"/></svg></button>${windowCloseButton(prefix)}</div>`;
export function setupChrome(prefix='window'){
 document.body.classList.add('native-frame','custom-window-frame');const api=window.clipperChrome;if(!api)return;
 for(const kind of ['minimize','maximize','close'] as const)document.getElementById(prefix+'-'+kind)?.addEventListener('click',()=>void api.action(kind));
 const update=(s:WindowState)=>{document.body.classList.toggle('maximized',s.maximized);const min=document.getElementById(prefix+'-minimize') as HTMLButtonElement,max=document.getElementById(prefix+'-maximize') as HTMLButtonElement;if(min)min.hidden=!s.minimizable;if(!max)return;max.hidden=!s.maximizable;max.title=tr(s.maximized?'还原':'最大化');max.setAttribute('aria-label',max.title);max.innerHTML=s.maximized?'<svg viewBox="0 0 16 16"><path d="M5.5 5.5v-2h7v7h-2"/><rect x="3.5" y="5.5" width="7" height="7"/></svg>':'<svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9"/></svg>';};let revision=0;api.onChange(s=>{revision++;update(s);});const request=revision;void api.state().then(s=>{if(request===revision)update(s);}).catch(()=>{});
}
