import {spawnSync} from 'node:child_process';
import {connection} from './connection.mjs';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const {base,headers,browserHeaders:cookie}=connection({mutates:true,localOnly:true});
const client=new Client({name:'attachment-check',version:'1.0.0'}),ids=[];
const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw new Error(r.content[0]?.text||'Tool failed');return r.structuredContent;};
try{
 await client.connect(new StreamableHTTPClientTransport(new URL(base+'/api/mcp'),{requestInit:{headers}}));
 const before=await call('list_email_drafts');const a=await call('create_email_draft',{recipient:'check@example.org',subject:'Disposable attachment check',body:'Grüße\nTest'});ids.push(a.draft.id);
 const bytes=Buffer.from('%PDF-1.4\nCV fixture\n%%EOF\n'),filename='Lebenslauf – Österreich (2026).pdf';
 const upload=await fetch(`${base}/api/draft-attachments?draftId=${a.draft.id}&revision=1`,{method:'POST',headers:{...cookie,Origin:base,'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(filename)},body:bytes});assert.equal(upload.status,200,await upload.clone().text());const attached=await upload.json();assert.equal(attached.draft.revision,2);assert.equal(attached.draft.attachments.length,1);const file=attached.draft.attachments[0];
 const download=await fetch(base+file.downloadUrl,{headers:cookie});assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);assert.match(download.headers.get('content-disposition'),/attachment/);assert.equal(download.headers.get('cache-control'),'private, no-store');
 const exportResponse=await fetch(`${base}/api/drafts/${a.draft.id}/export`,{headers:cookie});assert.equal(exportResponse.status,200);const eml=await exportResponse.text();const parsed=spawnSync('python3',['-c',"import sys,json,base64;from email import policy;from email.parser import BytesParser;m=BytesParser(policy=policy.default).parsebytes(sys.stdin.buffer.read());p=list(m.iter_attachments())[0];print(json.dumps({'filename':p.get_filename(),'data':base64.b64encode(p.get_payload(decode=True)).decode()}))"],{input:eml,encoding:'utf8'});assert.equal(parsed.status,0,parsed.stderr);assert.deepEqual(JSON.parse(parsed.stdout),{filename,data:bytes.toString('base64')});
 const b=await call('create_email_draft',{subject:'Disposable attachment copy check'});ids.push(b.draft.id);const copied=await call('copy_draft_attachment',{attachmentId:file.id,draftId:b.draft.id,expectedRevision:1});assert.equal(copied.draft.attachments.length,1);
 const removed=await call('remove_draft_attachment',{attachmentId:file.id,draftId:a.draft.id,expectedRevision:2});assert.equal(removed.draft.revision,3);assert.equal(removed.draft.attachments.length,0);assert.equal((await fetch(base+file.downloadUrl,{headers:cookie})).status,404);
 const again=await client.callTool({name:'remove_draft_attachment',arguments:{attachmentId:file.id,draftId:a.draft.id,expectedRevision:3}});assert.equal(again.isError,true);assert.equal((await call('get_email_draft',{draftId:a.draft.id})).draft.revision,3);
 for(const id of ids){const current=await call('get_email_draft',{draftId:id});await call('delete_email_draft',{draftId:id,expectedRevision:current.draft.revision});}ids.length=0;assert.deepEqual(await call('list_email_drafts'),before);
 console.log(JSON.stringify({uploadDownloadVerified:true,mimeBytesVerified:true,chatgptReuseVerified:true,removalRevisionVerified:true,fixturesRemoved:true}));
}finally{for(const id of ids){const current=await call('get_email_draft',{draftId:id});await call('delete_email_draft',{draftId:id,expectedRevision:current.draft.revision});}await client.close();}
