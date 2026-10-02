import {app} from 'electron';
import {join} from 'node:path';
import {AttachmentReader} from './attachment-reader';
import {AttachmentFiles} from './attachment-files';
import type {Attachment} from '../shared/attachments';
let reader:AttachmentReader,files:AttachmentFiles;
export async function initAttachments(){reader=new AttachmentReader(app.isPackaged?join(process.resourcesPath,'app.asar.unpacked','dist','native','AttachmentHost.exe'):join(__dirname,'../native/AttachmentHost.exe'));files=new AttachmentFiles(join(app.getPath('userData'),'work','attachments'));await files.init();}
export const readAttachments=(sequence:number)=>reader.read(sequence);
export const attachmentFiles=(value:Attachment[],valid?:()=>boolean)=>files.materialize(value,valid);
export function cancelAttachments(){reader?.cancel();files?.cancel();}
export function disposeAttachments(){reader?.cancel();files?.dispose();}
