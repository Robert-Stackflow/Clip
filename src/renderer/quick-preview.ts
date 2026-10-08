import './locale';
import './appearance';
import './quick-preview.css';
import {Clipboard,FileText,Image,Folder,Link,Code,createElement} from 'lucide';
import {t as tr,formatBytes,formatDate} from '../shared/i18n';
import type {QuickPreviewState} from '../shared/quick-preview';
const api=window.clipQuickPreview,root=document.querySelector<HTMLElement>('#preview')!,body=document.querySelector<HTMLElement>('#preview-body')!,type=document.querySelector<HTMLElement>('#preview-type')!,meta=document.querySelector<HTMLElement>('#preview-meta')!;
let token='';
const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function render(value:QuickPreviewState|null){
 if(!value){body.replaceChildren();meta.textContent='';type.replaceChildren();token='';return;}
 const {item}=value;document.documentElement.dataset.theme=value.dark?'dark':'light';root.dataset.side=value.side;root.style.setProperty('--arrow',value.arrow+'px');
 type.innerHTML=createElement(({text:FileText,image:Image,files:Folder,link:Link,code:Code}[item.kind]||Clipboard),{class:'icon','aria-hidden':'true','stroke-width':1.75}).outerHTML+`<span>${tr(({text:tr('文本'),image:tr('图片'),files:tr('文件'),link:tr('链接'),code:tr('代码')} as const)[item.kind])}</span>`;
 meta.textContent=[item.source.replace(/\.exe$/i,''),formatDate(item.updatedAt),formatBytes(item.bytes)].join(' · ');
 if(token!==item.token){token=item.token;body.scrollTop=0;body.innerHTML=item.kind==='image'&&item.image?`<div class="hover-image"><img src="${esc(item.image)}" alt="${tr('剪贴板图片')}"></div>`:item.kind==='files'?`<ul class="hover-files">${item.files.map(file=>`<li>${createElement(Folder,{class:'icon','aria-hidden':'true'}).outerHTML}<div><strong>${esc(file.name.split(/[\\/]/).filter(Boolean).at(-1)||file.name)}</strong>${!file.saved?`<small>${esc(file.name)}</small>`:''}</div></li>`).join('')}</ul>`:`<pre>${esc(item.text||item.title)}</pre>${item.truncated?`<p class="hover-truncated">${tr('内容较长，完整内容可在主窗口查看')}</p>`:''}`;}
}
api.onState(render);document.documentElement.addEventListener('pointerenter',()=>api.presence(true));document.documentElement.addEventListener('pointerleave',()=>api.presence(false));
