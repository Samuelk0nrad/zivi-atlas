import {withReviewLinks} from '@/lib/review-links';
import {env} from 'cloudflare:workers';
import {collectionContext,collectionErrorResponse} from '@/lib/server/collection-access';
import {CollectionError} from '@/lib/server/collections';
import {uploadAttachment} from '@/lib/server/draft-attachments';
import {getDraft} from '@/lib/server/drafts';
import {MAX_ATTACHMENT_BYTES} from '@/lib/attachment-contract';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 const{db,owner}=collectionContext(request),url=new URL(request.url),origin=request.headers.get('origin');
 if(request.headers.get('sec-fetch-site')==='cross-site'||(origin&&origin!==url.origin))throw new CollectionError('Diese Anfrage ist nicht erlaubt.',403);
 if(request.headers.get('content-type')!=='application/octet-stream')throw new CollectionError('Datei erwartet.',415);
 let filename:string;try{filename=decodeURIComponent(request.headers.get('x-file-name')||'');}catch{throw new CollectionError('Ungültiger Dateiname.');}
 if(Number(request.headers.get('content-length'))>MAX_ATTACHMENT_BYTES)throw new CollectionError('Maximal 5 MB pro Datei.',413);
 const reader=request.body?.getReader();if(!reader)throw new CollectionError('Datei erwartet.');const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_ATTACHMENT_BYTES){await reader.cancel();throw new CollectionError('Maximal 5 MB pro Datei.',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const draftId=url.searchParams.get('draftId');await uploadAttachment(db,env.BUCKET,owner,{draftId,expectedRevision:Number(url.searchParams.get('revision'))},filename,bytes.buffer);
 return Response.json(withReviewLinks(await getDraft(db,owner,{draftId}),request.url),{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return collectionErrorResponse(error);}}
