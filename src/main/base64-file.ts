import type {FileHandle} from 'node:fs/promises';
/** Keep at most 192 KiB decoded while awaiting disk writes; check cancellation per chunk. */
export async function writeBase64(file:FileHandle,encoded:string,check:()=>void){
 const step=256*1024;check();
 for(let offset=0;offset<encoded.length;offset+=step){
  check();const bytes=Buffer.from(encoded.slice(offset,offset+step),'base64');
  try{await file.writeFile(bytes);}finally{bytes.fill(0);}check();
 }
}
