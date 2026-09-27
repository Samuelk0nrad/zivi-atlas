import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createCollectionMcp} from '../lib/server/collection-mcp.ts';
import {CollectionError} from '../lib/server/collections.ts';
import {verifyMcpCredential} from '../lib/server/mcp-access.ts';
import {createHash,randomBytes} from 'node:crypto';

test('MCP credential is required and always resolves to its configured owner',async()=>{
  const token='zivi_'+randomBytes(32).toString('base64url');const hash=createHash('sha256').update(token).digest('hex');
  assert.equal(await verifyMcpCredential('Bearer '+token,hash,'alice'),'alice');
  for(const value of[null,'Bearer invalid','Bearer zivi_'+randomBytes(32).toString('base64url')])await assert.rejects(verifyMcpCredential(value,hash,'alice'),e=>e.status===401);
  await assert.rejects(verifyMcpCredential('Bearer '+token,undefined,'alice'),e=>e.status===503);
  await assert.rejects(verifyMcpCredential('Bearer '+token,hash,undefined),e=>e.status===503);
});

test('MCP discovery describes all collection actions and validates arguments before execution',async()=>{
  const calls=[];
  const server=createCollectionMcp(async(tool,args)=>{calls.push({tool,args});if(tool==='delete_collection')throw new CollectionError('Sammlung nicht gefunden.',404);return{collections:[],...args};});
  const client=new Client({name:'collection-contract-check',version:'1.0.0'});
  const[clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);await client.connect(clientTransport);
  try{
    const{tools}=await client.listTools();assert.equal(tools.length,27);
    assert.equal(tools.find(t=>t.name==='create_email_draft').annotations.idempotentHint,false);
    assert.equal(tools.find(t=>t.name==='get_email_draft').annotations.readOnlyHint,true);
    assert.equal(tools.find(t=>t.name==='delete_email_draft').annotations.destructiveHint,true);
    assert.equal(tools.find(t=>t.name==='list_labels').annotations.readOnlyHint,true);
    assert.equal(tools.find(t=>t.name==='create_label').annotations.idempotentHint,false);
    assert.equal(tools.find(t=>t.name==='remove_label').annotations.destructiveHint,true);
    assert.equal(tools.find(t=>t.name==='list_collections').annotations.readOnlyHint,true);
    assert.equal(tools.find(t=>t.name==='delete_collection').annotations.destructiveHint,true);
    assert.equal(tools.find(t=>t.name==='create_collection').annotations.idempotentHint,false);
    const created=await client.callTool({name:'create_collection',arguments:{name:'  Favoriten  ',organisationCodes:[70193,70193]}});
    assert.equal(created.isError,undefined);assert.equal(created.structuredContent.name,'Favoriten');assert.deepEqual(calls[0].args.organisationCodes,[70193]);
    for(const args of[{name:' '},{name:'A',owner:'another-account'},{name:'A',organisationCodes:Array(101).fill(70193)}]){
      const invalid=await client.callTool({name:'create_collection',arguments:args});assert.equal(invalid.isError,true);
    }
    assert.equal(calls.length,1,'invalid MCP arguments must not reach storage');
    const label=await client.callTool({name:'create_label',arguments:{name:'  Bewerben  ',organisationCodes:[70193,70193]}});
    assert.equal(label.structuredContent.color,'blue');assert.equal(calls[1].args.name,'Bewerben');assert.deepEqual(calls[1].args.organisationCodes,[70193]);
    for(const args of[{name:' '},{name:'A',owner:'bob'},{name:'A',color:'invalid'}])assert.equal((await client.callTool({name:'create_label',arguments:args})).isError,true);
    assert.equal(calls.length,2,'invalid label arguments must not reach storage');
    for(const args of[{draftId:'00000000-0000-4000-8000-000000000000',recipient:'a@example.org',subject:'x',body:'x'},{ownerId:'bob'}])assert.equal((await client.callTool({name:'update_email_draft',arguments:args})).isError,true);
    assert.equal(calls.length,2,'draft updates must require a revision before storage');
    const missing=await client.callTool({name:'delete_collection',arguments:{collectionId:'00000000-0000-4000-8000-000000000000'}});
    assert.equal(missing.isError,true);assert.match(missing.content[0].text,/nicht gefunden/);
  }finally{await client.close();await server.close();}
});
