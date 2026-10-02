// Stable transport codes identify only errors owned by this application.
export const webErrors={
 WEB_CLOSED:'共享已结束，请重新请求邀请',
 WEB_RATE_LIMIT:'请求过于频繁，请稍后重试',
 WEB_JSON_REQUIRED:'请发送 JSON 内容',
 WEB_ENCODING_UNSUPPORTED:'不支持压缩请求',
 WEB_TOO_LARGE:'内容过大',
 WEB_INVALID_JSON:'内容格式无效',
 WEB_CONNECTION_INVALID:'连接已失效，请在桌面端重新生成邀请',
 WEB_ORIGIN_INVALID:'请求来源不受支持',
 WEB_CONNECT_LIMIT:'连接请求过多',
 WEB_PENDING_LIMIT:'待确认请求过多',
 WEB_SESSION_CHANGED:'会话已改变',
 WEB_INVITE_INVALID:'邀请无效、已使用或未核对证书',
 WEB_APPROVAL_PENDING:'等待桌面端确认连接',
 WEB_ITEM_WITHDRAWN:'该内容已撤回',
 WEB_RECEIVE_ONLY:'此浏览器只有接收权限',
 WEB_PAYLOAD_UNSUPPORTED:'只支持文字或 PNG 图片',
 WEB_IMAGE_INVALID:'图片尺寸过大或无效',
 WEB_PNG_UNREADABLE:'无法读取 PNG 图片',
 WEB_SEND_REVOKED:'连接或发送权限已失效',
 WEB_REQUEST_REUSED:'请求编号已用于不同内容',
 WEB_ACTION_UNSUPPORTED:'不支持的操作',
 WEB_CONTENT_INVALID:'内容无效或无法保存'
} as const;
export type WebErrorCode=keyof typeof webErrors;
export function webErrorSource(code:unknown):string|undefined{return typeof code==='string'&&Object.hasOwn(webErrors,code)?webErrors[code as WebErrorCode]:undefined;}
