import {collectionContext,assertSameOrigin,collectionErrorResponse,readSmallJson} from '@/lib/server/collection-access';
import {listCollections,mutateCollection,CollectionError} from '@/lib/server/collections';
import {getCatalog} from '@/lib/server/catalog';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const{db,owner}=collectionContext(request);return Response.json({collections:await listCollections(db,owner)},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return collectionErrorResponse(error);}}
export async function POST(request:Request){try{const{db,owner}=collectionContext(request);assertSameOrigin(request);const input=await readSmallJson(request);return Response.json(await mutateCollection(db,owner,input,getCatalog),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return collectionErrorResponse(error);}}
