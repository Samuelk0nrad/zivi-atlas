import {withReviewLinks} from '@/lib/review-links';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {assertSameOrigin,collectionErrorResponse,readSmallJson} from '@/lib/server/collection-access';
import {runCollectionTool} from '@/lib/server/collection-actions';
import {createCollectionMcp} from '@/lib/server/collection-mcp';
import {env} from 'cloudflare:workers';
import {verifyMcpCredential} from '@/lib/server/mcp-access';
import {CollectionError} from '@/lib/server/collections';

export const dynamic='force-dynamic';

export async function POST(request:Request){
  try{
    const owner=await verifyMcpCredential(request.headers.get('authorization'),env.COLLECTIONS_MCP_TOKEN_SHA256,env.COLLECTIONS_MCP_OWNER_ID);
    const db=env.DB;if(!db)throw new CollectionError('Sammlungen sind gerade nicht erreichbar.',503);
    assertSameOrigin(request);
    const parsedBody=await readSmallJson(request,512000);
    const server=createCollectionMcp(async(tool,args)=>withReviewLinks(await runCollectionTool(db,owner,{tool,arguments:args},env.BUCKET),request.url));
    const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    try{
      await server.connect(transport);
      const response=await transport.handleRequest(request,{parsedBody});
      response.headers.set('Cache-Control','private, no-store');
      return response;
    }finally{await server.close();}
  }catch(error){return collectionErrorResponse(error);}
}

// The server is stateless and does not open an SSE channel or retain sessions.
export async function GET(request:Request){
  try{await verifyMcpCredential(request.headers.get('authorization'),env.COLLECTIONS_MCP_TOKEN_SHA256,env.COLLECTIONS_MCP_OWNER_ID);return new Response(null,{status:405,headers:{Allow:'POST','Cache-Control':'private, no-store'}});}
  catch(error){return collectionErrorResponse(error);}
}
