import type {Category} from '../shared/types';
import {categoryColors,validateCategory} from '../shared/advanced';
import {bindCategoryIconPicker} from './category-icon-picker';
import {t as tr} from '../shared/i18n';
import {dateField,bindDatePickers} from './date-picker';
import {setupColorPicker} from './color-picker';
import {createElement,Star,Pin} from 'lucide';

interface Context {
 categories():Category[];
 modal(title:string,body:string,save:()=>Promise<void>):void;
 refresh():Promise<void>;
 toast(text:unknown):void;
}
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const field=(id:string,label:string,control:string,help='')=>`<div class="field"><label for="${id}">${label}</label>${control}${help?`<small class="category-field-help">${help}</small>`:''}</div>`;
const options=(values:readonly [string,string][],selected:string)=>values.map(([key,label])=>`<option value="${key}" ${key===selected?'selected':''}>${label}</option>`).join('');

/** A compact category form shares field alignment across metadata and matching rules. */
export function editCategory(ctx:Context,value?:Category){
 const api=window.clipper,q=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 const manual=!!value?.manual,color=value?.color||categoryColors[0],period=value?.period||'';
 const kinds:[string,string][]=[['all',tr('不限')],['text',tr('文本')],['link',tr('链接')],['code',tr('代码')],['image',tr('图片')],['files',tr('文件')]];
 const periods:[string,string][]=[['',tr('不限')],['today',tr('今天')],['yesterday',tr('昨天')],['week',tr('本周')],['month',tr('本月')],['custom',tr('自定义')]];
 const sizes:[string,string][]=[['',tr('不限')],['small',tr('小于 1 MB')],['medium',tr('1–10 MB')],['large',tr('大于 10 MB')]];
 const text=(id:string,initial:unknown,maximum:number,placeholder:string)=>`<input id="${id}" value="${esc(initial)}" maxlength="${maximum}" placeholder="${placeholder}">`;
 const status=(key:'favorite'|'pinned',label:string)=>`<label class="category-status-option"><input type="checkbox" id="category-${key}" ${value?.[key]?'checked':''}>${createElement(key==='favorite'?Star:Pin,{'class':'icon','aria-hidden':'true'}).outerHTML}<span>${label}</span></label>`;
 ctx.modal(value?tr('编辑分类'):tr('新建分类'),`<div class="category-builder">
  <div class="category-field-grid category-appearance">
  ${field('category-name',tr('分类名称'),`<input id="category-name" value="${esc(value?.name)}" maxlength="40" placeholder="${tr('例如：工作资料')}" required>`)}
  ${field('category-icon-trigger',tr('图标'),'<button id="category-icon-trigger" type="button" class="category-icon-trigger"></button>')}
  </div>
  <div class="field category-colors"><span id="category-colors-label">${tr('颜色')}</span><div class="color-choices" role="group" aria-labelledby="category-colors-label">${categoryColors.map(color=>`<button type="button" data-category-color="${color}" class="color-choice" style="--swatch:${color}" aria-label="${tr('颜色')} ${color}" aria-pressed="false"></button>`).join('')}<input type="color" id="category-color" value="${esc(color)}" aria-label="${tr('自定义颜色')}"></div></div>
  <div class="category-field-grid category-metadata">
   ${field('category-parent',tr('上级分类'),`<select id="category-parent"><option value="">${tr('无（顶层分类）')}</option>${ctx.categories().filter(category=>category.id!==value?.id&&category.allowChildren&&!category.parentId).map(category=>`<option value="${esc(category.id)}" ${category.id===value?.parentId?'selected':''}>${esc(category.name)}</option>`).join('')}</select>`)}
   ${field('category-mode',tr('分类方式'),`<select id="category-mode">${options([['dynamic',tr('自动归类')],['manual',tr('手动整理')]],manual?'manual':'dynamic')}</select>`)}
  </div>
  <div class="category-options"><label><input id="category-permanent" type="checkbox" ${(value?.permanent??manual)?'checked':''}>${tr('永久存储：不参与自动清理')}</label><label><input id="category-children" type="checkbox" ${value?.allowChildren?'checked':''}>${tr('允许创建子分类')}</label></div>
  <p id="category-manual-help" class="category-field-help" ${manual?'':'hidden'}>${tr('手动分类只显示你明确加入的记录，不会自动改变历史内容。')}</p>
  <div id="category-dynamic-rules" ${manual?'hidden':''}>
   <div class="category-rules-heading"><strong>${tr('自动归类规则')}</strong><small>${tr('已填写的规则须同时满足')}</small></div>
   <div class="category-field-grid category-rules">
    ${field('category-kind',tr('内容类型'),`<select id="category-kind">${options(kinds,value?.kind||'all')}</select>`)}
    ${field('category-period',tr('创建时间'),`<select id="category-period">${options(periods,period)}</select>`)}
    <div id="category-custom-dates" class="category-custom-dates" ${period==='custom'?'':'hidden'}><div><span>${tr('开始日期')}</span>${dateField({id:'category-from',value:value?.from,label:tr('开始日期')})}</div><div><span>${tr('结束日期')}</span>${dateField({id:'category-to',value:value?.to,label:tr('结束日期')})}</div></div>
    <div class="field category-contains-field"><label for="category-contains">${tr('内容包含')}</label>${text('category-contains',value?.contains,200,tr('例如 github.com'))}<label class="category-check"><input id="category-regex" type="checkbox" ${value?.containsRegex?'checked':''}>${tr('使用正则表达式')}</label><small class="category-field-help">${tr('标题、正文或文件名中含有此文字')}</small></div>
    ${field('category-source',tr('来源应用'),text('category-source',value?.source,200,tr('例如 chrome')),tr('来自名称中含有此文字的应用'))}
    ${field('category-tag',tr('标签'),text('category-tag',value?.tag,32,tr('例如 工作')),tr('记录拥有完全相同的标签'))}
    <div class="field category-status-field"><span id="category-status-label">${tr('记录状态')}</span><div class="category-status-choices" role="group" aria-labelledby="category-status-label">${status('favorite',tr('已收藏'))}${status('pinned',tr('已置顶'))}</div><small class="category-field-help">${tr('只归类收藏或置顶的记录')}</small></div>
    ${field('category-extensions',tr('文件扩展名'),text('category-extensions',value?.extensions?.join(', '),160,tr('例如 pdf, docx, zip')))}
    ${field('category-size',tr('内容大小'),`<select id="category-size">${options(sizes,value?.size||'')}</select>`)}
   </div>
  </div>
 </div>`,async()=>{
  const manual=q<HTMLSelectElement>('category-mode').value==='manual',period=q<HTMLSelectElement>('category-period').value as Category['period'];
  await api.category(validateCategory({id:value?.id,icon:selectedIcon(),name:q<HTMLInputElement>('category-name').value,color:q<HTMLInputElement>('category-color').value,manual,permanent:q<HTMLInputElement>('category-permanent').checked,allowChildren:q<HTMLInputElement>('category-children').checked,parentId:q<HTMLSelectElement>('category-parent').value||undefined,
   containsRegex:!manual&&q<HTMLInputElement>('category-regex').checked,kind:manual?'all':q<HTMLSelectElement>('category-kind').value as Category['kind'],contains:manual?'':q<HTMLInputElement>('category-contains').value,source:manual?'':q<HTMLInputElement>('category-source').value,tag:manual?'':q<HTMLInputElement>('category-tag').value,
   period:manual?undefined:period||undefined,from:!manual&&period==='custom'?q<HTMLInputElement>('category-from').value||undefined:undefined,to:!manual&&period==='custom'?q<HTMLInputElement>('category-to').value||undefined:undefined,
   favorite:!manual&&q<HTMLInputElement>('category-favorite').checked,pinned:!manual&&q<HTMLInputElement>('category-pinned').checked,extensions:manual?[]:q<HTMLInputElement>('category-extensions').value.split(/[,，\s]+/).map(extension=>extension.trim().replace(/^\./,'')).filter(Boolean),size:manual?undefined:q<HTMLSelectElement>('category-size').value as Category['size']||undefined}));
  await ctx.refresh();ctx.toast(tr('分类已保存'));
 });
 const root=q('category-name').closest<HTMLElement>('.category-builder')!,input=q<HTMLInputElement>('category-color');
 const selectedIcon=bindCategoryIconPicker(root,value?.icon);root.addEventListener('category-icon:error',event=>ctx.toast((event as CustomEvent).detail));
 const feedback=root.closest('form')!.querySelector<HTMLElement>('#modal-error')!;
 for(const event of ['input','change'])root.addEventListener(event,()=>{feedback.textContent='';});
 setupColorPicker(input,{presets:categoryColors,eyedropper:true});
 const trigger=q('category-color-trigger');trigger.setAttribute('aria-label',tr('自定义颜色'));trigger.insertAdjacentHTML('beforeend',`<span>${tr('自定义')}</span>`);
 const syncColor=()=>{for(const button of root.querySelectorAll<HTMLButtonElement>('[data-category-color]')){const selected=button.dataset.categoryColor===input.value;button.classList.toggle('chosen',selected);button.setAttribute('aria-pressed',String(selected));}trigger.classList.toggle('chosen',!categoryColors.includes(input.value));trigger.title=tr('自定义颜色')+' · '+input.value.toUpperCase();root.style.setProperty('--category-color',input.value);q('category-icon-panel').style.setProperty('--category-color',input.value);};
 root.querySelectorAll<HTMLButtonElement>('[data-category-color]').forEach(button=>button.onclick=()=>{input.value=button.dataset.categoryColor!;input.dispatchEvent(new Event('change',{bubbles:true}));});input.addEventListener('change',syncColor);input.addEventListener('color-picker:error',event=>ctx.toast((event as CustomEvent).detail));syncColor();
 q<HTMLSelectElement>('category-mode').onchange=()=>{const manual=q<HTMLSelectElement>('category-mode').value==='manual';q('category-dynamic-rules').hidden=manual;q('category-manual-help').hidden=!manual;};
 q<HTMLSelectElement>('category-period').onchange=()=>{q('category-custom-dates').hidden=q<HTMLSelectElement>('category-period').value!=='custom';};
 bindDatePickers(root);
}
