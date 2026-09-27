import {env} from 'cloudflare:workers';
import {CollectionError} from './collections';
export function collectionContext(request:Request){
  const owner=request.headers.get('oai-authenticated-user-id');
  if(!owner)throw new CollectionError('Bitte mit ChatGPT anmelden.',401);
  if(!env.DB)throw new CollectionError('Sammlungen sind gerade nicht erreichbar.',503);
  return{owner,db:env.DB};
}
export function assertSameOrigin(request:Request){
  const origin=request.headers.get('origin');
  if(request.headers.get('sec-fetch-site')==='cross-site'||(origin&&origin!==new URL(request.url).origin))throw new CollectionError('Diese Anfrage ist nicht erlaubt.',403);
  if(!request.headers.get('content-type')?.includes('application/json'))throw new CollectionError('JSON erwartet.',415);
}
export function collectionErrorResponse(error:unknown){
  return Response.json({error:error instanceof CollectionError?error.message:'Sammlungen konnten nicht gespeichert werden. Bitte erneut versuchen.'},{status:error instanceof CollectionError?error.status:500,headers:{'Cache-Control':'private, no-store'}});
}

export async function readSmallJson(request:Request,limit=16000):Promise<unknown>{
  const length=Number(request.headers.get('content-length'));
  if(length>limit)throw new CollectionError('Anfrage zu groß.',413);
  const reader=request.body?.getReader();if(!reader)throw new CollectionError('JSON erwartet.');
  const decoder=new TextDecoder();let bytes=0,text='';
  try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>limit){await reader.cancel();throw new CollectionError('Anfrage zu groß.',413);}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
  try{return JSON.parse(text);}catch{throw new CollectionError('Ungültiges JSON.');}
}
