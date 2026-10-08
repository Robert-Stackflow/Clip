import {t as tr} from '../shared/i18n';
import {defaultAppearance,validateAppearance,fontStack,type AppearanceAPI,type UIAppearance} from '../shared/appearance';
import {loadUIFont} from './font-runtime';
import {setupControls,closeControls} from './controls';
import {setupTooltips} from './tooltip';
import {setupChrome,windowControls} from './chrome';
import {icon} from './ui';
import {setupFloatingFeedback,setupInlineFeedback} from './feedback';
import {setupWindowConfirmation} from './window-confirm';
import {bindSearchFields} from './one-search';
import {observeOneSkeleton} from './one-skeleton';
import {setupSegments} from './segments';
declare global{interface Window{clipAppearance?:AppearanceAPI}}
let current=defaultAppearance(),revision=0,loadedFont='',resolvedFont='';
export function applyAppearance(value:UIAppearance,root:HTMLElement=document.documentElement){
 const next=validateAppearance(value),dark=document.documentElement.dataset.theme==='dark';
 const stack=loadedFont===next.font&&resolvedFont?resolvedFont:fontStack(next.font);root.style.setProperty('--text-scale',String(next.scale/100));root.style.setProperty('--ui-font-family',stack);root.style.setProperty('--ui-font',stack);root.dataset.density=next.density;root.dataset.toastPosition=next.toastPosition;
 root.style.setProperty('--surface',dark?next.darkBackground:next.lightBackground);root.style.setProperty('--fg',dark?next.darkForeground:next.lightForeground);const accent=dark&&next.accent==='#303030'?'#e4e4e4':next.accent;root.style.setProperty('--accent',accent);const rgb=accent.slice(1).match(/../g)!.map(x=>parseInt(x,16)),inverse=rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>155?'#141414':'#ffffff';root.style.setProperty('--on-accent',inverse);root.style.setProperty('--inverse',inverse);root.style.setProperty('--radius',next.radius+'px');
 if(root!==document.documentElement)return;current=next;
 if(loadedFont!==next.font){loadedFont=next.font;resolvedFont='';const id=++revision;root.dataset.fontStatus='loading';void loadUIFont(next.font,true).then(stack=>{if(id===revision){resolvedFont=stack;root.style.setProperty('--ui-font-family',stack);root.style.setProperty('--ui-font',stack);root.dataset.fontStatus='ready';}}).catch(()=>{if(id===revision){loadedFont='';resolvedFont='';root.dataset.fontStatus='error';document.dispatchEvent(new CustomEvent('clip:feedback',{detail:tr('字体加载失败，请刷新字体列表后重试。')}));}});}
}
applyAppearance(defaultAppearance());
new MutationObserver(()=>applyAppearance(current)).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
const api=window.clipAppearance;if(api){let changed=0;api.onChange(state=>{changed++;applyAppearance(state.value);});const started=changed;void api.state().then(state=>{if(started===changed)applyAppearance(state.value);}).catch(()=>{});}
function setup(){document.body.dataset.view=location.pathname.split('/').pop()?.replace('.html','');document.documentElement.style.setProperty('--check-icon',`url("data:image/svg+xml,${encodeURIComponent(icon('check'))}")`);setupControls();setupTooltips();const feedback=document.getElementById('toast');if(feedback)setupFloatingFeedback(feedback);document.querySelectorAll<HTMLElement>('.feedback-toast').forEach(node=>setupFloatingFeedback(node,true));
 document.querySelectorAll<HTMLElement>('.feedback-inline').forEach(setupInlineFeedback);bindSearchFields();observeOneSkeleton();setupSegments();setupWindowConfirmation();if(!/\/(?:index|tray|tray-menu|selection|capture)\.html$/.test(location.pathname)){const header=document.querySelector('body>header');if(header){header.insertAdjacentHTML('beforeend',windowControls());setupChrome();}}
 new MutationObserver(()=>{const active=document.querySelector<HTMLElement>('[aria-expanded=true]');if(active&&active.closest('[hidden]'))closeControls();}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
