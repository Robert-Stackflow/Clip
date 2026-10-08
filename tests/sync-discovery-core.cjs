const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{randomUUID}=require('node:crypto');
const compiled=fs.readFileSync('work/test-sync-discovery.cjs','utf8');
const identity=()=>({id:randomUUID(),name:'Private discovery fixture',host:'10.1.0.1',port:48301,fingerprint:'1'.repeat(64)});
const plain=value=>JSON.parse(JSON.stringify(value));

function harness(addresses=['10.1.0.1','172.18.0.1']){
 let now=1000,interfaces=addresses.map(address=>({address,family:'IPv4',internal:false})),sequence=0;
 const timers=new Map(),sockets=[],changes=[],errors=[],self=identity(),failedJoins=new Set(),failedSends=new Set();
 class Socket extends EventEmitter{
  memberships=[];dropped=[];sent=[];pending=[];closed=false;automatic=true;
  bind(port,host,ready){this.bound={port,host};queueMicrotask(ready);}
  setMulticastTTL(value){this.ttl=value;}
  setMulticastLoopback(value){this.loopback=value;}
  addMembership(group,address){if(failedJoins.has(address))throw Error('Unavailable interface');this.memberships.push({group,address});}
  dropMembership(group,address){this.dropped.push({group,address});}
  setMulticastInterface(address){this.selected=address;}
  send(bytes,port,group,callback){const record={packet:JSON.parse(bytes.toString()),port,group,address:this.selected};this.sent.push(record);const complete=()=>{record.completedAddress=this.selected;callback(failedSends.has(record.address)?Error('Send failed'):undefined);};if(this.automatic)queueMicrotask(complete);else this.pending.push(complete);}
  close(){this.closed=true;}
  receive(peer,host=peer.host,extra={}){this.emit('message',Buffer.from(JSON.stringify({protocol:'clip-lan/1',device:peer,...extra})),{address:host});}
 }
 const schedule=(callback,delay,interval=false)=>{const token={id:++sequence,unref(){}};timers.set(token,{callback,at:now+delay,delay,interval});return token;};
 const context={module:{exports:{}},require:name=>name==='node:dgram'?{createSocket:()=>{const socket=new Socket();sockets.push(socket);return socket;}}:name==='node:os'?{networkInterfaces:()=>({fixture:interfaces})}:require(name),Buffer,Date:class extends Date{static now(){return now;}},setTimeout:(fn,delay)=>schedule(fn,delay),setInterval:(fn,delay)=>schedule(fn,delay,true),clearTimeout:token=>timers.delete(token),clearInterval:token=>timers.delete(token)};
 vm.runInNewContext(compiled,context,{filename:'production-sync-discovery.cjs'});
 const discovery=new context.module.exports.SyncDiscovery(()=>self,()=>changes.push(plain(discovery.list())),error=>errors.push(error));
 async function settle(){for(let i=0;i<24;i++)await Promise.resolve();}
 async function advance(ms){const end=now+ms;for(;;){const pending=[...timers].filter(([,value])=>value.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!pending)break;const [token,value]=pending;now=value.at;if(value.interval)value.at+=value.delay;else timers.delete(token);value.callback();await settle();}now=end;await settle();}
 return {discovery,self,sockets,changes,errors,failedJoins,failedSends,timers,settle,advance,addresses:rows=>interfaces=rows.map(row=>typeof row==='string'?{address:row,family:'IPv4',internal:false}:row),localAddresses:()=>plain(context.module.exports.localAddresses()),start:async()=>{discovery.start();await settle();return sockets[0];}};
}

test('discovery joins each unique private IPv4 interface and finishes one send before selecting another',async()=>{
 const h=harness(['10.1.0.1','172.18.0.1','10.1.0.1','198.18.0.1','8.8.8.8',{address:'127.0.0.1',family:'IPv4',internal:true},{address:'fe80::1',family:'IPv6',internal:false}]);
 try{
  assert.deepEqual(h.localAddresses(),['10.1.0.1','172.18.0.1']);h.discovery.start();const socket=h.sockets[0];socket.automatic=false;
  await h.settle();assert.equal(socket.sent.length,1);assert.equal(socket.pending.length,1);
  socket.pending.shift()();await h.settle();assert.equal(socket.sent.length,2);assert.equal(socket.pending.length,1);
  socket.pending.shift()();await h.settle();assert.equal(socket.pending.length,0);
  assert.deepEqual(socket.bound,{port:47382,host:'0.0.0.0'});assert.equal(socket.ttl,1);assert.equal(socket.loopback,true);
  assert.deepEqual(socket.memberships.map(value=>value.address),['10.1.0.1','172.18.0.1']);
  for(const sent of socket.sent){assert.equal(sent.address,sent.completedAddress);assert.equal(sent.packet.device.host,sent.address);assert.deepEqual(Object.keys(sent.packet.device).sort(),['fingerprint','host','id','name','port']);}
  h.discovery.start();assert.equal(h.sockets.length,1);assert.deepEqual(h.errors,[]);
 }finally{h.discovery.stop();}
});

test('a failed interface does not disable working interfaces and changed interfaces are reconciled on the next pulse',async()=>{
 const h=harness();h.failedJoins.add('172.18.0.1');
 try{const socket=await h.start();assert.deepEqual(socket.sent.map(value=>value.address),['10.1.0.1']);assert.deepEqual(h.errors,[]);
  h.failedJoins.clear();await h.advance(5000);assert(socket.memberships.some(value=>value.address==='172.18.0.1'));
  h.addresses(['172.18.0.1','192.168.4.1']);await h.advance(5000);assert.deepEqual(socket.dropped.map(value=>value.address),['10.1.0.1']);assert.deepEqual(socket.sent.slice(-2).map(value=>value.address),['172.18.0.1','192.168.4.1']);
  h.failedSends.add('172.18.0.1');h.failedSends.add('192.168.4.1');await h.advance(5000);assert.equal(h.errors.length,1);assert(h.errors[0]);await h.advance(5000);assert.equal(h.errors.length,1);
  h.failedSends.delete('192.168.4.1');await h.advance(5000);assert.deepEqual(h.errors.slice(1),['']);
 }finally{h.discovery.stop();}
});

test('repeated announcements retain a live endpoint without redundant UI refresh and select a live replacement after expiry',async()=>{
 const h=harness(),peer=identity();peer.id=randomUUID();peer.name='Nearby device';
 try{const socket=await h.start();socket.receive(peer,'10.1.0.2');socket.receive({...peer,host:'172.18.0.2'},'172.18.0.2');await h.advance(50);
  assert.equal(h.changes.length,1);assert.equal(h.discovery.list()[0].host,'10.1.0.2');
  for(let i=0;i<3;i++){await h.advance(5000);socket.receive(peer,'10.1.0.2');socket.receive(peer,'172.18.0.2');await h.advance(50);}
  assert.equal(h.changes.length,1,'Keepalive on another interface should not refresh the UI');
  socket.receive({...peer,name:'Renamed device'},'172.18.0.2');await h.advance(50);assert.equal(h.changes.length,2);assert.equal(h.discovery.list()[0].name,'Renamed device');
  for(let i=0;i<4;i++){await h.advance(5000);socket.receive({...peer,name:'Renamed device'},'172.18.0.2');await h.advance(50);}
  assert.equal(h.discovery.list()[0].host,'172.18.0.2');assert.equal(h.changes.length,3);
  await h.advance(20000);assert.deepEqual(plain(h.discovery.list()),[]);await h.advance(50);assert.equal(h.changes.length,4);
 }finally{h.discovery.stop();}
});

test('discovery ignores self, malformed, oversized and public-source packets, bounds peers and never trusts advertised hosts',async()=>{
 const h=harness();try{const socket=await h.start();socket.receive(h.self);socket.receive(identity(),'8.8.8.8');socket.receive(identity(),'198.18.0.1');socket.receive(identity(),'10.1.0.2',{protocol:'other'});socket.receive({...identity(),port:1});socket.receive({...identity(),fingerprint:'invalid'});socket.emit('message',Buffer.from('{invalid'),{address:'10.1.0.2'});socket.emit('message',Buffer.alloc(2049),{address:'10.1.0.2'});assert.deepEqual(plain(h.discovery.list()),[]);
  for(let i=0;i<70;i++)socket.receive({...identity(),host:'192.168.99.99'},'10.1.0.2');assert.equal(h.discovery.list().length,64);assert(h.discovery.list().every(peer=>peer.host==='10.1.0.2'));await h.advance(50);assert.equal(h.changes.length,1);
  await h.advance(200);assert.equal(socket.sent.length,4,'New peers share one response announcement');
 }finally{h.discovery.stop();}
});

test('each device retains at most eight endpoints and stale socket callbacks cannot change a restarted discovery',async()=>{
 const h=harness(),peer=identity();try{const socket=await h.start();for(let i=2;i<=30;i++)socket.receive(peer,'10.1.0.'+i);assert.equal(h.discovery.found.get(peer.id).endpoints.size,8);await h.advance(50);const before=h.changes.length;
  h.discovery.stop();assert(socket.closed);assert.equal(h.timers.size,0);socket.receive(identity(),'10.1.0.2');socket.emit('error',Error('Old socket'));await h.advance(250);assert.deepEqual(plain(h.discovery.list()),[]);assert.equal(h.changes.length,before);assert.deepEqual(h.errors,[]);
  h.discovery.start();await h.settle();assert.equal(h.sockets.length,2);assert(!h.sockets[1].closed);socket.receive(identity(),'10.1.0.2');assert.deepEqual(plain(h.discovery.list()),[]);
 }finally{h.discovery.stop();}
});
