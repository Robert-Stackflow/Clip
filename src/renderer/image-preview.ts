import {t} from '../shared/i18n';
import {icon} from './ui';
/** One's preview-loading surface; errors stay local and expose a quiet retry action. */
export function mountImagePreview(root:HTMLElement){
 const image=root.querySelector<HTMLImageElement>('.image-preview img');if(!image)return;
 const stage=image.parentElement!,status=document.createElement('div');status.className='preview-loading image-load-status';status.setAttribute('role','status');status.hidden=true;stage.append(status);let timer:ReturnType<typeof setTimeout>,disposed=false;
 const loading=()=>{clearTimeout(timer);status.hidden=true;image.hidden=false;stage.setAttribute('aria-busy','true');timer=setTimeout(()=>{if(!stage.isConnected)return;status.replaceChildren();status.insertAdjacentHTML('beforeend',icon('image'));const text=document.createElement('span');text.textContent=t('正在读取…');status.append(text);status.hidden=false;},150);};
 const loaded=()=>{clearTimeout(timer);if(disposed)return;stage.removeAttribute('aria-busy');status.hidden=true;image.hidden=false;};
 const failed=()=>{clearTimeout(timer);if(disposed||!stage.isConnected)return;stage.removeAttribute('aria-busy');image.hidden=true;const label=document.createElement('span');label.textContent=t('无法读取图片预览');const retry=document.createElement('button');retry.type='button';retry.className='quiet';retry.textContent=t('重试');retry.onclick=()=>{if(disposed)return;loading();const url=new URL(image.src);url.searchParams.set('retry',crypto.randomUUID());image.src=url.toString();};status.replaceChildren(label,retry);status.hidden=false;};
 image.addEventListener('load',loaded);image.addEventListener('error',failed);loading();if(image.complete){if(image.naturalWidth)loaded();else failed();}
 return()=>{disposed=true;clearTimeout(timer);image.removeEventListener('load',loaded);image.removeEventListener('error',failed);image.removeAttribute('src');status.remove();stage.removeAttribute('aria-busy');};
}
