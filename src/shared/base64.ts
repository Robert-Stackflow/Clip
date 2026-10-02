const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Exact canonical encoding check without allocating decoded bytes or a second string. */
export function canonicalBase64(value:unknown):value is string{
 if(typeof value!=='string'||value.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$(?![\s\S])/.test(value))return false;
 if(!value.endsWith('='))return true;
 const double=value.endsWith('=='),last=alphabet.indexOf(value[value.length-(double?3:2)]);
 return last>=0&&(last&(double?15:3))===0;
}
