class ClipperPCM extends AudioWorkletProcessor {
 constructor(){super();this.active=false;this.frames=0;this.buffer=new Int16Array(4096*2);this.port.onmessage=event=>{const value=event.data;if(value==='start')this.active=true;if(value==='pause')this.active=false;if(value==='stop'){this.active=false;this.flush();this.port.postMessage({end:true});}};}
 flush(){if(!this.frames)return;const bytes=this.buffer.slice(0,this.frames*2);this.port.postMessage({pcm:bytes.buffer},[bytes.buffer]);this.frames=0;}
 process(inputs,outputs){for(const output of outputs)for(const channel of output)channel.fill(0);const channels=inputs[0];if(!this.active||!channels?.length)return true;for(let i=0;i<channels[0].length;i++){for(let c=0;c<2;c++){const value=Math.max(-1,Math.min(1,(channels[c]||channels[0])[i]||0));this.buffer[this.frames*2+c]=Math.round(value*(value<0?32768:32767));}if(++this.frames===4096)this.flush();}return true;}
}
registerProcessor('clipper-pcm',ClipperPCM);
