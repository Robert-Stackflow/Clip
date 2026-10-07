import {randomUUID} from 'node:crypto';
import {t as tr} from '../shared/i18n';
import {taskActive,type TaskItem,type TaskState} from '../shared/tasks';
import type {Store} from './store';

type TaskDescription=Pick<TaskItem,'kind'|'title'|'recordId'|'recordHash'|'conversationId'|'retryable'>;
export interface TaskContext {signal:AbortSignal;phase(message:string):void;result(value:Pick<TaskItem,'link'|'reused'|'copied'>):void}
type Job={item:TaskItem;controller:AbortController;execute:(context:TaskContext)=>Promise<unknown>;resolve:(value:any)=>void;reject:(error:unknown)=>void};

/** Persistent receipts, bounded concurrency and cancellation live outside renderer lifetimes. */
export class TaskCenter {
 private items:TaskItem[]=[];private queue:Job[]=[];private jobs=new Map<string,Job>();private running=0;private stopped=false;
 constructor(private store:Store,private changed:(value:TaskState)=>void){
  const saved=store.meta('task-center',[]) as TaskItem[];
  this.items=Array.isArray(saved)?saved.filter(item=>item&&typeof item.id==='string'&&typeof item.title==='string'&&['image-upload','image-test','ai','script'].includes(item.kind)).slice(0,100):[];
  for(const item of this.items)if(taskActive(item)){item.status='cancelled';item.phase=tr('上次运行已中断');item.updatedAt=Date.now();}
  this.persist();
 }
 state():TaskState{return {items:this.items.map(item=>({...item})),active:this.items.filter(taskActive).length,failed:this.items.filter(item=>item.status==='failed').length};}
 private persist(){this.store.setMeta('task-center',this.items);this.changed(this.state());}
 start<T>(description:TaskDescription,execute:(context:TaskContext)=>Promise<T>,queued=false){
  if(this.stopped)throw new Error(tr('任务中心已停止'));
  if(this.items.filter(taskActive).length>=30)throw new Error(tr('任务过多，请稍后重试'));
  const item:TaskItem={...description,id:randomUUID(),status:queued?'queued':'running',phase:queued?tr('等待处理'):tr('正在处理'),createdAt:Date.now(),updatedAt:Date.now()};
  this.items.unshift(item);this.items=this.items.filter((entry,index)=>index<100||taskActive(entry));
  let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  const job:Job={item,controller:new AbortController(),execute,resolve,reject};this.jobs.set(item.id,job);this.persist();
  if(queued){this.queue.push(job);this.pump();}else void this.execute(job,false);
  return {id:item.id,promise};
 }
 private pump(){while(!this.stopped&&this.running<2&&this.queue.length){const job=this.queue.shift()!;if(this.jobs.has(job.item.id)){this.running++;void this.execute(job,true);}}}
 private async execute(job:Job,queued:boolean){
  const {item,controller}=job;item.status='running';this.persist();
  const update=(values:Partial<TaskItem>)=>{if(this.stopped||controller.signal.aborted||!this.jobs.has(item.id))return;Object.assign(item,values,{updatedAt:Date.now()});this.persist();};
  try{const value=await job.execute({signal:controller.signal,phase:phase=>update({phase}),result:result=>update(result)});controller.signal.throwIfAborted();update({status:'completed',phase:item.copied?tr('链接已复制'):item.link?tr('已完成，链接可复制'):tr('已完成')});job.resolve(value);}
  catch(error){if(!this.stopped){item.status=controller.signal.aborted?'cancelled':'failed';item.phase=controller.signal.aborted?tr('已取消'):tr('处理失败');item.error=controller.signal.aborted?undefined:(error instanceof Error?error.message:String(error)).slice(0,500);item.updatedAt=Date.now();this.persist();}job.reject(error);}
  finally{this.jobs.delete(item.id);if(queued)this.running--;this.pump();}
 }
 get(id:string){const item=this.items.find(item=>item.id===id);if(!item)throw new Error(tr('任务已不存在'));return {...item};}
 cancel(id:string){const job=this.jobs.get(id);if(!job)return;job.controller.abort(new Error(tr('任务已取消')));if(job.item.status==='queued'){this.queue=this.queue.filter(item=>item!==job);this.jobs.delete(id);job.item.status='cancelled';job.item.phase=tr('已取消');job.item.updatedAt=Date.now();job.reject(new Error(tr('任务已取消')));this.persist();}}
 clear(){this.items=this.items.filter(taskActive);this.persist();}
 cancelAll(){for(const id of this.jobs.keys())this.cancel(id);}
 stop(){if(this.stopped)return;this.cancelAll();for(const item of this.items)if(taskActive(item)){item.status='cancelled';item.phase=tr('已取消');item.updatedAt=Date.now();}this.persist();this.stopped=true;}
}
