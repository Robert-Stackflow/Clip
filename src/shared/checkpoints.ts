export interface CheckpointEntry {id:string;createdAt:number;sourceVersion:string;targetVersion:string;reason:'upgrade'|'manual'|'update';schema:number;encrypted:boolean;bytes:number;clips:number;snippets:number;compatible:boolean}
export interface CheckpointManifest extends Omit<CheckpointEntry,'compatible'> {format:'clip-history-checkpoint';version:1;profileId:string;files:Record<string,{bytes:number;sha256:string}>}
export const CHECKPOINT_SCHEMA=7;
export const checkpointID=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
