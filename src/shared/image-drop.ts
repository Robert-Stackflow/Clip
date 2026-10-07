/** Images dragged by browsers may have bytes, an address, or both. */
export type ImageDrop={data:string;url?:never;referrer?:never;fallback?:never}|{url:string;data?:never;referrer?:string;fallback?:string};
export type ImageDrops=ImageDrop|ImageDrop[];
export const IMAGE_DROP_TYPE='application/x-clipper-images';
export const IMAGE_EXTENSIONS=/\.(png|jpe?g|webp|bmp|gif|avif|svg|heic|heif|tiff?)(?:[?#]|$)/i;
export function originalImageURL(value:string){try{const url=new URL(value);if(url.hostname==='share.cloudchewie.com'&&/^\/i\/[\w-]+\/thumbnail$/.test(url.pathname)){url.pathname=url.pathname.slice(0,-10);return url.href;}}catch{}return value;}
