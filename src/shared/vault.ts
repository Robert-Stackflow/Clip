export interface VaultState {encrypted:boolean;unlocked:boolean;hello:boolean;helloAvailable:boolean;idleMinutes:number;plaintextDirectory:string}
export interface UnlockAPI {state():Promise<{ready:boolean;hello:boolean;helloAvailable:boolean;error:string}>;unlock(value:string,mode:'password'|'recovery'|'hello',newPassword?:string):Promise<void>;recover():Promise<void>;quit():Promise<void>}
