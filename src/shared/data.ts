import {t as tr} from './i18n';
export interface BackupOptions {enabled:boolean;directory:string;intervalHours:number;keep:number;encrypted:boolean}
export interface BackupSettingsInput extends BackupOptions {password?:string}
export interface BackupStatus extends BackupOptions {hasPassword:boolean;lastSuccess:number;lastAttempt:number;nextAt:number;lastError:string}
export interface BackupEntry {name:string;bytes:number;createdAt:number;encrypted:boolean}
export interface StoragePlan {token:string;directory:string;bytes:number}
export interface RestoreFile {token:string;name:string;encrypted:boolean}
export interface RestorePreview {token:string;name:string;clips:number;snippets:number;categories:number;scripts:number;exportedAt:string;encrypted:boolean}
export interface DataState {directory:string;defaultDirectory:string;databaseBytes:number;previousDirectory:string;backup:BackupStatus;entries:BackupEntry[]}
export function validateBackupOptions(value:unknown):BackupSettingsInput {
 const v=value as BackupSettingsInput;if(!v||typeof v.enabled!=='boolean'||typeof v.encrypted!=='boolean'||typeof v.directory!=='string'||v.directory.length>30000||!Number.isInteger(v.intervalHours)||v.intervalHours<1||v.intervalHours>168||!Number.isInteger(v.keep)||v.keep<1||v.keep>100)throw new Error(tr('备份设置无效：间隔 1–168 小时，保留 1–100 份'));
 if(v.password!==undefined&&(typeof v.password!=='string'||v.password.length>1024))throw new Error(tr('备份密码无效'));
 return {enabled:v.enabled,directory:v.directory,intervalHours:v.intervalHours,keep:v.keep,encrypted:v.encrypted,password:v.password};
}
