import {t as tr} from '../shared/i18n';
import {createSocket,type Socket} from 'node:dgram';
import {networkInterfaces} from 'node:os';
import {privateAddress,syncPeer,type SyncPeer} from '../shared/sync';

const group='239.255.77.77',port=47382,expiry=20000;
type Discovered=SyncPeer&{endpoints:Map<string,number>};

export function localAddresses(){
 return [...new Set(Object.values(networkInterfaces()).flatMap(rows=>rows||[])
  .filter(row=>row.family==='IPv4'&&!row.internal&&privateAddress(row.address)).map(row=>row.address))];
}

export class SyncDiscovery {
 private socket:Socket|undefined;
 private timer:NodeJS.Timeout|undefined;
 private notifyTimer:NodeJS.Timeout|undefined;
 private replyTimer:NodeJS.Timeout|undefined;
 private announcing:Socket|undefined;
 private memberships=new Set<string>();
 private found=new Map<string,Discovered>();
 private unavailable=false;

 constructor(private self:()=>SyncPeer,private changed:()=>void,private error:(value:string)=>void){}

 list(){
  this.expire();
  return [...this.found.values()].map(({endpoints,...peer})=>peer);
 }

 start(){
  if(this.socket)return;
  const socket=this.socket=createSocket({type:'udp4',reuseAddr:true});
  socket.on('error',()=>{if(this.socket===socket)this.availability(false);});
  socket.on('message',(bytes,info)=>{
   if(this.socket!==socket||bytes.length>2048||!privateAddress(info.address))return;
   try{
    const packet=JSON.parse(bytes.toString());
    if(packet.protocol!=='clipper-lan/1')return;
    // Only the transport's source address is used to connect to the sender.
    const peer=syncPeer({...packet.device,host:info.address});
    if(peer.id===this.self().id)return;
    this.expire();
    const previous=this.found.get(peer.id);
    if(this.found.size>=64&&!previous)return;
    const endpoints=previous?.endpoints||new Map<string,number>();
    if(!endpoints.has(peer.host)&&endpoints.size>=8)return;
    endpoints.set(peer.host,Date.now());
    // Keep a live route stable when the same device advertises several NICs.
    // Every route expires independently, so a removed NIC cannot remain alive
    // merely because another NIC keeps broadcasting the same device identity.
    const next={...peer,host:previous?.host||peer.host,endpoints};
    this.found.set(peer.id,next);
    if(!previous||previous.name!==next.name||previous.host!==next.host||previous.port!==next.port||previous.fingerprint!==next.fingerprint)this.notify();
    // A newly started device learns about an already running device promptly.
    if(!previous&&!this.replyTimer)this.replyTimer=setTimeout(()=>{
     this.replyTimer=undefined;
     if(this.socket===socket)void this.announce(socket);
    },200);
   }catch{}
  });
  socket.bind(port,'0.0.0.0',()=>{
   if(this.socket!==socket)return;
   try{
    socket.setMulticastTTL(1);
    socket.setMulticastLoopback(true);
    void this.announce(socket);
    this.timer=setInterval(()=>void this.announce(socket),5000);
   }catch{this.availability(false);}
  });
 }

 private availability(available:boolean){
  const unavailable=!available;
  if(this.unavailable===unavailable)return;
  this.unavailable=unavailable;
  this.error(unavailable?tr('附近发现不可用，可使用配对码连接'):'');
 }

 private notify(){
  if(this.notifyTimer)return;
  const socket=this.socket;
  this.notifyTimer=setTimeout(()=>{
   this.notifyTimer=undefined;
   if(this.socket===socket)this.changed();
  },50);
 }

 private expire(){
  const now=Date.now();let changed=false;
  for(const [id,value]of this.found){
   for(const [host,seen]of value.endpoints)if(now-seen>=expiry)value.endpoints.delete(host);
   if(!value.endpoints.size){this.found.delete(id);changed=true;}
   else if(!value.endpoints.has(value.host)){value.host=value.endpoints.keys().next().value!;changed=true;}
  }
  if(changed)this.notify();
 }

 private interfaces(socket:Socket){
  const addresses=new Set(localAddresses());
  for(const address of this.memberships)if(!addresses.has(address)){
   try{socket.dropMembership(group,address);}catch{}
   this.memberships.delete(address);
  }
  for(const address of addresses)if(!this.memberships.has(address)){
   try{socket.addMembership(group,address);this.memberships.add(address);}catch{}
  }
  return [...this.memberships];
 }

 private async announce(socket:Socket){
  if(this.socket!==socket||this.announcing===socket)return;
  this.announcing=socket;
  try{
   this.expire();
   const addresses=this.interfaces(socket),identity=syncPeer(this.self());
   let sent=false;
   for(const address of addresses){
    if(this.socket!==socket)return;
    try{
     socket.setMulticastInterface(address);
     const bytes=Buffer.from(JSON.stringify({protocol:'clipper-lan/1',device:{...identity,host:address}}));
     // The multicast interface belongs to the socket. Finish this send before
     // selecting another interface, including when Node queues the datagram.
     await new Promise<void>((resolve,reject)=>socket.send(bytes,port,group,error=>error?reject(error):resolve()));
     sent=true;
    }catch{}
   }
   if(this.socket===socket)this.availability(sent);
  }catch{if(this.socket===socket)this.availability(false);}
  finally{if(this.announcing===socket)this.announcing=undefined;}
 }

 stop(){
  clearInterval(this.timer);clearTimeout(this.notifyTimer);clearTimeout(this.replyTimer);
  this.timer=this.notifyTimer=this.replyTimer=undefined;
  const socket=this.socket;this.socket=undefined;this.announcing=undefined;
  this.memberships.clear();this.found.clear();this.unavailable=false;
  if(socket)try{socket.close();}catch{}
 }
}
