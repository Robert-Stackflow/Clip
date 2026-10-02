export interface ProgramVersionEntry {id:string;version:string;installedTo:string;createdAt:number;bytes:number;checkpointId:string;profileId:string;reason:'update'|'rollback'}
export interface ProgramRollbackChoice {token:string;version:string;encrypted:boolean;requiresProtection:boolean}
export interface ProgramRollbackPreview extends ProgramRollbackChoice {clips:number;snippets:number;categories:number;scripts:number;schema:number;recoveryKey?:string}
