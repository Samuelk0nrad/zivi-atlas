import {CollectionError} from './collections';

export async function verifyMcpCredential(authorization:string|null,tokenHash:string|undefined,owner:string|undefined){
  if(!tokenHash||!owner)throw new CollectionError('ChatGPT-Verbindung ist noch nicht eingerichtet.',503);
  const token=authorization?.match(/^Bearer (zivi_[A-Za-z0-9_-]{43})$/)?.[1];
  if(!token)throw new CollectionError('Ungültige ChatGPT-Verbindung.',401);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const actual=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(actual!==tokenHash)throw new CollectionError('Ungültige ChatGPT-Verbindung.',401);
  return owner;
}
