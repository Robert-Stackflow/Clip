import {t} from '../shared/i18n';
import type {Detail} from '../shared/types';
interface Fragment {value:string;ascii?:true}
/** Exact JSON.stringify bytes for owned records, without a combined UTF-16 JSON string. */
export function recordJSON(record:Detail):Buffer{
 const fragments:Fragment[]=[],active=new Set<object>();
 const append=(value:string,ascii?:true)=>fragments.push({value,ascii});
 const emit=(raw:any,key='')=>{
  const value=raw&&typeof raw==='object'&&typeof raw.toJSON==='function'?raw.toJSON(key):raw;
  if(typeof value==='string'&&(key==='png'||key==='data')&&!/["\\\u0000-\u001f\u0080-\uffff]/.test(value)){
   append('"',true);for(let at=0;at<value.length;at+=196608)append(value.slice(at,at+196608),true);append('"',true);return;
  }
  if(value&&typeof value==='object'){
   if(active.has(value))throw new TypeError(t('内容校验已失效'));active.add(value);
   if(Array.isArray(value)){append('[',true);for(let index=0;index<value.length;index++){if(index)append(',',true);emit(value[index],String(index));}append(']',true);}
   else{append('{',true);let count=0;for(const [name,item]of Object.entries(value)){if(item===undefined||typeof item==='function'||typeof item==='symbol')continue;if(count++)append(',',true);append(JSON.stringify(name)+':');emit(item,name);}append('}',true);}
   active.delete(value);return;
  }
  append(JSON.stringify(value)??'null');
 };
 emit(record);const length=fragments.reduce((n,f)=>n+(f.ascii?f.value.length:Buffer.byteLength(f.value)),0),output=Buffer.allocUnsafe(length);let at=0;
 try{for(const f of fragments)at+=output.write(f.value,at,f.ascii?'ascii':'utf8');if(at!==length)throw new Error(t('内容校验已失效'));return output;}catch(error){output.fill(0);throw error;}
}
