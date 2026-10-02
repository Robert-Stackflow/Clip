// Native helper codes identify application-owned errors; external messages stay literal.
export const attachmentErrors={
 ATTACHMENT_SHORT_CONTENT:'附件内容短于声明长度',
 ATTACHMENT_SIZE_LIMIT:'附件超过容量限制',
 ATTACHMENT_MEMORY_UNREADABLE:'无法读取附件内存',
 ATTACHMENT_CLIPBOARD_CHANGED:'剪贴板已改变',
 ATTACHMENT_PRIVATE:'此剪贴板内容不允许记录',
 ATTACHMENT_NOT_FOUND:'未找到虚拟附件',
 ATTACHMENT_DESCRIPTOR_UNSUPPORTED:'附件描述格式不支持',
 ATTACHMENT_DESCRIPTOR_INCOMPLETE:'附件描述不完整',
 ATTACHMENT_DESCRIPTOR_INVALID:'附件数量或描述无效',
 ATTACHMENT_NAME_UNTERMINATED:'附件文件名未终止',
 ATTACHMENT_NAME_DUPLICATED:'附件文件名重复',
 ATTACHMENT_ATTRIBUTES_UNSUPPORTED:'附件不支持链接或设备属性',
 ATTACHMENT_DIRECTORY_CONTENT:'文件夹不能声明文件内容',
 ATTACHMENT_TOTAL_LIMIT:'附件总量超过 12 MiB',
 ATTACHMENT_PARENT_INVALID:'附件父目录无效或大小写冲突',
 ATTACHMENT_TREE_LIMIT:'附件及父目录超过 256 项',
 ATTACHMENT_NAME_TOO_LONG:'附件文件名无效或过长',
 ATTACHMENT_DEPTH_LIMIT:'附件目录超过 16 层',
 ATTACHMENT_NAME_INVALID:'附件文件名无效',
 ATTACHMENT_LENGTH_MISMATCH:'附件内容与声明长度不一致',
 ATTACHMENT_MEDIUM_UNSUPPORTED:'附件内容介质不支持',
 ATTACHMENT_REQUEST_INVALID:'附件请求无效',
 ATTACHMENT_SOURCE_FAILURE:'目标应用无法提供附件内容'
} as const;
export function attachmentErrorSource(code:unknown):string|undefined{return typeof code==='string'&&Object.hasOwn(attachmentErrors,code)?attachmentErrors[code as keyof typeof attachmentErrors]:undefined;}
