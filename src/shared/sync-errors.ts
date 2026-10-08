import {t as tr} from './i18n';
export const syncErrors={
 SYNC_ORIGIN_UNSUPPORTED:'请求来源不受支持',
 SYNC_ITEM_BUSY:'正在准备其他同步内容，请稍后重试',
 SYNC_STOPPED:'同步已停止或信任已改变',
 SYNC_INVITE_CONSUMED:'配对码无效、已使用或已过期',
 SYNC_IDENTITY_CONFLICT:'设备身份冲突',
 SYNC_PAIRING_EXPIRED:'配对请求已失效',
 SYNC_NOT_TRUSTED:'设备未配对或信任已撤销',
 SYNC_FORMAT_UPGRADE:'原始格式同步需要双方升级至 Clip 0.13 或以上',
 SYNC_OPERATION_UNSUPPORTED:'不支持的同步操作',
 SYNC_INDEX_LIMIT:'同步目录已达 20,000 条，请停止新增共享并保留本机内容',
 SYNC_FILES_UNSUPPORTED:'文件需要先保存为附件副本，不发送文件路径',
 SYNC_ATTACHMENT_UPGRADE:'文件及原始格式同步需要双方升级至 Clip 0.27 或以上',
 SYNC_LOCAL_ONLY:'此内容已设为仅本机，请先允许同步',
 SYNC_OPTIONS_INVALID:'共享设置无效',
 SYNC_ITEM_WITHDRAWN:'共享内容已撤回',
 SYNC_SEND_DENIED:'此记录不允许发送',
 SYNC_RECORD_CHANGED:'同一发布的内容不允许被替换',
 SYNC_FILE_RECEIVE_DENIED:'不接受文件路径同步',
 SYNC_CONTENT_MISMATCH:'同步内容校验失败',
 SYNC_NAME_INVALID:'设备名称需为 1–60 个字符',
 SYNC_PEER_INVALID:'设备地址或身份无效',
 SYNC_RECORD_INVALID:'同步记录格式无效',
 SYNC_CERTIFICATE_MISSING:'设备没有提供证书',
 SYNC_REQUEST_TOO_LARGE:'同步请求过大'
} as const;
export type SyncErrorCode=keyof typeof syncErrors;
export function syncErrorSource(code:unknown):string|undefined{return typeof code==='string'&&Object.hasOwn(syncErrors,code)?syncErrors[code as SyncErrorCode]:undefined;}
export class SyncError extends Error{constructor(readonly code:SyncErrorCode){super(tr(syncErrors[code]));}}
export function syncErrorResponse(error:unknown){return {error:String(error instanceof Error?error.message:error).slice(0,250),...(error instanceof SyncError?{code:error.code}:{})};}
export function syncRemoteError(value:any):Error{const source=syncErrorSource(value?.code);return source?new SyncError(value.code):new Error(typeof value?.error==='string'?value.error:tr('设备拒绝同步'));}
