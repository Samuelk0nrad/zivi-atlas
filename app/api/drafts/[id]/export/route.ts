import {env} from 'cloudflare:workers';
import {collectionContext,collectionErrorResponse} from '@/lib/server/collection-access';
import {getDraft} from '@/lib/server/drafts';
import {readAttachment} from '@/lib/server/draft-attachments';
import {buildDraftMime} from '@/lib/server/draft-mime';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const{db,owner}=collectionContext(request),{draft}=await getDraft(db,owner,{draftId:(await params).id});
 const files=[];for(const attachment of draft.attachments){const{file,object}=await readAttachment(db,env.BUCKET,owner,attachment.id);files.push({filename:file.filename,contentType:file.contentType,bytes:new Uint8Array(await object.arrayBuffer())});}
 return new Response(buildDraftMime(draft,files),{headers:{'Content-Type':'message/rfc822','Content-Disposition':'attachment; filename="Zivildienst-Entwurf.eml"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(error){return collectionErrorResponse(error);}}
