import {createElement,Sparkles,Languages,AlignLeft,PenLine,Code2,Mail,List,Check,Lightbulb,MessageSquare,type IconNode} from 'lucide';
import {t as tr} from '../shared/i18n';
import {commandIcons,commandVariables,promptVariables,validateCommand,type TextCommand,type CommandIcon} from '../shared/commands';
import {iconButton,registerIcons} from './ui';
import {ActionScope} from './actions';

const glyphs:Record<CommandIcon,IconNode>={sparkles:Sparkles,languages:Languages,summary:AlignLeft,rewrite:PenLine,code:Code2,mail:Mail,list:List,check:Check,lightbulb:Lightbulb,message:MessageSquare};
registerIcons({ 'command-edit':PenLine,'command-copy':Code2,...Object.fromEntries(Object.entries(glyphs).map(([name,node])=>['command-'+name,node])) });
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const commandGlyph=(name:CommandIcon)=>createElement(glyphs[name]||Sparkles,{class:'icon','aria-hidden':'true','stroke-width':1.75}).outerHTML;
const iconTitles=()=>({sparkles:tr('灵感'),languages:tr('翻译'),summary:tr('总结'),rewrite:tr('改写'),code:tr('代码'),mail:tr('邮件'),list:tr('列表'),check:tr('检查'),lightbulb:tr('想法'),message:tr('对话')});
const variableTitles=()=>({text:tr('正文'),language:tr('目标语言'),title:tr('记录标题'),source:tr('来源应用'),date:tr('当前日期'),time:tr('当前时间')});
interface CommandContext {modal(title:string,body:string,save:()=>Promise<void>,label?:string):void;toast(text:unknown):void;render():Promise<void>}
export function commandCards(commands:TextCommand[]){
 const cards=(items:TextCommand[])=>items.map(command=>`<article class="command-card"><span class="command-card-icon">${commandGlyph(command.icon)}</span><div class="command-card-copy"><strong>${esc(command.title)}</strong><p>${esc(command.prompt)}</p><div class="command-variable-tags">${promptVariables(command.prompt).map(name=>`<code>{{${name}}}</code>`).join('')}</div></div><div class="command-card-actions">${command.builtin?'':iconButton('command-edit-'+command.id,tr('编辑指令'),'lucide:command-edit')}${iconButton('command-copy-'+command.id,tr('复制为新指令'),'lucide:copy')}${command.builtin?'':iconButton('command-delete-'+command.id,tr('删除指令'),'lucide:trash')}</div></article>`).join('');
 return `<div class="command-library"><section><header class="command-section-heading"><h2>${tr('内置指令')}</h2><span>${tr('复制后可自定义')}</span></header><div class="command-cards">${cards(commands.filter(command=>command.builtin))}</div></section><section><header class="command-section-heading"><h2>${tr('我的指令')}</h2><span>${commands.filter(command=>!command.builtin).length}</span></header><div class="command-cards">${cards(commands.filter(command=>!command.builtin))||`<div class="command-empty">${commandGlyph('sparkles')}<p>${tr('把常用提示词保存为指令，在文字记录中随时运行。')}</p></div>`}</div></section></div>`;
}
export function bindCommandCards(commands:TextCommand[],ctx:CommandContext,actions:ActionScope){
 const root=document.getElementById('content')!;
 for(const command of commands){
  actions.bind(root.querySelector<HTMLButtonElement>('#command-copy-'+command.id),()=>editCommand(ctx,undefined,command),ctx.toast);
  if(command.builtin)continue;
  actions.bind(root.querySelector<HTMLButtonElement>('#command-edit-'+command.id),()=>editCommand(ctx,command),ctx.toast);
  actions.bind(root.querySelector<HTMLButtonElement>('#command-delete-'+command.id),()=>ctx.modal(tr('删除指令？'),`<p>${esc(command.title)}</p>`,async()=>{await window.clipper.removeCommand(command.id,command.revision);await ctx.render();},tr('删除')),ctx.toast);
 }
}
export function editCommand(ctx:CommandContext,command?:TextCommand,copy?:TextCommand){
 const initial=command||copy;let selected:CommandIcon=initial?.icon||'sparkles';const names=iconTitles(),variables=variableTitles();
 ctx.modal(command?tr('编辑指令'):copy?tr('复制指令'):tr('新建指令'),`<div class="command-editor-heading"><span id="command-preview-icon" class="command-card-icon">${commandGlyph(selected)}</span><label class="field">${tr('标题')}<input id="command-title" maxlength="60" required value="${esc(initial?.title||'')}" placeholder="${tr('例如：润色邮件')}"></label></div><div class="command-icon-picker" role="group" aria-label="${tr('指令图标')}">${commandIcons.map(name=>`<button type="button" class="icon-button quiet" data-command-icon="${name}" aria-label="${names[name]}" title="${names[name]}" aria-pressed="${selected===name}">${commandGlyph(name)}</button>`).join('')}</div><label class="field command-prompt-field">${tr('提示词')}<textarea id="command-prompt" rows="7" spellcheck="false" maxlength="16000" required placeholder="${tr('用 {{language}} 润色 {{text}}，让表达更清晰自然。')}">${esc(initial?.prompt||'')}</textarea></label><div class="command-variable-help"><strong>${tr('插入变量')}</strong><div class="command-variable-buttons">${commandVariables.map(name=>`<button type="button" data-insert-variable="${name}"><code>{{${name}}}</code><span>${variables[name]}</span></button>`).join('')}</div><p>${tr('点击插入到光标处。还可写 {{tone}} 等自定义变量，运行前填写。未插入 {{text}} 时会自动附上正文。')}</p><p id="command-validation" role="status" aria-live="polite"></p></div>`,async()=>{
  const value=validateCommand({id:command?.id,revision:command?.revision,title:(document.getElementById('command-title') as HTMLInputElement).value,icon:selected,prompt:(document.getElementById('command-prompt') as HTMLTextAreaElement).value});
  await window.clipper.saveCommand(value);await ctx.render();ctx.toast(tr('指令已保存'));
 });
 const dialog=document.getElementById('dialog') as HTMLDialogElement,prompt=document.getElementById('command-prompt') as HTMLTextAreaElement;
 dialog.classList.add('command-editor');dialog.addEventListener('close',()=>dialog.classList.remove('command-editor'),{once:true});
 const update=()=>{const status=document.getElementById('command-validation')!;try{const custom=promptVariables(prompt.value).filter(name=>!commandVariables.includes(name as typeof commandVariables[number]));status.textContent=custom.length?tr`运行前填写：${custom.join('、')}`:'';status.dataset.state='ready';prompt.setCustomValidity('');}catch(error){const text=(error as Error).message;status.textContent=prompt.value?text:'';status.dataset.state='error';prompt.setCustomValidity(text);}};
 prompt.oninput=update;update();
 dialog.querySelectorAll<HTMLButtonElement>('[data-command-icon]').forEach(button=>button.onclick=()=>{selected=button.dataset.commandIcon as CommandIcon;dialog.querySelectorAll('[data-command-icon]').forEach(node=>node.setAttribute('aria-pressed',String(node===button)));document.getElementById('command-preview-icon')!.innerHTML=commandGlyph(selected);});
 dialog.querySelectorAll<HTMLButtonElement>('[data-insert-variable]').forEach(button=>button.onclick=()=>{prompt.setRangeText('{{'+button.dataset.insertVariable+'}}',prompt.selectionStart,prompt.selectionEnd,'end');prompt.focus();update();});
}
