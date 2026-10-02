import {open} from 'node:fs/promises';
import type {MetadataInput} from './metadata-core';
// Read only ISO-BMFF box headers and movie/track metadata; never load media payloads.
export async function mp4Information(input:MetadataInput){const file=input.path?await open(input.path,'r'):undefined;let reads=0,boxes=0;const read=async(position:number,size:number)=>{if(position<0||size<0||position+size>input.size||(reads+=size)>1024*1024)throw new Error('视频信息范围无效或过大');const b=Buffer.alloc(size);if(file){if((await file.read(b,0,size,position)).bytesRead!==size)throw new Error('视频信息不完整');}else b.set(input.bytes!.subarray(position,position+size));return b;};let duration:number|undefined;const videos:string[]=[];
 const walk=async(start:number,end:number,depth:number):Promise<void>=>{if(depth>4)throw new Error('视频信息层级过深');for(let at=start;at<end;){if(++boxes>4096||end-at<8)throw new Error('视频信息结构无效');const head=await read(at,8),type=head.toString('ascii',4,8);let length=head.readUInt32BE(0),header=8;if(length===1){if(end-at<16)throw new Error('视频信息不完整');const large=(await read(at+8,8)).readBigUInt64BE();if(large>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('视频信息长度无效');length=Number(large);header=16;}else if(length===0)length=end-at;if(length<header||at+length>end)throw new Error('视频信息长度无效');const position=at+header,size=length-header;
  if(type==='moov'||type==='trak')await walk(position,at+length,depth+1);
  else if(type==='mvhd'&&size>=20){const b=await read(position,Math.min(size,32)),version=b[0];if(version!==0&&version!==1)throw new Error('视频时间格式不支持');if(version===1&&b.length<32)throw new Error('视频时间不完整');const scale=b.readUInt32BE(version?20:12),ticks=version?Number(b.readBigUInt64BE(24)):b.readUInt32BE(16);if(scale>0&&Number.isSafeInteger(ticks)&&ticks/scale<=1e9)duration=ticks/scale;}
  else if(type==='tkhd'&&size>=84){const b=await read(position,Math.min(size,96)),offset=b[0]===1?88:76;if((b[0]!==0&&b[0]!==1)||b.length<offset+8)throw new Error('视频轨信息不完整');const width=b.readUInt32BE(offset)/65536,height=b.readUInt32BE(offset+4)/65536;if(width>0&&height>0&&width<=65535&&height<=65535&&videos.length<8)videos.push(`${width} × ${height} px`);}
  at+=length;
 }};
 try{await walk(0,input.size,0);return {duration,videos};}finally{await file?.close();}
}
