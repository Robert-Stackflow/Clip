import {inspectMetadata} from './metadata-core';
import {lockMetadataFile} from './metadata-file';
import type {MetadataSource} from './metadata-source';
const port=(process as any).parentPort;let used=false;
port.on('message',async(event:{data:{source:MetadataSource;includeLocation:boolean}})=>{if(used)return;used=true;let file:ReturnType<typeof lockMetadataFile>|undefined;try{const {source,includeLocation}=event.data;const input='path'in source?(file=lockMetadataFile(source.path),{name:source.name,path:file.path,size:file.size}):{name:source.name,bytes:source.bytes,size:source.bytes.byteLength};const result=await inspectMetadata(input,includeLocation);file?.release();file=undefined;port.postMessage({ok:true,result});}catch(e){file?.release();port.postMessage({ok:false,error:String((e as Error).message||'无法读取内部信息').slice(0,300)});}});
