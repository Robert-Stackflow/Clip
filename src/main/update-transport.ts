import {get} from 'node:https';
import {allowedUpdateURL} from '../shared/updates';

export type UpdateTransport = (url:string,signal:AbortSignal)=>Promise<import('node:http').IncomingMessage>;
// Each redirect is checked before requesting it; no credentials or historical data are sent.
export const updateTransport:UpdateTransport = async (url,signal)=>{
  for(let redirects=0;redirects<=5;redirects++){
    if(!allowedUpdateURL(url))throw new Error('UPDATE_URL_INVALID');
    const response=await new Promise<import('node:http').IncomingMessage>((resolve,reject)=>{
      const request=get(url,{signal,headers:{'User-Agent':'Clipper-Desktop','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Accept-Encoding':'identity'}},resolve);
      request.setTimeout(30000,()=>request.destroy(new Error('UPDATE_TIMEOUT')));request.once('error',reject);
    });
    if([301,302,303,307,308].includes(response.statusCode||0)){
      const next=response.headers.location;response.destroy();if(!next)throw new Error('UPDATE_URL_INVALID');url=new URL(next,url).href;continue;
    }
    return response;
  }
  throw new Error('UPDATE_URL_INVALID');
};
