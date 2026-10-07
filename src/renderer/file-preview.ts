import {File,FileText,FileImage,FileAudio,FileVideo,FileArchive,FileCode,FileSpreadsheet,Presentation,Folder,FolderOpen,ExternalLink,Copy,Download,createElement,type IconNode} from 'lucide';
import type {ClipPreview} from '../shared/preview';
import type {API} from '../shared/types';
import type {FileAction} from '../shared/file-actions';
import {t as tr,formatBytes} from '../shared/i18n';
import {iconButton} from './ui';
import {openAnchoredPopover,closeAnchoredPopover} from './anchored-popover';
import {onRemoval} from './controls';
import {ActionScope} from './actions';

const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const glyph=(node:IconNode)=>createElement(node,{class:'icon','aria-hidden':'true','stroke-width':1.75}).outerHTML;
const name=(path:string)=>path.split(/[\\/]/).filter(Boolean).at(-1)||path;
function appearance(path:string,directory=false){
 if(directory)return {node:Folder,tone:'folder',label:tr('文件夹')};
 const extension=name(path).match(/\.([^.]+)$/)?.[1].toLowerCase()||'';
 const node=/^(png|jpe?g|webp|gif|bmp|svg|heic|avif)$/.test(extension)?FileImage:/^(mp3|wav|m4a|aac|flac|ogg)$/.test(extension)?FileAudio:/^(mp4|mov|mkv|avi|webm)$/.test(extension)?FileVideo:/^(zip|rar|7z|tar|gz)$/.test(extension)?FileArchive:/^(xlsx?|csv|ods)$/.test(extension)?FileSpreadsheet:/^(pptx?|odp)$/.test(extension)?Presentation:/^(js|ts|tsx|jsx|json|py|html|css|java|c|cpp|rs|go|sh)$/.test(extension)?FileCode:/^(docx?|pdf|txt|md|rtf|odt)$/.test(extension)?FileText:File;
 return {node,tone:node===FileArchive?'archive':node===FileSpreadsheet?'sheet':node===FileImage?'image':'document',label:extension?extension.toUpperCase()+' '+tr('文件'):tr('文件')};
}
export function filesPreviewMarkup(item:ClipPreview){
 const files=item.payload.files?.map(path=>({path,display:name(path),directory:false,bytes:undefined as number|undefined,saved:false}))||item.payload.attachments?.map(a=>({path:a.name,display:name(a.name),directory:!!a.directory,bytes:a.bytes,saved:true}))||[];
 return `<section class="files-preview file-preview"><ul class="file-preview-list">${files.map((file,index)=>{const view=appearance(file.path,file.directory),parent=file.path.slice(0,file.path.length-file.display.length).replace(/[\\/]$/,'');return `<li class="file-preview-entry" data-file-index="${index}" data-directory="${file.directory}"><span class="file-preview-icon" data-tone="${view.tone}">${glyph(view.node)}</span><div class="file-preview-info"><strong class="file-preview-name" title="${esc(file.display)}">${esc(file.display)}</strong>${parent?`<span class="file-preview-path" title="${esc(file.path)}">${esc(parent)}</span>`:''}<span class="file-preview-meta">${file.saved?tr('已保存附件')+' · ':''}${view.label}${!file.directory&&file.bytes!==undefined?' · '+formatBytes(file.bytes):''}</span></div>${iconButton('',tr('更多文件操作'),'lucide:more').replace('<button','<button data-file-more="'+index+'"').replace('aria-label="','aria-label="'+esc(file.display)+' · ')}</li>`;}).join('')}</ul></section>`;
}
export function mountFilesPreview(root:HTMLElement,item:ClipPreview,api:API,toast:(value:unknown)=>void){
 const host=root.querySelector<HTMLElement>('.file-preview');if(!host)return ()=>{};
 const panel=document.createElement('nav');panel.className='file-entry-menu clipper-popover';panel.popover='manual';panel.setAttribute('role','menu');panel.setAttribute('aria-label',tr('文件操作'));host.append(panel);
 const scope=new ActionScope();let alive=true,anchor:HTMLButtonElement|undefined,index=-1,opened=false;
 const close=(focus=false)=>{opened=false;anchor?.setAttribute('aria-expanded','false');closeAnchoredPopover(panel);panel.style.pointerEvents='none';document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',keyboard,true);if(focus&&anchor?.isConnected)anchor.focus({preventScroll:true});};
 const outside=(event:PointerEvent)=>{if(!panel.contains(event.target as Node)&&!anchor?.contains(event.target as Node))close();};
 const keyboard=(event:KeyboardEvent)=>{
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close(true);return;}
  if(event.key==='Tab'){close();return;}
  if(event.key==='Delete'){event.preventDefault();event.stopImmediatePropagation();return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopImmediatePropagation();const choices=[...panel.querySelectorAll<HTMLButtonElement>('[role=menuitem]')],current=choices.indexOf(document.activeElement as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?choices.length-1:current<0?(event.key==='ArrowUp'?choices.length-1:0):(current+(event.key==='ArrowUp'?-1:1)+choices.length)%choices.length;choices[next]?.focus();
 };
 const show=(button:HTMLButtonElement,focus=false)=>{
  close();anchor=button;index=Number(button.dataset.fileMore);const row=button.closest<HTMLElement>('[data-file-index]')!,saved=!item.payload.files,directory=row.dataset.directory==='true';
  const options:{action:FileAction|'export';label:string;node:IconNode}[]=saved?[{action:'export',label:tr('另存为'),node:Download},{action:'copy-name',label:tr('复制文件名'),node:Copy}]:[{action:'open',label:directory?tr('打开文件夹'):tr('打开文件'),node:ExternalLink},{action:'reveal',label:tr('在文件夹中显示'),node:FolderOpen},{action:'copy-path',label:tr('复制路径'),node:Copy},{action:'copy-name',label:tr('复制文件名'),node:FileText}];
  panel.innerHTML=options.map((option,i)=>`${!saved&&i===2?'<div role="separator"></div>':''}<button type="button" role="menuitem" data-file-action="${option.action}">${glyph(option.node)}<span>${option.label}</span></button>`).join('');
  for(const choice of panel.querySelectorAll<HTMLButtonElement>('[data-file-action]'))scope.bind(choice,async()=>{const target=index,action=choice.dataset.fileAction as FileAction|'export',origin=anchor!;close(true);await scope.run(item.id+':'+target,async()=>{if(action==='export'){const result=await api.exportAttachment(item.id,target);if(result)toast(tr('已保存：')+result);}else{await api.fileAction(item.id,target,action);if(action==='copy-path')toast(tr('已复制路径'));if(action==='copy-name')toast(tr('已复制文件名'));}},[origin]);},toast,item.id+':'+index+':menu');
  opened=true;button.setAttribute('aria-expanded','true');panel.style.pointerEvents='';openAnchoredPopover(panel,button,208,300);document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',keyboard,true);if(focus)panel.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();
 };
 for(const button of host.querySelectorAll<HTMLButtonElement>('[data-file-more]')){button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');button.onclick=()=>opened&&anchor===button?close():show(button);button.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();show(button,true);if(event.key==='ArrowUp')panel.querySelector<HTMLButtonElement>('[role=menuitem]:last-child')?.focus();}};}
 if(item.payload.files)void api.contentInfo(item.id,true).then(info=>{if(!alive||!host.isConnected)return;for(const [i,file]of(info?.files||[]).entries()){const row=host.querySelector<HTMLElement>(`[data-file-index="${i}"]`);if(!row)continue;const view=appearance(file.path,!!file.directory);row.dataset.directory=String(!!file.directory);row.querySelector<HTMLElement>('.file-preview-icon')!.dataset.tone=view.tone;row.querySelector('.file-preview-icon')!.innerHTML=glyph(view.node);const status=file.status==='missing'?tr('源文件已移动或删除'):file.status==='unreadable'?tr('文件无法访问'):'';row.querySelector('.file-preview-meta')!.textContent=view.label+(file.bytes!==undefined?' · '+formatBytes(file.bytes):'')+(status?' · '+status:'');row.classList.toggle('file-unavailable',!!status);}}).catch(()=>{});
 onRemoval(host,()=>close());return ()=>{alive=false;close();panel.remove();};
}
