import {env} from 'cloudflare:workers';
import {collectionContext,collectionErrorResponse} from '@/lib/server/collection-access';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
  const {owner}=collectionContext(request);
  const value=env.GOOGLE_GMAIL_CLIENT_ID?.trim();
  const clientId=value&&/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(value)?value:null;
  return Response.json({clientId,owner},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return collectionErrorResponse(error);}}
