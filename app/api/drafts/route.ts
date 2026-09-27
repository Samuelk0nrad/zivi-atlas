import {collectionContext,collectionErrorResponse} from '@/lib/server/collection-access';
import {listDrafts} from '@/lib/server/drafts';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const{db,owner}=collectionContext(request);const params=new URL(request.url).searchParams;const input={offset:Number(params.get('offset')||0),query:params.get('query')||'',...(params.has('organisationCode')?{organisationCode:Number(params.get('organisationCode'))}:{})};return Response.json(await listDrafts(db,owner,input),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return collectionErrorResponse(error);}}
