import {t as tr} from '../shared/i18n';
import 'reflect-metadata';
import {X509CertificateGenerator,SubjectAlternativeNameExtension} from '@peculiar/x509';
import {webcrypto,randomBytes,randomUUID,X509Certificate,createPrivateKey,createPublicKey} from 'node:crypto';
export interface SyncIdentity {id:string;cert:string;key:string;fingerprint:string}
export async function createSyncIdentity(webHost?:string):Promise<SyncIdentity>{
 const id=randomUUID(),algorithm={name:'ECDSA',namedCurve:'P-256',hash:'SHA-256'},keys=await webcrypto.subtle.generateKey(algorithm,true,['sign','verify']);
 const certificate=await X509CertificateGenerator.createSelfSigned({name:'CN=Clipper '+id,serialNumber:randomBytes(16).toString('hex'),notBefore:new Date(Date.now()-86400000),notAfter:new Date(Date.now()+(webHost?86400000:10*365*86400000)),extensions:webHost?[new SubjectAlternativeNameExtension([{type:'ip',value:webHost}])]:[],signingAlgorithm:algorithm,keys:keys as CryptoKeyPair},webcrypto as unknown as Crypto);
 const cert=certificate.toString('pem'),key=createPrivateKey({key:Buffer.from(await webcrypto.subtle.exportKey('pkcs8',keys.privateKey)),format:'der',type:'pkcs8'}).export({format:'pem',type:'pkcs8'}).toString();return {id,cert,key,fingerprint:certificateFingerprint(cert)};
}
export function certificateFingerprint(cert:string|Buffer){return new X509Certificate(cert).fingerprint256.replaceAll(':','').toLowerCase();}
export function validateIdentity(identity:SyncIdentity){const cert=new X509Certificate(identity.cert);if(cert.fingerprint256.replaceAll(':','').toLowerCase()!==identity.fingerprint||!cert.publicKey.equals(createPublicKey(identity.key))||Date.parse(cert.validTo)<Date.now())throw new Error(tr('同步设备身份损坏或已过期，请关闭同步并保留资料'));}
