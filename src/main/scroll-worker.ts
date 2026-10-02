import {parentPort,workerData} from 'node:worker_threads';
import {matchFrames,framePNG} from './stitch';
try{parentPort!.postMessage(workerData.mode==='match'?matchFrames(workerData.previous,workerData.next):framePNG(workerData.frame));}catch(e){parentPort!.postMessage({error:(e as Error).message});}
