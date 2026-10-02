export interface RecoveryChoice {token:string;name:string;kind:'database'|'backup';encrypted:boolean;requiresProtection?:boolean}
export interface RecoveryPreview extends RecoveryChoice {clips:number;snippets:number;categories:number;scripts:number;recoveryKey?:string}
export interface RecoveryAPI {
 checkpoints():Promise<import('./checkpoints').CheckpointEntry[]>;
 chooseCheckpoint(id:string):Promise<RecoveryChoice>;
 state():Promise<{error:string;directory:string}>;
 retry():Promise<void>;
 choose(kind:'database'|'backup'):Promise<RecoveryChoice|null>;
 preview(token:string,password?:string,newPassword?:string,mode?:'password'|'recovery'):Promise<RecoveryPreview>;
 commit(token:string,recoveryProof?:string):Promise<void>;
 cancel():Promise<void>;
 quit():Promise<void>;
}
