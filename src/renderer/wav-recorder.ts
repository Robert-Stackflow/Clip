export class WavRecorder {
 readonly mimeType='audio/wav';state:'inactive'|'recording'|'paused'='inactive';ondataavailable:((event:{data:Blob})=>void)|null=null;onstop:(()=>void)|null=null;onerror:((event:unknown)=>void)|null=null;
 private source:MediaStreamAudioSourceNode;private node:AudioWorkletNode;
 constructor(private context:AudioContext,stream:MediaStream){this.source=context.createMediaStreamSource(stream);this.node=new AudioWorkletNode(context,'clipper-pcm');this.node.port.onmessage=event=>{if(event.data.end){this.source.disconnect();this.node.disconnect();this.state='inactive';this.onstop?.();}else if(event.data.pcm)this.ondataavailable?.({data:new Blob([event.data.pcm],{type:'audio/wav'})});};this.node.onprocessorerror=event=>this.onerror?.(event);this.source.connect(this.node);this.node.connect(context.destination);}
 start(_interval?:number){const data=new ArrayBuffer(44),view=new DataView(data),text=(at:number,s:string)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};text(0,'RIFF');text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,this.context.sampleRate,true);view.setUint32(28,this.context.sampleRate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,'data');this.ondataavailable?.({data:new Blob([data],{type:'audio/wav'})});this.state='recording';this.node.port.postMessage('start');}
 pause(){this.state='paused';this.node.port.postMessage('pause');}
 resume(){this.state='recording';this.node.port.postMessage('start');}
 stop(){if(this.state==='inactive')return;this.state='inactive';this.node.port.postMessage('stop');}
}
