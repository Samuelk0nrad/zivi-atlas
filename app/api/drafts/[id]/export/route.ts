import {env} from 'cloudflare:workers';
import {collectionContext,collectionErrorResponse} from '@/lib/server/collection-access';
import {exportDraftMime} from '@/lib/server/draft-export';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const{db,owner}=collectionContext(request),query=new URL(request.url).searchParams;
 const{mime,revision}=await exportDraftMime(db,env.BUCKET,owner,{draftId:(await params).id,...(query.has('revision')?{expectedRevision:Number(query.get('revision'))}:{})});
 return new Response(mime,{headers:{'Content-Type':'message/rfc822','Content-Disposition':'attachment; filename="Zivildienst-Entwurf.eml"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Draft-Revision':String(revision)}});
}catch(error){return collectionErrorResponse(error);}}
