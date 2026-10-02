// Only these application-owned codes may select a translated error message.
export const ocrErrors={
 OCR_IMAGE_MISSING:'识别图片不存在',
 OCR_LANGUAGE_UNAVAILABLE:'未安装所选 OCR 语言，请在 Windows 设置中添加对应语言的光学字符识别组件'
} as const;
export function ocrErrorSource(code:unknown):string|undefined{
 return typeof code==='string'&&Object.hasOwn(ocrErrors,code)?ocrErrors[code as keyof typeof ocrErrors]:undefined;
}
