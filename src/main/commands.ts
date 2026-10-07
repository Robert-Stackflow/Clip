import {randomUUID} from 'node:crypto';
import {t as tr} from '../shared/i18n';
import {builtinCommands,validateCommand,type TextCommand} from '../shared/commands';
import type {Store} from './store';

export class CommandService {
 constructor(private store:Pick<Store,'meta'|'setMeta'>){}
 private custom():TextCommand[]{return this.store.meta('text-commands',[]);}
 list():TextCommand[]{return [...builtinCommands(),...this.custom()];}
 get(id:string,revision:string){const command=this.list().find(item=>item.id===id);if(!command)throw new Error(tr('指令已不存在，请重新选择'));if(command.revision!==revision)throw new Error(tr('指令已改变，请重新打开后运行'));return command;}
 save(value:unknown){
  const input=validateCommand(value),commands=this.custom(),previous=commands.find(command=>command.id===input.id);
  if(input.id&&!previous)throw new Error(tr('指令已不存在，请重新选择'));
  if(previous&&previous.revision!==input.revision)throw new Error(tr('指令已改变，请重新打开后编辑'));
  if(!previous&&commands.length>=100)throw new Error(tr('最多保存 100 个自定义指令'));
  const command:TextCommand={id:input.id||randomUUID(),title:input.title,icon:input.icon,prompt:input.prompt,revision:randomUUID(),builtin:false};
  this.store.setMeta('text-commands',previous?commands.map(item=>item.id===command.id?command:item):[...commands,command]);return command.id;
 }
 remove(id:string,revision:string){const command=this.get(id,revision);if(command.builtin)throw new Error(tr('内置指令不能删除，可复制后修改'));this.store.setMeta('text-commands',this.custom().filter(item=>item.id!==id));}
}
