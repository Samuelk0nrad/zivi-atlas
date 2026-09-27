import {connection} from './connection.mjs';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const writeCheck=process.argv.includes('--write-check');
const {base,headers}=connection({mutates:writeCheck});
const client=new Client({name:'zivildienst-connection-check',version:'1.0.0'});
const transport=new StreamableHTTPClientTransport(new URL(base+'/api/mcp'),{requestInit:{headers}});
let createdId;
try{
  await client.connect(transport);
  const{tools}=await client.listTools();assert.ok(tools.some(tool=>tool.name==='mark_email_draft_sent'),'Sent-tracking tool must be discoverable');
  const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw new Error(r.content[0]?.text||'Tool failed');return r.structuredContent;};
  const before=await call('list_collections');assert.ok(Array.isArray(before.collections));
  if(writeCheck){
    const result=await call('create_collection',{name:'MCP connection check '+Date.now(),organisationCodes:[70193]});createdId=result.collectionId;
    await call('rename_collection',{collectionId:createdId,name:'MCP verified temporary collection'});
    await call('add_to_collection',{collectionId:createdId,organisationCodes:[70193,70193]});
    const saved=(await call('list_collections')).collections.find(c=>c.id===createdId);
    assert.equal(saved.items.length,1);assert.equal(saved.name,'MCP verified temporary collection');
    await call('remove_from_collection',{collectionId:createdId,organisationCodes:[70193]});
    assert.equal((await call('list_collections')).collections.find(c=>c.id===createdId).items.length,0);
    await call('delete_collection',{collectionId:createdId});createdId=undefined;
    assert.equal((await call('list_collections')).collections.length,before.collections.length);
    const invalid=await client.callTool({name:'create_collection',arguments:{name:' '}});assert.equal(invalid.isError,true);
  }
  console.log(JSON.stringify({connected:true,toolCount:tools.length,writeCheck,existingCollectionCount:before.collections.length}));
}finally{
  if(createdId)await client.callTool({name:'delete_collection',arguments:{collectionId:createdId}});
  await client.close();
}
