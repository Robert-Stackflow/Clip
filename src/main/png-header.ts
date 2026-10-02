import {t} from '../shared/i18n';
/** Only the fixed IHDR prefix is decoded here; full decoding runs in the image host. */
export function pngDimensions(encoded:string){const data=Buffer.from(encoded.slice(0,32),'base64');if(data.length<24||data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||data.toString('ascii',12,16)!=='IHDR')throw new Error(t('PNG 图片无效'));const width=data.readUInt32BE(16),height=data.readUInt32BE(20);if(!width||!height||width*height>40_000_000||width>16384||height>16384)throw new Error(t('图片像素过大'));return {width,height};}
