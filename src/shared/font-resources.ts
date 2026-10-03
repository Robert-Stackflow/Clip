type Host={
 later:(callback:()=>void,delay:number)=>number;cancelLater:(id:number)=>void;
 idle:(callback:()=>void)=>number;cancelIdle:(id:number)=>void;
 activity:(callback:()=>void)=>()=>void;
 canRelease:()=>boolean;fontBytes:()=>number;release:()=>void;
};
/** Reclaim a heavy font cache only after leaving its page and a quiet interval. */
export function fontResourceCleanup(host:Host){
 let timer:number|undefined,idle:number|undefined,removeActivity:(()=>void)|undefined;
 const cancelWork=()=>{if(timer!==undefined)host.cancelLater(timer);if(idle!==undefined)host.cancelIdle(idle);timer=idle=undefined;};
 const retain=()=>{cancelWork();removeActivity?.();removeActivity=undefined;};
 const eligible=()=>{try{return host.canRelease()&&host.fontBytes()>=8*1024*1024;}catch{return false;}};
 const wait=()=>{
  cancelWork();timer=host.later(()=>{
   timer=undefined;if(!eligible()){retain();return;}
   idle=host.idle(()=>{idle=undefined;try{if(eligible())host.release();}catch{/* A closing frame needs no further housekeeping. */}finally{retain();}});
  },2000);
 };
 const release=()=>{if(!removeActivity)removeActivity=host.activity(wait);wait();};
 return {retain,release};
}
