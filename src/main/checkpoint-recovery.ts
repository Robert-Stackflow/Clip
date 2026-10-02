import {t as tr} from '../shared/i18n';
import {RecoveryManager} from './recovery';
import {StorageManager} from './storage';
import {CHECKPOINT_SCHEMA} from '../shared/checkpoints';
import type {Payload} from '../shared/types';
/** Integrity is checked again at each step; callers pass only IDs, never an archive path. */
export class CheckpointRecovery {
 private recovery:RecoveryManager;
 private chosen?:{id:string;owner?:string};
 private generation=0;
 constructor(private storage:StorageManager,thumbnail?:(p:Payload)=>string|undefined){this.recovery=new RecoveryManager(storage,thumbnail);}
 cancel(){this.generation++;this.chosen=undefined;this.recovery.cancel();}
 async choose(id:unknown,currentProfile=true){
  this.cancel();const generation=this.generation,owner=currentProfile?this.storage.profileId:undefined;
  const point=await this.storage.checkpoints.verify(id,owner);if(point.value.schema>CHECKPOINT_SCHEMA)throw new Error(tr('恢复点由更新版本创建，请使用匹配版本打开'));
  if(generation!==this.generation)throw new Error(tr('恢复预览已过期，请重新选择'));
  const choice=await this.recovery.choose('database',point.directory);
  try{await this.storage.checkpoints.verify(point.value.id,owner);if(generation!==this.generation)throw new Error(tr('恢复预览已过期，请重新选择'));this.chosen={id:point.value.id,owner};return choice;}catch(e){this.recovery.cancel();throw e;}
 }
 private async verify(){const point=this.chosen;if(!point)throw new Error(tr('恢复预览已过期，请重新选择'));try{await this.storage.checkpoints.verify(point.id,point.owner);if(point!==this.chosen)throw new Error(tr('恢复预览已过期，请重新选择'));}catch(e){this.cancel();throw e;}}
 async preview(token:string,password?:string,newPassword?:string,mode?:'password'|'recovery'){await this.verify();return this.recovery.preview(token,password,newPassword,mode);}
 async commit(token:string,proof?:string){await this.verify();const old=this.storage.store,next=await this.recovery.commit(token,proof);this.chosen=undefined;if(old&&old!==next)try{old.close();}catch{console.warn(tr('原数据库关闭时发生错误，当前数据目录已切换'));}return next;}
}
