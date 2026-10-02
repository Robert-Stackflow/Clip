const {spawn,spawnSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs'),readline=require('node:readline'),{randomUUID}=require('node:crypto');
function compile(){const framework=path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319'),file=path.resolve('work/VirtualAttachmentFixture.exe');fs.mkdirSync('work',{recursive:true});const r=spawnSync(path.join(framework,'csc.exe'),['/nologo','/target:exe','/platform:x64','/main:VirtualAttachmentFixture','/out:'+file,'/reference:'+path.join(framework,'System.Web.Extensions.dll'),'/reference:'+path.join(framework,'System.Windows.Forms.dll'),path.resolve('src/native/AttachmentHost.cs'),path.resolve('tests/virtual-attachment-fixture.cs')],{windowsHide:true,encoding:'utf8'});if(r.status!==0)throw Error(r.stdout+r.stderr);return file;}
async function fixture(){
 const child=spawn(compile(),[],{windowsHide:true,stdio:'pipe'}),pending=new Map();let readyResolve,readyReject,reads=0;
 const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j}),deadline=setTimeout(()=>{child.kill();readyReject(Error('Fixture startup timed out'));},10000);
 child.stderr.resume();child.on('error',readyReject);const rl=readline.createInterface({input:child.stdout});
 rl.on('line',line=>{let value;try{value=JSON.parse(line);}catch{return;}if(value.ready)readyResolve();else if(value.reading)reads++;else{const request=pending.get(value.id);if(request){clearTimeout(request.timer);pending.delete(value.id);value.error?request.reject(Error(value.error)):request.resolve(value);}}});
 child.on('exit',()=>{readyReject(Error('Fixture exited'));for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Fixture exited'));}pending.clear();});
 try{await ready;}finally{clearTimeout(deadline);}
 return {child,get reads(){return reads;},request(value){const id=randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Fixture timed out'));},20000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,...value})+'\n');});},async close(){if(child.exitCode===null){try{await this.request({action:'quit'});}finally{child.kill();}}}};
}
module.exports={fixture};
