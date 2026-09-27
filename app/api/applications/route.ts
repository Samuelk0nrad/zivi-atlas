import {collectionContext,collectionErrorResponse} from '@/lib/server/collection-access';
import {listApplications} from '@/lib/server/applications';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const{db,owner}=collectionContext(request);const offset=Number(new URL(request.url).searchParams.get('offset')||0);return Response.json(await listApplications(db,owner,{offset}),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return collectionErrorResponse(error);}}
