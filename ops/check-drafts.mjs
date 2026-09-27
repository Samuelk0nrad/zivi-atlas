import {connection} from './connection.mjs';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const {base,local,headers,browserHeaders}=connection({mutates:true});
const client=new Client({name:'zivildienst-draft-check',version:'1.0.0'});
let id;
const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw new Error(r.content[0]?.text||'Tool failed');return r.structuredContent;};
try{
  await client.connect(new StreamableHTTPClientTransport(new URL(base+'/api/mcp'),{requestInit:{headers}}));
  const{tools}=await client.listTools();assert.equal(tools.length,27);
  for(const name of['list_email_drafts','get_email_draft','create_email_draft','update_email_draft','delete_email_draft'])assert.ok(tools.some(t=>t.name===name));
  const before=await call('list_email_drafts');
  const search=await call('search_einrichtungen',{query:'70193',limit:1});assert.equal(typeof search.organisations[0].email,'string');
  const created=await call('create_email_draft',{organisationCode:70193,recipient:'draft-check@example.org',subject:'Disposable draft check '+Date.now(),body:'ä'.repeat(8000)});id=created.draft.id;
  assert.equal(created.draft.body.length,8000);assert.ok(created.draftUrl.endsWith('?draft='+id));
  if(local){const r=await fetch(base+'/api/drafts',{headers:browserHeaders});assert.equal(r.status,200);assert.ok((await r.json()).drafts.some(d=>d.id===id));}
  const update={draftId:id,expectedRevision:1,recipient:'draft-check@example.org',subject:'Edited draft check',body:'Grüße & + # ?\nSecond line 📨'};
  if(local){const r=await fetch(base+'/api/collection-tools',{method:'POST',headers:{...browserHeaders,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({tool:'update_email_draft',arguments:update})});assert.equal(r.status,200);assert.equal((await r.json()).draft.revision,2);}else await call('update_email_draft',update);
  const saved=await call('get_email_draft',{draftId:id});assert.equal(saved.draft.body,update.body);assert.equal(saved.draft.revision,2);
  assert.equal(new URL(saved.gmailUrl).searchParams.get('body'),update.body);assert.ok(saved.mailtoUrl.startsWith('mailto:draft-check@example.org?'));
  const stale=await client.callTool({name:'update_email_draft',arguments:update});assert.equal(stale.isError,true);
  await call('delete_email_draft',{draftId:id,expectedRevision:2});id=undefined;
  const after=await call('list_email_drafts');assert.deepEqual(after,before);
  console.log(JSON.stringify({draftsVerified:true,toolCount:tools.length,existingDraftsPreserved:before.total,emailSent:false}));
}finally{if(id){const current=await call('get_email_draft',{draftId:id});await call('delete_email_draft',{draftId:id,expectedRevision:current.draft.revision});}await client.close();}
