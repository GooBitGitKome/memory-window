function decode(value:string):Uint8Array<ArrayBuffer> { return new Uint8Array(Array.from(atob(value),char=>char.charCodeAt(0))); }
function encode(value:Uint8Array):string { return btoa(Array.from(value,byte=>String.fromCharCode(byte)).join('')); }
async function masterKey(base64:string) {
  const raw=decode(base64);if(raw.length!==32)throw new Error('invalid_master_key');
  return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
}
export async function encryptKey(plaintext:string,userId:string,base64Master:string,version:string) {
  const iv=crypto.getRandomValues(new Uint8Array(12));const aad=new TextEncoder().encode(`memory-window:${userId}:${version}`);
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await masterKey(base64Master),new TextEncoder().encode(plaintext));
  return {ciphertext:encode(new Uint8Array(ciphertext)),iv:encode(iv),key_version:version};
}
export async function decryptKey(record:{ciphertext:string;iv:string;key_version:string},userId:string,masters:Record<string,string>) {
  const master=masters[record.key_version];if(!master)throw new Error('unknown_key_version');
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(record.iv),additionalData:new TextEncoder().encode(`memory-window:${userId}:${record.key_version}`)},await masterKey(master),decode(record.ciphertext));
  return new TextDecoder().decode(bytes);
}
export async function hashToken(token:string) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function randomToken() { return Array.from(crypto.getRandomValues(new Uint8Array(24)),byte=>byte.toString(16).padStart(2,'0')).join(''); }
