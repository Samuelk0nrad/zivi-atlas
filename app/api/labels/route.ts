import {collectionContext,assertSameOrigin,collectionErrorResponse,readSmallJson} from '@/lib/server/collection-access';
import {listLabels,mutateLabel} from '@/lib/server/labels';
import {getCatalog} from '@/lib/server/catalog';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const{db,owner}=collectionContext(request);return Response.json({labels:await listLabels(db,owner)},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return collectionErrorResponse(error);}}
export async function POST(request:Request){try{const{db,owner}=collectionContext(request);assertSameOrigin(request);return Response.json(await mutateLabel(db,owner,await readSmallJson(request),getCatalog),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return collectionErrorResponse(error);}}
