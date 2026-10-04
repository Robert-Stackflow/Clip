import {t as tr} from '../shared/i18n';
import type {DesktopOptions} from '../shared/desktop';

interface Context{active?():boolean;modal(title:string,body:string,save:()=>Promise<void>,label?:string):void;toast(message:unknown):void}
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const q=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const shortcut=(s:string)=>s.replaceAll('Control','Ctrl').replaceAll('+',' + ');

export async function desktopUI(ctx:Context){
 const api=window.clipper,{options:o,displays}=await api.desktopState();
 const check=(key:'shelfTop'|'shelfAutoDrag'|'shelfOnTop',label:string)=>`<label class="desktop-check"><input type="checkbox" id="desktop-${key}" ${o[key]?'checked':''}><span>${label}</span></label>`;
 if(ctx.active&&!ctx.active())return;
 ctx.modal(tr('桌面交互'),`<div class="desktop-form">
  <h3>${tr('最近记录')}</h3><button type="button" id="desktop-tray-open">${tr('打开最近记录')}</button>
  <h3>${tr('浮动拖放窗口')}</h3>
  ${check('shelfAutoDrag',tr('拖动文件或文字时自动显示小窗'))}
  <p class="field-help">${tr('从其他应用按住并拖动一小段距离后，小窗会出现在选定位置；未放入内容时会自动收起。')}</p>
  ${check('shelfTop',tr('拖动文件或文字到屏幕顶部时打开'))}
  <p class="field-help">${tr('从其他应用拖动文件或选中的文字到屏幕顶部中央并稍作停留，小型拖放窗口会在选定位置出现；拖入暂存，点击即可展开完整列表。')}</p>
  <div class="desktop-fields"><label class="field">${tr('停留时间')}<select id="desktop-dwell">${[200,350,450,650,900,1200,1500,...([200,350,450,650,900,1200,1500].includes(o.dwellMs)?[]:[o.dwellMs])].sort((a,b)=>a-b).map(n=>`<option value="${n}" ${o.dwellMs===n?'selected':''}>${n} ${tr('毫秒')}</option>`).join('')}</select></label>
  <label class="field">${tr('显示器')}<select id="desktop-display"><option value="" ${o.displayId===null?'selected':''}>${tr('跟随鼠标所在屏幕')}</option>${displays.map(d=>`<option value="${d.id}" ${o.displayId===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}${o.displayId!==null&&!displays.some(d=>d.id===o.displayId)?`<option value="${o.displayId}" selected>${tr('显示器已断开 · 暂时跟随鼠标')}</option>`:''}</select></label></div>
  ${check('shelfOnTop',tr('保持拖放窗口置顶'))}
  <label class="field">${tr('呼出快捷键')}<input id="desktop-shortcut" readonly value="${shortcut(o.shelfShortcut)}" data-value="${o.shelfShortcut}" aria-label="${tr('拖放窗口快捷键')}"></label>
 </div>`,async()=>{
  const display=q<HTMLSelectElement>('desktop-display').value;
  await api.configureDesktop({...o,dwellMs:Number(q<HTMLSelectElement>('desktop-dwell').value),displayId:display===''?null:Number(display),shelfTop:q<HTMLInputElement>('desktop-shelfTop').checked,shelfAutoDrag:q<HTMLInputElement>('desktop-shelfAutoDrag').checked,shelfOnTop:q<HTMLInputElement>('desktop-shelfOnTop').checked,shelfPosition:q<HTMLSelectElement>('desktop-shelf-position').value as DesktopOptions['shelfPosition'],shelfShortcut:q('desktop-shortcut').dataset.value!});
  ctx.toast(tr('桌面设置已保存'));
 });
 if(!q('desktop-shortcut'))return;
 const shelfHelp=q('desktop-shelfTop').closest('label')!.nextElementSibling as HTMLElement;
 shelfHelp.insertAdjacentHTML('afterend',`<label class="field">${tr('小窗位置')}<select id="desktop-shelf-position">${[['top-right',tr('右上角')],['top-left',tr('左上角')],['bottom-right',tr('右下角')],['bottom-left',tr('左下角')]].map(([value,label])=>`<option value="${value}" ${o.shelfPosition===value?'selected':''}>${label}</option>`).join('')}</select></label>`);
 q('desktop-tray-open').onclick=()=>void api.showTray().catch(ctx.toast);
 const input=q<HTMLInputElement>('desktop-shortcut');
 input.onfocus=()=>{void api.recordShortcut(true).catch(ctx.toast);input.value=tr('按下快捷键…');};
 input.onblur=()=>{void api.recordShortcut(false).catch(ctx.toast);input.value=shortcut(input.dataset.value!);};
 input.onkeydown=e=>{e.preventDefault();e.stopPropagation();if(e.key==='Escape'){input.blur();return;}if(['Control','Alt','Shift','Meta'].includes(e.key))return;const key=e.key.toUpperCase(),parts=[e.ctrlKey?'Control':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',e.metaKey?'Super':''].filter(Boolean);if(!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(key))return;if(parts.length<2){input.value=tr('至少两个修饰键');return;}input.dataset.value=[...parts,key].join('+');input.dispatchEvent(new Event('change',{bubbles:true}));input.value=shortcut(input.dataset.value);input.blur();};
}
