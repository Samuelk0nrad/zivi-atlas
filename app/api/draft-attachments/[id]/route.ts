import {env} from 'cloudflare:workers';
import {collectionContext,collectionErrorResponse} from '@/lib/server/collection-access';
import {readAttachment} from '@/lib/server/draft-attachments';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const{db,owner}=collectionContext(request),{file,object}=await readAttachment(db,env.BUCKET,owner,(await params).id);
 return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(file.size),'Content-Disposition':`attachment; filename="attachment.${file.filename.split('.').at(-1)?.toLowerCase()}"; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});
}catch(error){return collectionErrorResponse(error);}}
