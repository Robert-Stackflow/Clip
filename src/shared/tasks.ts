export type TaskKind='image-upload'|'image-test'|'ai'|'script';
export type TaskStatus='queued'|'running'|'completed'|'failed'|'cancelled';
export interface TaskItem {
 id:string;kind:TaskKind;title:string;status:TaskStatus;phase:string;createdAt:number;updatedAt:number;
 recordId?:string;recordHash?:string;conversationId?:string;link?:string;reused?:boolean;copied?:boolean;error?:string;retryable?:boolean;
}
export interface TaskState {items:TaskItem[];active:number;failed:number}
export const taskActive=(item:TaskItem)=>item.status==='queued'||item.status==='running';
