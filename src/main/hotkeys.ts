import {t as tr} from '../shared/i18n';
import {shortcutKey} from '../shared/efficiency';
import {chatShortcut} from '../shared/chat';
import {shortcutLabel} from '../shared/shortcut';
export type HotkeyBinding=[string,()=>void,'chat'?];
interface Adapter {register(key:string,callback:()=>void):boolean;unregister(key:string):void}
// Reserve all new keys before releasing old keys. Provisional callbacks cannot run.
export class HotkeyRegistry {
 private active=new Map<string,{callback:()=>void;enabled:boolean}>();
 constructor(private adapter:Adapter){}
 replace(bindings:HotkeyBinding[],strict=true){
  const next=new Map<string,()=>void>(),errors:string[]=[];
  for(const [key,callback,mode]of bindings){try{const normalized=mode==='chat'?chatShortcut(key):shortcutKey(key,true);if(!normalized)continue;if(next.has(normalized))throw new Error(tr`快捷键 ${shortcutLabel(normalized)} 不能重复`);next.set(normalized,callback);}catch(e){if(strict)throw e;errors.push((e as Error).message);}}
  const added=new Map<string,{callback:()=>void;enabled:boolean}>();
  try{for(const [key,callback]of next){if(this.active.has(key))continue;const entry={callback,enabled:false};let ok=false;try{ok=this.adapter.register(key,()=>{if(entry.enabled)entry.callback();});}catch{}if(ok)added.set(key,entry);else{const error=tr`快捷键 ${shortcutLabel(key)} 已被占用，请更换`;if(strict)throw new Error(error);errors.push(error);}}}
  catch(e){for(const key of added.keys())this.adapter.unregister(key);throw e;}
  for(const [key,entry]of this.active){if(!next.has(key)){entry.enabled=false;this.adapter.unregister(key);this.active.delete(key);}else entry.callback=next.get(key)!;}
  for(const [key,entry]of added){entry.enabled=true;this.active.set(key,entry);}return errors.join('；');
 }
 clear(){for(const [key,entry]of this.active){entry.enabled=false;this.adapter.unregister(key);}this.active.clear();}
}
