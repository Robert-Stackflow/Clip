import {onRemoval} from './controls';
import {t as tr} from '../shared/i18n';
import {appearanceScales,defaultAppearance,validateAppearance,type UIAppearance} from '../shared/appearance';
import {applyAppearance} from './appearance';
import {setupFontPicker} from './font-picker';
import {icon} from './ui';
interface Context{active?():boolean;modal(title:string,body:string,onSave:()=>Promise<void>,save?:string):void;toast(value:unknown):void}
function appearancePage(){return `<div class="appearance-page">
 <section class="settings-card appearance-colors"><h3>${tr('主题与颜色')}</h3>
  <div class="appearance-row"><span>${tr('强调色')}</span><div class="swatch-list">${['#303030','#4479d8','#6d61bd','#41886c','#b67838','#b55875'].map(color=>`<button type="button" class="accent-swatch" data-color="${color}" style="--swatch:${color}" aria-label="${tr('强调色')} ${color}"></button>`).join('')}</div><span class="color-field"><i aria-hidden="true"></i><input id="appearance-accent" aria-label="${tr('自定义强调色')}" maxlength="7" spellcheck="false"></span></div>
  <div class="appearance-row"><span>${tr('背景')}</span><span class="color-field"><i aria-hidden="true"></i><input id="appearance-bg" aria-label="${tr('背景颜色')}" maxlength="7" spellcheck="false"></span></div>
  <div class="appearance-row"><span>${tr('前景')}</span><span class="color-field"><i aria-hidden="true"></i><input id="appearance-fg" aria-label="${tr('前景颜色')}" maxlength="7" spellcheck="false"></span></div>
 </section>
 <section class="settings-card"><h3>${tr('文字与布局')}</h3>
  <div class="appearance-row"><span>${tr('字体')}</span><button type="button" id="appearance-font" class="custom-select" role="combobox" aria-label="${tr('界面字体')}" aria-haspopup="listbox" aria-expanded="false"><span>${tr('系统默认')}</span>${icon('chevron-down')}</button></div>
  <div class="appearance-row"><span>${tr('文字大小')}</span><select id="appearance-scale" aria-label="${tr('文字大小')}">${appearanceScales.map(n=>`<option value="${n}">${n}%</option>`).join('')}</select></div>
  <div class="appearance-row"><span>${tr('间距')}</span><select id="appearance-density" aria-label="${tr('界面间距')}"><option value="comfortable">${tr('舒适')}</option><option value="compact">${tr('紧凑')}</option></select></div>
  <div class="appearance-row"><span>${tr('圆角')}</span><input type="range" id="appearance-radius" aria-label="${tr('界面圆角')}" min="4" max="16"><output id="radius-value"></output></div>
 </section>
 <section class="settings-card"><h3>${tr('提示消息')}</h3><div class="appearance-row"><span>${tr('提示位置')}</span><select id="appearance-toastPosition" aria-label="${tr('提示位置')}">${[['top-center',tr('顶部中间')],['top-right',tr('顶部右侧')],['top-left',tr('顶部左侧')],['bottom-center',tr('底部中间')],['bottom-right',tr('底部右侧')],['bottom-left',tr('底部左侧')]].map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></div></section>
 <div class="appearance-actions"><button type="button" id="appearance-reset">${tr('恢复默认选项')}</button></div>
</div>`;}

export async function appearanceUI(ctx:Context){const current=await window.clipAppearance!.state(),q=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;let value=validateAppearance(current.value);
 if(ctx.active&&!ctx.active())return;ctx.modal(tr('外观'),appearancePage(),async()=>{await window.clip.configureAppearance(value);ctx.toast(tr('外观已保存'));});
 if(!q('appearance-font'))return;setupFontPicker(q<HTMLButtonElement>('appearance-font'));let saveRevision=0;
 const dark=()=>document.documentElement.dataset.theme==='dark';
 const fill=()=>{q<HTMLInputElement>('appearance-accent').value=value.accent;q<HTMLInputElement>('appearance-bg').value=dark()?value.darkBackground:value.lightBackground;q<HTMLInputElement>('appearance-fg').value=dark()?value.darkForeground:value.lightForeground;for(const key of ['font','scale','density','toastPosition','radius'])q<HTMLInputElement>('appearance-'+key).value=String(value[key as keyof UIAppearance]);q('radius-value').textContent=value.radius+' px';for(const key of ['accent','bg','fg']){const input=q<HTMLInputElement>('appearance-'+key);input.parentElement!.style.setProperty('--swatch',input.value);}};
 const persist=()=>{const request=++saveRevision;applyAppearance(value);void window.clip.configureAppearance(value).catch(async error=>{if(request!==saveRevision)return;value=(await window.clipAppearance!.state()).value;applyAppearance(value);if(q('appearance-font'))fill();ctx.toast(error);});};
 fill();if(current.warning)ctx.toast(current.warning);
 document.querySelectorAll<HTMLElement>('[data-color]').forEach(b=>b.onclick=()=>{value={...value,accent:b.dataset.color!};fill();persist();});
 for(const key of ['accent','bg','fg','font','scale','density','radius','toastPosition'])q('appearance-'+key).addEventListener('change',()=>{const input=q<HTMLInputElement>('appearance-'+key),raw=input.value;if(['accent','bg','fg'].includes(key)&&!/^#[a-f0-9]{6}$/i.test(raw)){ctx.toast(tr('请输入 #RRGGBB 格式颜色'));fill();return;}const property=key==='bg'?(dark()?'darkBackground':'lightBackground'):key==='fg'?(dark()?'darkForeground':'lightForeground'):key;value=validateAppearance({...value,[property]:key==='radius'||key==='scale'?Number(raw):raw});fill();persist();});
 q('appearance-reset').onclick=()=>{value=defaultAppearance();fill();persist();};
 const observer=new MutationObserver(()=>{if(q('appearance-font'))fill();else observer.disconnect();});observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});onRemoval(q('appearance-font'),()=>observer.disconnect());
}
