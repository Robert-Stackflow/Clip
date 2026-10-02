import {app} from 'electron';
import {randomUUID} from 'node:crypto';
import {parseExternalUrl,type IntegrationState,type ExternalIntent} from '../shared/text-tools';
const scheme='clipper-win';
export class IntegrationService {
 private pending:IntegrationState['pending']=null;
 constructor(private changed:()=>void,private show:()=>void,private error:(e:unknown)=>void){}
 state():IntegrationState{return {registered:app.isDefaultProtocolClient(scheme),pending:this.pending};}
 register(enabled:unknown){if(typeof enabled!=='boolean')throw new Error('URL 集成选项无效');if(!app.isPackaged)throw new Error('请使用发布的 Clipper.exe 注册 URL 集成');
  if(enabled){if(app.isDefaultProtocolClient(scheme))return;const owner=app.getApplicationNameForProtocol(scheme+':');if(owner)throw new Error('此 URL 协议已由其他应用注册，请先在 Windows 中移除关联');if(!app.setAsDefaultProtocolClient(scheme))throw new Error('Windows 未能注册 URL 协议');}
  else if(app.isDefaultProtocolClient(scheme)&&!app.removeAsDefaultProtocolClient(scheme))throw new Error('Windows 未能移除 URL 协议');this.changed();
 }
 receive(argv:string[]){const url=argv.find(s=>/^clipper-win:/i.test(s));if(!url)return;try{const intent=parseExternalUrl(url);this.pending={id:randomUUID(),intent};this.show();this.changed();}catch(e){this.error(e);}}
 resolve(id:string,accept:boolean):ExternalIntent|null {if(typeof accept!=='boolean'||!this.pending||this.pending.id!==id)throw new Error('外部请求已过期');const intent=this.pending.intent;this.pending=null;return accept?intent:null;}
}
