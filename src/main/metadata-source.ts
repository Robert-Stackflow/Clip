import {t as tr} from '../shared/i18n';
import type {Detail} from '../shared/types';
import {formatDefinition} from '../shared/formats';
import {validateMetadataTarget,type MetadataTarget} from '../shared/metadata';
import {win32} from 'node:path';
export type MetadataSource={name:string;path:string}|{name:string;bytes:Uint8Array};
export function metadataSource(item:Detail,value:MetadataTarget):MetadataSource{const t=validateMetadataTarget(value),p=item.payload;if(t.kind==='file'){const path=p.files?.[t.index];if(!path)throw new Error(tr('文件已不存在'));return {name:win32.basename(path),path};}if(t.kind==='attachment'){const a=p.attachments?.[t.index];if(!a)throw new Error(tr('附件已不存在'));if(a.directory)throw new Error(tr('请选择文件读取内部信息，文件夹没有文件内容'));return {name:a.name,bytes:Buffer.from(a.data,'base64')};}const original=p.formats?.find(f=>formatDefinition(f.name)?.mime.startsWith('image/'));if(original)return {name:tr`原图.${formatDefinition(original.name)!.extension}`,bytes:Buffer.from(original.data,'base64')};if(p.png)return {name:tr('原图.png'),bytes:Buffer.from(p.png,'base64')};throw new Error(tr('没有保存的原图'));}
