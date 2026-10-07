export interface RecordingBounds {x:number;y:number;width:number;height:number}
export function recordingBounds(value:unknown):RecordingBounds|null {
 if(value===null)return null;
 if(!value||typeof value!=='object')throw new Error('Invalid recording bounds');
 const bounds=value as RecordingBounds;
 for(const key of ['x','y','width','height'] as const)if(!Number.isFinite(bounds[key])||bounds[key]<0||bounds[key]>32768)throw new Error('Invalid recording bounds');
 if(bounds.width<1||bounds.height<1)throw new Error('Invalid recording bounds');
 return {x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height};
}
