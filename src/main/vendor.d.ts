// v13.0.3 ships these APIs, but its exports map omits the declaration path.
declare module 'better-sqlite3-multiple-ciphers' {
 class Database {constructor(file:string,options?:{readonly?:boolean;fileMustExist?:boolean});exec(sql:string):this;prepare(sql:string):{get(...args:any[]):any;all(...args:any[]):any[];iterate(...args:any[]):Iterable<any>;run(...args:any[]):unknown};key(key:Buffer):number;close():void;}
 export default Database;
}
