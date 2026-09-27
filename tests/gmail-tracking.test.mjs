import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './d1-test-helper.mjs';
import {getDraft,listDrafts,mutateDraft} from '../lib/server/drafts.ts';
import {prepareHandoff,completeHandoff,markDraftSent,listHandoffs,mutateHandoff} from '../lib/server/gmail-handoffs.ts';
import {getApplication,listApplications,mutateApplication} from '../lib/server/applications.ts';
import {uploadAttachment,readAttachment,mutateAttachment} from '../lib/server/draft-attachments.ts';
import {sentEvidence,HANDOFF_HEADER,messageMarker} from '../lib/gmail-tracking.ts';
import {syncGmailSent} from '../lib/gmail.ts';
const catalog=async()=>({content:[{code:123,title:'Test Einrichtung',email:'office@example.org'}]});
async function fixture(){
 const {db,sql}=database(),files=new Map();
 const bucket={async put(key,bytes){files.set(key,bytes.slice(0));},async get(key){const b=files.get(key);return b?{arrayBuffer:async()=>b.slice(0)}:null;},async delete(key){files.delete(key);}};
 const {draft}=await mutateDraft(db,'alice',{action:'create_email_draft',organisationCode:123,subject:'Test',body:'Original text'},catalog);
 await uploadAttachment(db,bucket,'alice',{draftId:draft.id,expectedRevision:1},'cv.pdf',new Uint8Array([1,2,3,4]).buffer);
 return{db,sql,bucket,files,draft:(await getDraft(db,'alice',{draftId:draft.id})).draft};
}
test('confirmed copy leaves active list, preserves text/files and populates the application archive',async()=>{
 const {db,bucket,draft}=await fixture();const handoff=await prepareHandoff(db,'alice',draft.id,draft.revision,'alice@example.org');
 assert.equal((await listDrafts(db,'alice')).total,1);
 const sent=await completeHandoff(db,'alice',handoff.id,new Date().toISOString(),'abcd1234');
 assert.equal((await listDrafts(db,'alice')).total,0);assert.equal((await listDrafts(db,'alice',{state:'sent'})).total,1);
 assert.equal(sent.draft.body,'Original text');assert.deepEqual(new Uint8Array(await (await readAttachment(db,bucket,'alice',sent.draft.attachments[0].id)).object.arrayBuffer()),new Uint8Array([1,2,3,4]));
 const app=(await listApplications(db,'alice')).applications[0];assert.equal(app.effectiveStatus,'sent');
 assert.equal((await getApplication(db,'alice',{applicationId:app.id})).sentDrafts[0].id,sent.draft.id);
 await completeHandoff(db,'alice',handoff.id,new Date().toISOString(),'abcd1234');assert.equal((await listApplications(db,'alice')).applications[0].revision,app.revision);
 await assert.rejects(mutateDraft(db,'alice',{action:'update_email_draft',draftId:sent.draft.id,expectedRevision:sent.draft.revision,recipient:'office@example.org',subject:'overwrite',body:'overwrite'},catalog),e=>e.status===409);
});
test('old Gmail copy preserves newer local edits and snapshots survive removal of original attachments',async()=>{
 const {db,bucket,draft,files}=await fixture(),h=await prepareHandoff(db,'alice',draft.id,draft.revision,'alice@example.org');
 await mutateAttachment(db,bucket,'alice',{action:'remove_draft_attachment',attachmentId:draft.attachments[0].id,draftId:draft.id,expectedRevision:draft.revision});
 assert.equal(files.size,1,'snapshot still needs the blob');
 const updated=await mutateDraft(db,'alice',{action:'update_email_draft',draftId:draft.id,expectedRevision:3,recipient:draft.recipient,subject:'New version',body:'New text'},catalog);
 const sent=await completeHandoff(db,'alice',h.id,new Date().toISOString());
 assert.equal((await getDraft(db,'alice',{draftId:draft.id})).draft.body,'New text');assert.equal((await listDrafts(db,'alice')).total,1);
 assert.equal(sent.draft.body,'Original text');assert.equal(sent.draft.attachments.length,1);assert.equal(updated.draft.revision,4);
 const next=await prepareHandoff(db,'alice',draft.id,4,'alice@example.org');await mutateDraft(db,'alice',{action:'delete_email_draft',draftId:sent.draft.id,expectedRevision:sent.draft.revision},catalog,bucket);assert.equal((await listHandoffs(db,'alice','alice@example.org')).handoffs[0].id,next.id);
});
test('manual confirmation is concurrent-safe and stale/foreign calls cannot archive content',async()=>{
 const {db,draft}=await fixture();
 await assert.rejects(markDraftSent(db,'bob',draft.id,2),e=>e.status===404);
 await assert.rejects(markDraftSent(db,'alice',draft.id,1),e=>e.status===409);
 await Promise.all([markDraftSent(db,'alice',draft.id,2),markDraftSent(db,'alice',draft.id,2)]);
 assert.equal((await listDrafts(db,'alice',{state:'sent'})).total,1);
 assert.equal((await listDrafts(db,'bob',{state:'sent'})).total,0);
});
test('handoffs and confirmation remain scoped to owner/account/recipient',async()=>{
 const {db,draft}=await fixture(),h=await prepareHandoff(db,'alice',draft.id,2,'alice@example.org');
 assert.equal((await listHandoffs(db,'alice','bob@example.org')).handoffs.length,0);
 assert.equal((await listHandoffs(db,'bob','alice@example.org')).handoffs.length,0);
 await assert.rejects(completeHandoff(db,'bob',h.id,new Date().toISOString()),e=>e.status===404);
 const action={action:'confirm',id:h.id,owner:'alice',account:'bob@example.org',evidence:{marker:h.id,messageId:'abcd1234',threadId:'abcd5678',occurredAt:new Date().toISOString(),recipient:draft.recipient}};
 await assert.rejects(mutateHandoff(db,'alice',action),e=>e.status===409);
 await assert.rejects(mutateHandoff(db,'alice',{...action,account:'alice@example.org',evidence:{...action.evidence,recipient:'someone@example.org'}}),e=>e.status===409);
 assert.equal((await listDrafts(db,'alice')).total,1);
});
test('explicit deletion removes hidden duplicates and pending snapshots without losing shared live files',async()=>{
 const {db,bucket,draft,files,sql}=await fixture();await prepareHandoff(db,'alice',draft.id,2,'alice@example.org');
 await mutateDraft(db,'alice',{action:'delete_email_draft',draftId:draft.id,expectedRevision:2},catalog,bucket);
 assert.equal(files.size,0);assert.equal(sql.prepare('SELECT count(*) n FROM email_drafts').get().n,0);
 const f=await fixture();await prepareHandoff(f.db,'alice',f.draft.id,2,'alice@example.org');await prepareHandoff(f.db,'alice',f.draft.id,2,'alice@example.org');const sent=await markDraftSent(f.db,'alice',f.draft.id,2);
 await mutateDraft(f.db,'alice',{action:'delete_email_draft',draftId:sent.draft.id,expectedRevision:sent.draft.revision},catalog,f.bucket);
 assert.equal(f.files.size,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM email_drafts').get().n,0);
});
test('latest sent event drives automatic status but preserves an explicit advanced application status',async()=>{
 const {db,draft}=await fixture();const app=await mutateApplication(db,'alice',{action:'import_application_emails',organisationCode:123,sourceAccount:'alice@example.org',messages:[{messageId:'abcd1234',threadId:'abcd1234',direction:'received',occurredAt:'2020-01-01T00:00:00Z',from:'office@example.org',to:'alice@example.org',cc:'',subject:'Old reply',body:'Old reply',bodyTruncated:false,gmailLabels:['INBOX']}]},catalog);
 await markDraftSent(db,'alice',draft.id,2);let current=(await getApplication(db,'alice',{applicationId:app.application.id})).application;assert.equal(current.effectiveStatus,'sent');
 await mutateApplication(db,'alice',{action:'update_application',applicationId:current.id,expectedRevision:current.revision,status:'accepted',notes:'Keep'},catalog);
 const next=await mutateDraft(db,'alice',{action:'create_email_draft',organisationCode:123},catalog);await markDraftSent(db,'alice',next.draft.id,1);
 current=(await getApplication(db,'alice',{applicationId:app.application.id})).application;assert.equal(current.effectiveStatus,'accepted');assert.equal(current.notes,'Keep');
});
const handoff={id:'d1cbac7c-1af2-4f9a-801e-81817056fd87',draftId:'source',revision:1,snapshotId:'copy',account:'alice@example.org',gmailDraftId:'gmail-draft',threadId:'abcd5678',recipient:'office@example.org',createdAt:new Date(Date.now()-1000).toISOString()};
function message(headers=[{name:HANDOFF_HEADER,value:handoff.id},{name:'To',value:handoff.recipient}]){return{id:'abcd1234',threadId:'abcd5678',internalDate:String(Date.now()),labelIds:['SENT'],payload:{headers}};}
test('only exact sent markers and real recipient addresses count; missing/edited/discarded evidence stays unknown',()=>{
 assert.ok(sentEvidence(message(),handoff));assert.ok(sentEvidence(message([{name:'Message-ID',value:messageMarker(handoff.id)},{name:'To',value:'"Example, Office" <office@example.org>'}]),handoff));
 for(const m of [{...message(),labelIds:['DRAFT']},{...message(),labelIds:['SENT','DRAFT']},message([{name:'To',value:handoff.recipient}]),message([{name:HANDOFF_HEADER,value:'other'},{name:'To',value:handoff.recipient}]),message([{name:HANDOFF_HEADER,value:handoff.id},{name:'To',value:'"office@example.org" <someone-else@example.net>'}]),message([{name:HANDOFF_HEADER,value:handoff.id},{name:'To',value:'other@example.net (alias, office@example.org, previous address)'}]),{...message(),internalDate:'0'}])assert.equal(sentEvidence(m,handoff),null);
});
test('automatic check treats 404 as unknown and confirms a matched SENT message once without sending mail',async()=>{
 for(const matched of [false,true]){
  let confirmations=0;const calls=[];
  const request=async(url,options={})=>{calls.push(url);if(url.startsWith('/api/gmail/handoffs?'))return Response.json({handoffs:[handoff]});
   if(url==='/api/gmail/handoffs'){assert.equal(JSON.parse(options.body).action,'confirm');assert.equal(options.headers.Authorization,undefined);confirmations++;return Response.json({});}
   assert.equal(options.method,undefined);assert.equal(options.credentials,'omit');
   if(url.includes('/drafts/'))return new Response('',{status:404});
   if(url.includes('/threads/'))return Response.json({messages:matched?[message()]:[message([{name:'To',value:handoff.recipient}])]});
   return Response.json({messages:[]});};
  const result=await syncGmailSent({owner:'alice',email:handoff.account,accessToken:'synthetic',metadata:true},request);
  assert.equal(result.confirmed,matched?1:0);assert.equal(confirmations,matched?1:0);
  assert.ok(!calls.some(url=>url.includes('/send')));
 }
});
