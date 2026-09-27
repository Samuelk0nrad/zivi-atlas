import {connection} from './connection.mjs';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const {base,local,headers,browserHeaders}=connection({mutates:true});
const client=new Client({name:'application-check',version:'1.0.0'});let id;
const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw new Error(r.content[0]?.text||'Tool failed');return r.structuredContent;};
try{
 await client.connect(new StreamableHTTPClientTransport(new URL(base+'/api/mcp'),{requestInit:{headers}}));
 const before=await call('list_applications');let page=before;
 for(let offset=0;;){
  assert.ok(!page.applications.some(a=>a.organisationCode===70193),'Keep any existing application untouched');
  offset+=page.applications.length;if(offset>=page.total)break;
  assert.ok(page.applications.length,'Application list changed during preflight');page=await call('list_applications',{offset,limit:100});
 }
 const r=await call('import_application_emails',{organisationCode:70193,sourceAccount:'check@example.org',messages:[{messageId:'abcdef1234567890',threadId:'abcdef1234567890',direction:'sent',occurredAt:'2026-09-01T10:00:00Z',from:'check@example.org',to:'fixture@example.org',subject:'Disposable local check',body:'Grüße\n<not HTML>',bodyTruncated:false}]});id=r.application.id;assert.equal(r.imported,1);assert.equal(r.application.effectiveStatus,'sent');
 const update={applicationId:id,expectedRevision:r.application.revision,status:'interview',notes:'Disposable check'};
 if(local){
  const response=await fetch(base+'/api/applications',{headers:browserHeaders});assert.equal(response.status,200);assert.ok((await response.json()).applications.some(a=>a.id===id));
  const edit=await fetch(base+'/api/collection-tools',{method:'POST',headers:{...browserHeaders,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({tool:'update_application',arguments:update})});assert.equal(edit.status,200);assert.equal((await edit.json()).application.effectiveStatus,'interview');
 }else assert.equal((await call('update_application',update)).application.effectiveStatus,'interview');
 const check=await call('get_application',{applicationId:id});assert.equal(check.emails[0].body,'Grüße\n<not HTML>');assert.equal(check.application.effectiveStatus,'interview');
 await call('delete_application',{applicationId:id,expectedRevision:check.application.revision});id=undefined;assert.deepEqual(await call('list_applications'),before);
 console.log(JSON.stringify({applicationsVerified:true,websiteAndMcpShareState:local,fixtureRemoved:true}));
}finally{if(id){const r=await call('get_application',{applicationId:id});await call('delete_application',{applicationId:id,expectedRevision:r.application.revision});}await client.close();}
