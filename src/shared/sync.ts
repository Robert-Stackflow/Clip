export interface SyncRecord {id:string;hash:string;createdAt:number;deleted:boolean}
export interface SyncPeer {id:string;name:string;host:string;port:number;fingerprint:string}
export interface SyncOptions {enabled:boolean;name:string;autoNew:boolean}
export interface SyncState extends SyncOptions {id:string;port:number;addresses:string[];fingerprint:string;error:string;shared:number;tombstones:number;peers:(SyncPeer&{lastSync:number;error:string;busy:boolean})[];nearby:SyncPeer[];pending:{id:string;name:string;host:string;fingerprint:string}[];joining:string;invitation:string;expires:number}
export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const fingerprintPattern=/^[0-9a-f]{64}$/;
export function syncName(value:unknown){if(typeof value!=='string'||!value.trim()||value.length>60||/[\x00-\x1f]/.test(value))throw new Error('设备名称需为 1–60 个字符');return value.trim();}
export function privateAddress(value:unknown):value is string {if(typeof value!=='string'||!/^\d{1,3}(\.\d{1,3}){3}$/.test(value))return false;const p=value.split('.').map(Number);return p.every(n=>n>=0&&n<=255)&&(p[0]===10||p[0]===127||p[0]===192&&p[1]===168||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===169&&p[1]===254);}
export function syncPeer(value:unknown):SyncPeer{const p=value as SyncPeer;if(!p||!uuidPattern.test(p.id)||!privateAddress(p.host)||!Number.isInteger(p.port)||p.port<1024||p.port>65535||!fingerprintPattern.test(p.fingerprint))throw new Error('设备地址或身份无效');return {id:p.id,name:syncName(p.name),host:p.host,port:p.port,fingerprint:p.fingerprint};}
export function syncRecord(value:unknown):SyncRecord{const r=value as SyncRecord;if(!r||typeof r.id!=='string'||r.id.split('.').length!==2||!r.id.split('.').every(x=>uuidPattern.test(x))||!fingerprintPattern.test(r.hash)||!Number.isSafeInteger(r.createdAt)||r.createdAt<0||typeof r.deleted!=='boolean')throw new Error('同步记录格式无效');return {id:r.id,hash:r.hash,createdAt:r.createdAt,deleted:r.deleted};}
