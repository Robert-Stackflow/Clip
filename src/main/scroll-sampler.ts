import type {Frame} from './stitch';
/** Two stationary samples are required before a changed screen is appended.
 * Retain only tiny samples, never another full desktop frame between polls. */
export class ScrollSampler {
 private candidate?:Uint8Array;private accepted?:Uint8Array;
 reset(frame?:Frame){this.candidate=undefined;this.accepted=frame?sample(frame):undefined;}
 observe(frame:Frame){const next=sample(frame);if(equal(this.accepted,next)){this.candidate=undefined;return false;}if(equal(this.candidate,next)){this.candidate=undefined;return true;}this.candidate=next;return false;}
 accept(frame:Frame){this.reset(frame);}
}
function sample(frame:Frame){const rows=Math.min(64,frame.height),columns=Math.min(48,frame.width),data=new Uint8Array(rows*columns*3);let offset=0;for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){const y=Math.floor((row+.5)*frame.height/rows),x=Math.floor((col+.5)*frame.width/columns),i=(y*frame.width+x)*4;data[offset++]=frame.data[i];data[offset++]=frame.data[i+1];data[offset++]=frame.data[i+2];}return data;}
function equal(a:Uint8Array|undefined,b:Uint8Array){if(!a||a.length!==b.length)return false;let delta=0;for(let i=0;i<a.length;i++)delta+=Math.abs(a[i]-b[i]);return delta/a.length<.35;}
