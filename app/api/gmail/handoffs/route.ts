import {collectionContext,assertSameOrigin,collectionErrorResponse,readSmallJson} from '@/lib/server/collection-access';
import {env} from 'cloudflare:workers';
import {cleanupAttachments} from '@/lib/server/draft-attachments';
import {listHandoffs,mutateHandoff} from '@/lib/server/gmail-handoffs';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const{db,owner}=collectionContext(request);const params=new URL(request.url).searchParams;if(params.get('owner')!==owner)return Response.json({error:'Atlas-Anmeldung geändert.'},{status:409});return Response.json(await listHandoffs(db,owner,params.get('account')||''),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return collectionErrorResponse(e);}}
export async function POST(request:Request){try{const{db,owner}=collectionContext(request);assertSameOrigin(request);const result=await mutateHandoff(db,owner,await readSmallJson(request,8000));await cleanupAttachments(db,env.BUCKET,owner);return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});}catch(e){return collectionErrorResponse(e);}}
