import {withReviewLinks} from '@/lib/review-links';
import {collectionContext,assertSameOrigin,collectionErrorResponse,readSmallJson} from '@/lib/server/collection-access';
import {env} from 'cloudflare:workers';
import {runCollectionTool} from '@/lib/server/collection-actions';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
  const{db,owner}=collectionContext(request);assertSameOrigin(request);
  const input=await readSmallJson(request,512000);
  const result=await runCollectionTool(db,owner,input,env.BUCKET);
  return Response.json(withReviewLinks(result,request.url),{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return collectionErrorResponse(error);}}
