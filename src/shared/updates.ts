export const UPDATE_REPOSITORY = 'Robert-Stackflow/Clip';
export const UPDATE_RELEASES_URL = `https://github.com/${UPDATE_REPOSITORY}/releases`;
export const UPDATE_API_URL = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`;
export const MAX_UPDATE_BYTES = 512 * 1024 * 1024;
export type UpdatePhase = 'idle'|'checking'|'current'|'unpublished'|'available'|'downloading'|'ready'|'installing'|'error';
export interface UpdateRelease { version:string; name:string; notes:string; url:string; assetURL:string; bytes:number; sha256:string }
export interface UpdateState { current:string; automatic:boolean; installed:boolean; phase:UpdatePhase; checkedAt:number; release?:UpdateRelease; downloaded:number; error:string; previous?:{success:boolean;version:string;reason:string} }
export function stableVersion(value:unknown):string|null {
  if(typeof value!=='string'||!/^v?(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(value))return null;
  return value.replace(/^v/,'');
}
export function newerVersion(value:string,current:string):boolean {
  const a=stableVersion(value),b=stableVersion(current);if(!a||!b)return false;
  const left=a.split('.').map(Number),right=b.split('.').map(Number);
  for(let i=0;i<3;i++){if(left[i]!==right[i])return left[i]>right[i];}return false;
}
export function releaseAsset(value:unknown,current:string):UpdateRelease|null {
  const release=value as any;
  if(!release||release.draft!==false||release.prerelease!==false)throw new Error('UPDATE_RELEASE_INVALID');
  const version=stableVersion(release.tag_name);if(!version)throw new Error('UPDATE_RELEASE_INVALID');
  if(!newerVersion(version,current))return null;
  const tag=release.tag_name,base=`${UPDATE_RELEASES_URL}/download/${tag}/`,page=`${UPDATE_RELEASES_URL}/tag/${tag}`;
  if(release.html_url!==page||!Array.isArray(release.assets))throw new Error('UPDATE_RELEASE_INVALID');
  const name=`Clip-${version}-Setup-x64.exe`,assets=release.assets.filter((a:any)=>a?.name===name);
  if(assets.length!==1)throw new Error('UPDATE_ASSET_MISSING');
  const asset=assets[0];
  if(asset.state!=='uploaded'||asset.browser_download_url!==base+name||!Number.isSafeInteger(asset.size)||asset.size<1||asset.size>MAX_UPDATE_BYTES||!/^sha256:[a-f0-9]{64}$/i.test(asset.digest||''))throw new Error('UPDATE_ASSET_INVALID');
  return {version,name:typeof release.name==='string'?release.name.slice(0,200):version,notes:typeof release.body==='string'?release.body.slice(0,12000):'',url:page,assetURL:asset.browser_download_url,bytes:asset.size,sha256:asset.digest.slice(7).toLowerCase()};
}
export function allowedUpdateURL(value:string):boolean {
  try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)return false;
    if(url.hostname==='api.github.com')return url.href===UPDATE_API_URL;
    if(url.hostname==='github.com')return url.pathname.startsWith(`/${UPDATE_REPOSITORY}/releases/download/`)&&!url.search;
    return ['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname);
  }catch{return false;}
}
