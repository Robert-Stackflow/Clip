import {t as tr} from '../shared/i18n';
import type {DesktopOptions} from '../shared/desktop';

interface Context{active?():boolean;modal(title:string,body:string,save:()=>Promise<void>,label?:string):void;toast(message:unknown):void}
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const q=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;

export async function desktopUI(ctx:Context){
 const api=window.clip,{options:o,displays}=await api.desktopState();
 const check=(key:'quickHoverPreview'|'shelfTop'|'shelfAutoDrag'|'shelfAutoHide'|'shelfLocked',label:string,description='')=>`<label class="desktop-check"><input type="checkbox" id="desktop-${key}" ${o[key]?'checked':''}><span>${label}</span>${description?`<small>${description}</small>`:''}</label>`;
 if(ctx.active&&!ctx.active())return;
 ctx.modal(tr('桌面交互'),`<div class="desktop-form">
  <h3>${tr('快捷面板')}</h3>
  ${check('quickHoverPreview',tr('悬浮时展示预览弹窗'))}
  <h3>${tr('最近记录')}</h3><div class="setting-row"><div><span>${tr('最近记录面板')}</span><p>${tr('浏览最近复制的内容，点击即可粘贴。')}</p></div><button type="button" id="desktop-tray-open">${tr('打开最近记录')}</button></div>
  <h3>${tr('浮动拖放窗口')}</h3>
  <div class="desktop-fields"><label class="field">${tr('小窗位置')}<select id="desktop-shelf-position">${[['top-right',tr('右上角')],['top-left',tr('左上角')],['bottom-right',tr('右下角')],['bottom-left',tr('左下角')]].map(([value,label])=>`<option value="${value}" ${o.shelfPosition===value?'selected':''}>${label}</option>`).join('')}</select></label>
  <label class="field">${tr('显示器')}<select id="desktop-display"><option value="" ${o.displayId===null?'selected':''}>${tr('跟随鼠标所在屏幕')}</option>${displays.map(d=>`<option value="${d.id}" ${o.displayId===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}${o.displayId!==null&&!displays.some(d=>d.id===o.displayId)?`<option value="${o.displayId}" selected>${tr('显示器已断开 · 暂时跟随鼠标')}</option>`:''}</select></label></div>
  ${check('shelfLocked',tr('锁定拖放窗口（不自动隐藏）'))}
  <h3>${tr('拖动唤起')}</h3>
  ${check('shelfAutoDrag',tr('拖动内容到小窗位置时显示'),tr('从其他应用拖动内容到所选屏幕角落，停留后显示拖放窗口。'))}
  ${check('shelfTop',tr('拖动文件或文字到屏幕顶部时打开'),tr('拖动内容到屏幕顶部中央，停留后显示拖放窗口。'))}
  <div class="desktop-fields"><label class="field">${tr('停留时间')}<select id="desktop-dwell">${[200,350,450,650,900,1200,1500,...([200,350,450,650,900,1200,1500].includes(o.dwellMs)?[]:[o.dwellMs])].sort((a,b)=>a-b).map(n=>`<option value="${n}" ${o.dwellMs===n?'selected':''}>${n} ${tr('毫秒')}</option>`).join('')}</select></label>
  </div>
  <h3>${tr('自动隐藏')}</h3>
  ${check('shelfAutoHide',tr('失去焦点后自动隐藏'))}
  <div class="desktop-fields desktop-auto-hide-fields"><label class="field">${tr('失焦后隐藏阈值')}<select id="desktop-auto-hide-seconds">${[3,6,10,15,30,60,...([3,6,10,15,30,60].includes(o.shelfAutoHideSeconds)?[]:[o.shelfAutoHideSeconds])].sort((a,b)=>a-b).map(n=>`<option value="${n}" ${o.shelfAutoHideSeconds===n?'selected':''}>${n} ${tr('秒')}</option>`).join('')}</select><small id="desktop-auto-hide-help" class="field-help">${tr('锁定拖放窗口后不会自动隐藏。')}</small></label></div>
 </div>`,async()=>{
  const display=q<HTMLSelectElement>('desktop-display').value;
  const current=await api.desktopState();await api.configureDesktop({...current.options,quickHoverPreview:q<HTMLInputElement>('desktop-quickHoverPreview').checked,dwellMs:Number(q<HTMLSelectElement>('desktop-dwell').value),displayId:display===''?null:Number(display),shelfTop:q<HTMLInputElement>('desktop-shelfTop').checked,shelfAutoDrag:q<HTMLInputElement>('desktop-shelfAutoDrag').checked,shelfAutoHide:q<HTMLInputElement>('desktop-shelfAutoHide').checked,shelfAutoHideSeconds:Number(q<HTMLSelectElement>('desktop-auto-hide-seconds').value),shelfLocked:q<HTMLInputElement>('desktop-shelfLocked').checked,shelfPosition:q<HTMLSelectElement>('desktop-shelf-position').value as DesktopOptions['shelfPosition']});
  ctx.toast(tr('桌面设置已保存'));
 });
 if(!q('desktop-shelf-position'))return;
 q('desktop-tray-open').onclick=()=>void api.showTray().catch(ctx.toast);
 const autoHide=q<HTMLInputElement>('desktop-shelfAutoHide'),autoHideSeconds=q<HTMLSelectElement>('desktop-auto-hide-seconds'),autoHideHelp=q('desktop-auto-hide-help'),syncAutoHide=()=>{autoHideSeconds.disabled=!autoHide.checked;autoHideHelp.hidden=!autoHide.checked;};autoHide.onchange=syncAutoHide;syncAutoHide();
}
