import {createDeflate} from 'node:zlib';
import {once} from 'node:events';
import {imageSize} from 'image-size';
import {MAX_ITEM} from '../shared/core';

const port=(process as NodeJS.Process&{parentPort:NodeJS.EventEmitter&{postMessage(value:unknown):void}}).parentPort;
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type:string,data:Buffer){const body=Buffer.concat([Buffer.from(type),data]),head=Buffer.alloc(4),tail=Buffer.alloc(4);let crc=0xffffffff;for(const byte of body)crc=crcTable[(crc^byte)&255]^(crc>>>8);head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,body,tail]);}
function dimensions(width:number,height:number){if(!width||!height||width>16384||height>16384||width*height>40000000)throw Error('Image dimensions');}
port.once('message',async({data:value})=>{
 let bytes:Buffer|undefined,pixels:Uint8ClampedArray|undefined;
 try{
  if(typeof value?.data!=='string'||value.data.length>MAX_ITEM*1.34)throw Error('Image size');
  bytes=Buffer.from(value.data,'base64');const size=imageSize(bytes);dimensions(size.width,size.height);
  for(const image of size.images||[])dimensions(image.width,image.height);
  const decode=require('heic-decode') as (options:{buffer:Buffer})=>Promise<{width:number;height:number;data:Uint8ClampedArray}>;
  const image=await decode({buffer:bytes});dimensions(image.width,image.height);pixels=image.data;
  if(pixels.length!==image.width*image.height*4)throw Error('Image data');
  // Compress one row at a time; avoid a second full-size RGBA allocation.
  const stream=createDeflate({level:3}),parts:Buffer[]=[];let total=0;
  stream.on('data',(part:Buffer)=>{total+=part.length;if(total>MAX_ITEM)stream.destroy(Error('Image size'));else parts.push(part);});
  const completed=once(stream,'end');void completed.catch(()=>{});
  try{const stride=image.width*4;for(let y=0;y<image.height;y++){const row=Buffer.allocUnsafe(stride+1);row[0]=0;row.set(pixels.subarray(y*stride,(y+1)*stride),1);if(!stream.write(row))await once(stream,'drain');}stream.end();await completed;
   const header=Buffer.alloc(13);header.writeUInt32BE(image.width,0);header.writeUInt32BE(image.height,4);header[8]=8;header[9]=6;
   const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',Buffer.concat(parts)),chunk('IEND',Buffer.alloc(0))]);
   if(png.length>MAX_ITEM)throw Error('Image size');port.postMessage({png:png.toString('base64')});png.fill(0);
  }finally{stream.destroy();for(const part of parts)part.fill(0);}
 }catch{port.postMessage({error:'Image decoding failed'});}
 finally{bytes?.fill(0);pixels?.fill(0);}
});
