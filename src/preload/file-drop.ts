import {webUtils} from 'electron';
import {t as tr} from '../shared/i18n';
import type {ImageDrops} from '../shared/image-drop';

export async function importDroppedFiles(files:File[],paths:(value:string[])=>Promise<void>,image:(value:ImageDrops)=>Promise<void>){
 if(!files.length||files.length>32)throw new Error(tr('一次最多拖入 32 个文件'));
 const names=files.map(file=>webUtils.getPathForFile(file));
 if(names.every(Boolean))return paths(names);
 // MIME may be empty; the main process validates the actual encoded signature.
 const images:{data:string}[]=[];let total=0;
 for(let i=0;i<files.length;i++)if(!names[i]){
  const file=files[i];if(file.type&&!file.type.startsWith('image/'))throw new Error(tr('文件路径无效'));
  total+=file.size;if(file.size>16*1024*1024||total>48*1024*1024)throw new Error(tr('图片文件过大'));
  const bytes=Buffer.from(await file.arrayBuffer());try{images.push({data:bytes.toString('base64')});}finally{bytes.fill(0);}
 }
 await image(images.length===1?images[0]:images);
 const local=names.filter(Boolean);if(local.length)await paths(local);
}
