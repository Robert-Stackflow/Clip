import {t as tr} from '../shared/i18n';
import {createSocket,type Socket} from 'node:dgram';
import {networkInterfaces} from 'node:os';
import {privateAddress,syncPeer,type SyncPeer} from '../shared/sync';
const group='239.255.77.77',port=47382;
export function localAddresses(){return [...new Set(Object.values(networkInterfaces()).flatMap(v=>v||[]).filter(v=>v.family==='IPv4'&&!v.internal&&privateAddress(v.address)).map(v=>v.address))];}
export class SyncDiscovery {
 private socket:Socket|undefined;private timer:NodeJS.Timeout|undefined;private found=new Map<string,SyncPeer&{seen:number}>();
 constructor(private self:()=>SyncPeer,private changed:()=>void,private error:(value:string)=>void){}
 list(){const now=Date.now();for(const [id,value] of this.found)if(now-value.seen>=20000)this.found.delete(id);return [...this.found.values()].map(({seen,...peer})=>peer);}
 start(){const socket=this.socket=createSocket({type:'udp4',reuseAddr:true});socket.on('error',()=>this.error(tr('附近发现不可用，可使用配对码连接')));socket.on('message',(bytes,info)=>{if(bytes.length>2048||!privateAddress(info.address))return;try{const packet=JSON.parse(bytes.toString());if(packet.protocol!=='clipper-lan/1')return;const peer=syncPeer({...packet.device,host:info.address});if(peer.id===this.self().id)return;if(this.found.size>=64&&!this.found.has(peer.id))return;this.found.set(peer.id,{...peer,seen:Date.now()});this.changed();}catch{}});
  socket.bind(port,'0.0.0.0',()=>{if(this.socket!==socket)return;try{socket.setMulticastTTL(1);socket.setMulticastLoopback(true);socket.addMembership(group);this.announce();this.timer=setInterval(()=>this.announce(),5000);}catch{this.error(tr('附近发现不可用，可使用配对码连接'));}});
 }
 private announce(){try{const device=this.self(),bytes=Buffer.from(JSON.stringify({protocol:'clipper-lan/1',device}));this.socket?.send(bytes,port,group,()=>{});}catch{}}
 stop(){clearInterval(this.timer);const socket=this.socket;this.socket=undefined;if(socket)try{socket.close();}catch{}this.found.clear();}
}
