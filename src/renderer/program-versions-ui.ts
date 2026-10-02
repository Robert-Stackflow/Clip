import {t as tr,formatDate,formatBytes,formatNumber} from '../shared/i18n';
import {createElement,Archive} from 'lucide';
import {utilityEmpty} from './utility-empty';
import {newerVersion} from '../shared/updates';
import type {ProgramVersionEntry,ProgramRollbackChoice,ProgramRollbackPreview} from '../shared/program-versions';
interface Context {modal(title:string,body:string,save:()=>Promise<void>,label?:string):void;toast(value:unknown):void}
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const q=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
export function mountProgramVersions(root:HTMLElement,ctx:Context){
 const api=window.clipper;let entries:ProgramVersionEntry[]=[],limit=50,disposed=false,loading=false,externalBusy=false,installed=false,current='',modalCleanup:(()=>void)|undefined;
 root.innerHTML='<h3>'+esc(tr('旧程序版本'))+'</h3><p class="field-help">'+esc(tr('更新前保存程序与配套数据恢复点，保留最近三个不同版本。回退前会先保存当前程序与资料。'))+'</p><p id="program-version-status" role="status"></p><div id="program-version-list"></div>';
 const list=root.querySelector<HTMLElement>('#program-version-list')!;list.classList.add('utility-list');const status=root.querySelector<HTMLElement>('#program-version-status')!;
 function draw(){if(disposed)return;list.replaceChildren();if(!entries.length){list.append(utilityEmpty(tr('还没有可回退的旧程序'),Archive));return;}
  for(const entry of entries.slice(0,limit)){const row=document.createElement('article');row.className='checkpoint-entry';const copy=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('small');title.textContent='Clipper '+entry.version;meta.textContent=formatDate(entry.createdAt)+' · '+formatBytes(entry.bytes);copy.className='archive-entry-copy';copy.append(title,meta);const actions=document.createElement('div'),restore=document.createElement('button'),remove=document.createElement('button');actions.className='checkpoint-actions';restore.textContent=tr('校验与回退');restore.dataset.programRestore=entry.id;restore.disabled=!installed||loading||externalBusy||!newerVersion(current,entry.version);restore.onclick=()=>void select(entry.id).catch(ctx.toast);remove.textContent=tr('删除');remove.dataset.programDelete=entry.id;remove.disabled=loading||externalBusy;remove.onclick=()=>ctx.modal(tr('删除旧程序'),'<p>Clipper '+esc(entry.version)+'</p><p class="field-help">'+esc(tr('删除这份旧程序归档，配套的数据恢复点仍保留。'))+'</p>',()=>locked(async()=>{await api.deleteProgramVersion(entry.id);await refresh();}),tr('删除'));actions.append(restore,remove);const glyph=document.createElement('span');glyph.className='archive-entry-icon';glyph.append(createElement(Archive,{'class':'icon','aria-hidden':'true'}));row.append(glyph,copy,actions);list.append(row);}
  if(entries.length>limit){const more=document.createElement('button');more.className='load-more';more.textContent=tr('载入更多');more.onclick=()=>{limit+=50;draw();};list.append(more);}
 }
 async function refresh(){const value=await api.programVersions();if(disposed)return;entries=value;draw();}
 async function locked(action:()=>Promise<void>){const dialog=q<HTMLDialogElement>('dialog'),prevent=(e:Event)=>e.preventDefault(),controls=Array.from(dialog.querySelectorAll<HTMLButtonElement|HTMLInputElement>('button,input')),disabled=controls.map(c=>c.disabled);dialog.addEventListener('cancel',prevent);controls.forEach(c=>c.disabled=true);try{await action();}finally{dialog.removeEventListener('cancel',prevent);controls.forEach((c,i)=>c.disabled=disabled[i]);}}
 function wipeOnClose(){const dialog=q<HTMLDialogElement>('dialog'),fields=Array.from(dialog.querySelectorAll<HTMLInputElement>('input')),key=dialog.querySelector<HTMLElement>('#program-recovery-key'),wipe=()=>{fields.forEach(f=>f.value='');if(key)key.textContent='';};modalCleanup=()=>{wipe();if(dialog.open)dialog.close();};dialog.addEventListener('close',wipe,{once:true});return wipe;}
 async function select(id:string){if(loading||externalBusy||disposed)return;loading=true;draw();status.textContent=tr('正在校验旧程序与恢复点…');
  try{const choice=await api.chooseProgramVersion(id);if(disposed){await api.cancelProgramRollback();return;}if(!choice.encrypted&&!choice.requiresProtection){const preview=await api.previewProgramVersion(choice.token);if(disposed){await api.cancelProgramRollback();return;}showPreview(preview);}else credentials(choice);
  }catch(error){await api.cancelProgramRollback().catch(()=>{});throw error;}finally{loading=false;if(!disposed){status.textContent='';draw();}}
 }
 function credentials(choice:ProgramRollbackChoice){let preview:ProgramRollbackPreview|undefined,wipe=()=>{};
  const password=choice.encrypted?'<label class="field">'+esc(tr('资料密码或恢复密钥'))+'<input id="program-password" type="password" autocomplete="off" maxlength="1024" required></label><label class="tool-check"><input id="program-use-key" type="checkbox">'+esc(tr('使用恢复密钥'))+'</label>':'';
  const protection=choice.requiresProtection?'<label class="field">'+esc(tr('新历史解锁密码'))+'<input id="program-new-password" type="password" autocomplete="new-password" maxlength="1024" required></label><label class="field">'+esc(tr('再次输入新密码'))+'<input id="program-repeat" type="password" autocomplete="new-password" maxlength="1024" required></label>':'';
  ctx.modal(tr('校验旧程序'),'<p>Clipper '+esc(choice.version)+'</p>'+password+protection,()=>locked(async()=>{const newPassword=q<HTMLInputElement>('program-new-password')?.value;if(choice.requiresProtection&&(newPassword!.length<12||newPassword!==q<HTMLInputElement>('program-repeat').value))throw new Error(tr('新密码至少 12 个字符，且两次填写一致'));preview=await api.previewProgramVersion(choice.token,q<HTMLInputElement>('program-password')?.value,newPassword,q<HTMLInputElement>('program-use-key')?.checked?'recovery':'password');wipe();}),tr('校验与预览'));
  wipe=wipeOnClose();q('dialog').addEventListener('close',()=>{if(preview&&!disposed)queueMicrotask(()=>{if(!disposed)showPreview(preview!);});else void api.cancelProgramRollback().catch(()=>{});},{once:true});
 }
 function showPreview(preview:ProgramRollbackPreview){if(disposed)return;let committed=false,wipe=()=>{};const counts=[['clips',tr('历史记录')],['snippets',tr('快捷回复')],['categories',tr('分类')],['scripts',tr('文本脚本')]] as const;
  const summary='<div class="restore-summary">'+counts.map(([key,label])=>'<div><strong>'+esc(formatNumber(preview[key]))+'</strong><span>'+esc(label)+'</span></div>').join('')+'</div>';
  const key=preview.recoveryKey?'<p class="field-help">'+esc(tr('请保存新恢复密钥，再填写完整密钥确认。'))+'</p><pre class="vault-recovery" id="program-recovery-key">'+esc(preview.recoveryKey)+'</pre><label class="field">'+esc(tr('完整恢复密钥'))+'<input id="program-proof" autocomplete="off" maxlength="1024" required></label>':'';
  ctx.modal(tr('程序回退校验通过'),'<p>Clipper '+esc(current)+' → '+esc(preview.version)+'</p>'+summary+'<p class="field-help">'+esc(tr('退出后切换程序并打开独立的数据副本，当前程序、资料与恢复点均保留。回退后暂停记录、自动备份和同步。'))+'</p>'+key,()=>locked(async()=>{await api.rollbackProgramVersion(preview.token,q<HTMLInputElement>('program-proof')?.value);committed=true;wipe();}),tr('退出并回退'));
  wipe=wipeOnClose();q('dialog').addEventListener('close',()=>{if(!committed)void api.cancelProgramRollback().catch(()=>{});},{once:true});
 }
 void refresh().catch(ctx.toast);
 return {configure(value:{installed:boolean;current:string;busy:boolean}){if(disposed)return;installed=value.installed;current=value.current;externalBusy=value.busy;draw();},dispose(){disposed=true;modalCleanup?.();void api.cancelProgramRollback().catch(()=>{});}};
}
