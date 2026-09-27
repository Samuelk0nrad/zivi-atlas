import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './d1-test-helper.mjs';
import {mutateApplication,getApplication,listApplications} from '../lib/server/applications.ts';
const catalog=async()=>({content:[{code:1,title:'Einrichtung Eins',email:'office@example.org'},{code:2,title:'Einrichtung Zwei',email:'other@example.org'}]});
const message=(extra={})=>({messageId:'1234567890abcdef',threadId:'1234567890abcdef',direction:'sent',occurredAt:'2026-08-08T12:00:00Z',from:'Alice <alice@example.org>',to:'office@example.org',subject:'Bewerbung',body:'Grüße\n<not HTML>',bodyTruncated:false,...extra});
const run=(db,input,owner='alice')=>mutateApplication(db,owner,input,catalog);
const imp=(db,messages=[message()],extra={})=>run(db,{action:'import_application_emails',organisationCode:1,sourceAccount:'alice@example.org',messages,...extra});
test('imports append exact message snapshots, deduplicate without revisions, and derive status chronologically',async()=>{
 const{db}=database();let r=await imp(db);assert.equal(r.imported,1);assert.equal(r.application.effectiveStatus,'sent');assert.equal(r.emails[0].body,'Grüße\n<not HTML>');const revision=r.application.revision;
 r=await imp(db,[message({body:'Truncated retry'})]);assert.equal(r.imported,0);assert.equal(r.duplicates,1);assert.equal(r.application.revision,revision);assert.equal(r.emails[0].body,'Grüße\n<not HTML>');
 r=await imp(db,[message({messageId:'2234567890abcdef',direction:'received',from:'Office <office@example.org>',to:'alice@example.org',occurredAt:'2026-09-22T07:30:00Z',body:'Antwort'})]);assert.equal(r.application.effectiveStatus,'replied');
 r=await imp(db,[message({messageId:'3234567890abcdef',occurredAt:'2026-07-01T23:00:00+02:00'})]);assert.equal(r.application.effectiveStatus,'replied');assert.equal(r.emails.at(-1).occurredAt,'2026-07-01T21:00:00.000Z');
 const list=await listApplications(db,'alice');assert.equal(list.total,1);assert.equal(list.applications[0].messageCount,3);assert.equal(list.applications[0].body,undefined);
 const page=await getApplication(db,'alice',{applicationId:r.application.id,limit:1,offset:1});assert.equal(page.emailTotal,3);assert.equal(page.emails.length,1);assert.equal(page.offset,1);
});
test('manual status survives imports; stale revisions and other owners cannot edit or read',async()=>{
 const{db}=database();let r=await imp(db);const a=r.application;
 const update={action:'update_application',applicationId:a.id,expectedRevision:a.revision,status:'rejected',notes:'Absage am 17.8.'};r=await run(db,update);assert.equal(r.application.effectiveStatus,'rejected');
 await assert.rejects(run(db,update),e=>e.status===409);
 await assert.rejects(getApplication(db,'bob',{applicationId:a.id}),e=>e.status===404);assert.equal((await listApplications(db,'bob')).total,0);
 await assert.rejects(run(db,{...update,expectedRevision:r.application.revision},'bob'),e=>e.status===404);
 r=await imp(db,[message({messageId:'4234567890abcdef',occurredAt:'2026-10-01T12:00:00Z'})]);assert.equal(r.application.effectiveStatus,'rejected');assert.equal(r.application.notes,update.notes);
 await assert.rejects(run(db,{action:'delete_application',applicationId:a.id,expectedRevision:a.revision}),e=>e.status===409);
 await run(db,{action:'delete_application',applicationId:a.id,expectedRevision:r.application.revision});assert.equal((await listApplications(db,'alice')).total,0);
});
test('imports reject cross-institution associations and unsent drafts, allow verified Send-As',async()=>{
 const{db,sql}=database();await imp(db);await assert.rejects(imp(db,[message()],{organisationCode:2}),e=>e.status===409);
 await assert.rejects(imp(db,[message({messageId:'5234567890abcdef',gmailLabels:['DRAFT']})]));
 const alias=await imp(db,[message({messageId:'6234567890abcdef',from:'Alias <alias@example.org>',gmailLabels:['SENT']})]);assert.equal(alias.imported,1);
 const other=await run(db,{action:'track_application',organisationCode:2});
 // Database-level guard also rejects a conflicting assignment after a concurrent importer wins.
 assert.throws(()=>sql.prepare('INSERT INTO application_emails SELECT ?,?,owner_id,source_account,message_id,thread_id,direction,occurred_at,sender,recipients,cc,subject,body,body_truncated,imported_at FROM application_emails LIMIT 1').run('conflicting-row',other.application.id),/email_application_conflict/);
});
test('same-millisecond retry remains a no-op and batches roll back on a raced assignment',async()=>{
 const{db,sql}=database();const r=await imp(db),a=r.application;
 const RealDate=globalThis.Date;const now=a.lastImportAt;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}};
 try{const duplicate=await imp(db);assert.equal(duplicate.application.revision,a.revision);assert.equal(duplicate.imported,0);}finally{globalThis.Date=RealDate;}
 const parent=await run(db,{action:'track_application',organisationCode:2});const batch=db.batch.bind(db);let injected=false;
 db.batch=async statements=>{if(!injected){injected=true;sql.prepare('INSERT INTO application_emails SELECT ?,?,owner_id,source_account,?,thread_id,direction,occurred_at,sender,recipients,cc,subject,body,body_truncated,imported_at FROM application_emails LIMIT 1').run('race-winner',a.id,'7234567890abcdef');}return batch(statements);};
 await assert.rejects(imp(db,[message({messageId:'8234567890abcdef'}),message({messageId:'7234567890abcdef'})],{organisationCode:2}),e=>e.status===409);
 assert.equal((await getApplication(db,'alice',{applicationId:parent.application.id})).emailTotal,0);
});

test('receipt acknowledgments can be waiting independently of received status, and summaries expose the decision',async()=>{
 const {db}=database();let r=await imp(db);assert.equal(r.application.effectiveNextAction,'waiting');
 r=await imp(db,[message({messageId:'a234567890abcdef',direction:'received',from:'office@example.org',to:'alice@example.org',occurredAt:'2026-09-22T07:30:00Z',body:'Wir haben Ihre Bewerbung erhalten. Bitte warten Sie auf unsere Rückmeldung.'})]);
 assert.equal(r.application.effectiveNextAction,'needs_review','receiving is not proof of a requested action');
 const a=r.application;r=await run(db,{action:'update_application',applicationId:a.id,expectedRevision:a.revision,status:a.status,notes:'Eingang bestätigt',nextAction:'waiting'});
 assert.equal(r.application.effectiveStatus,'replied');assert.equal(r.application.effectiveNextAction,'waiting');assert.equal(r.application.automaticNextAction,'needs_review');
 assert.equal((await listApplications(db,'alice')).applications[0].effectiveNextAction,'waiting');
 assert.equal((await getApplication(db,'alice',{applicationId:a.id})).application.notes,'Eingang bestätigt');
});
test('new incoming mail reopens review; duplicates, older imports and outgoing mail preserve an explicit decision',async()=>{
 const {db}=database();const receipt=message({messageId:'a234567890abcdef',direction:'received',from:'office@example.org',to:'alice@example.org',occurredAt:'2026-09-22T07:30:00Z'});
 let r=await imp(db,[receipt]);let a=r.application;
 r=await run(db,{action:'update_application',applicationId:a.id,expectedRevision:a.revision,status:'interview',notes:'Termin steht',nextAction:'done'});a=r.application;
 r=await imp(db,[receipt]);assert.equal(r.application.nextAction,'done');assert.equal(r.application.revision,a.revision);
 r=await imp(db,[{...receipt,messageId:'b234567890abcdef',occurredAt:'2026-07-01T11:00:00Z'}]);assert.equal(r.application.nextAction,'done');
 r=await imp(db,[message({messageId:'c234567890abcdef',occurredAt:'2026-09-23T11:00:00Z'})]);assert.equal(r.application.nextAction,'done');
 r=await imp(db,[{...receipt,messageId:'d234567890abcdef',occurredAt:'2026-09-24T11:00:00Z',body:'Bitte schicken Sie Ihren Lebenslauf.'}]);
 assert.equal(r.application.nextAction,'automatic');assert.equal(r.application.effectiveNextAction,'needs_review');assert.equal(r.application.status,'interview');assert.equal(r.application.notes,'Termin steht');
 a=r.application;r=await run(db,{action:'update_application',applicationId:a.id,expectedRevision:a.revision,status:a.status,notes:a.notes,nextAction:'action_required'});
 assert.equal(r.application.effectiveNextAction,'action_required');
 // An outgoing message must not silently resolve an explicitly tracked task.
 r=await imp(db,[message({messageId:'e234567890abcdef',occurredAt:'2026-09-25T11:00:00Z'})]);assert.equal(r.application.effectiveNextAction,'action_required');
});
test('action edits enforce owner/revision checks, and older clients preserve the existing action',async()=>{
 const {db}=database();let r=await imp(db);let a=r.application;
 const update={action:'update_application',applicationId:a.id,expectedRevision:a.revision,status:a.status,notes:'Unterlagen senden',nextAction:'action_required'};
 await assert.rejects(run(db,update,'bob'),e=>e.status===404);
 r=await run(db,update);await assert.rejects(run(db,update),e=>e.status===409);a=r.application;
 await assert.rejects(run(db,{...update,expectedRevision:a.revision,nextAction:'guessed'}));
 r=await run(db,{action:'update_application',applicationId:a.id,expectedRevision:a.revision,status:a.status,notes:'Notiz geändert'});
 assert.equal(r.application.nextAction,'action_required');assert.equal(r.application.notes,'Notiz geändert');
});
test('a different incoming message at the same timestamp requires review while historical batches do not',async()=>{
 const {db}=database();const receipt=message({messageId:'a234567890abcdef',direction:'received',from:'office@example.org',to:'alice@example.org',occurredAt:'2026-09-22T07:30:00Z'});
 let r=await imp(db,[receipt]);let a=r.application;
 r=await run(db,{action:'update_application',applicationId:a.id,expectedRevision:a.revision,status:a.status,notes:'',nextAction:'waiting'});
 r=await imp(db,[{...receipt,messageId:'b234567890abcdef',occurredAt:'2026-07-01T00:00:00Z'},{...receipt,messageId:'c234567890abcdef',occurredAt:'2026-07-02T00:00:00Z'}]);assert.equal(r.application.nextAction,'waiting');
 r=await imp(db,[{...receipt,messageId:'d234567890abcdef'}]);assert.equal(r.application.effectiveNextAction,'needs_review');
});
test('a mixed batch does not reopen a decision for a reply followed by a newer outgoing message',async()=>{
 const {db}=database();let r=await imp(db);const a=r.application;
 await run(db,{action:'update_application',applicationId:a.id,expectedRevision:a.revision,status:a.status,notes:'Abgeschlossen',nextAction:'done'});
 r=await imp(db,[message({messageId:'f234567890abcdef',direction:'received',from:'office@example.org',to:'alice@example.org',occurredAt:'2026-09-24T11:00:00Z'}),message({messageId:'e234567890abcdef',occurredAt:'2026-09-25T11:00:00Z'})]);
 assert.equal(r.application.nextAction,'done');assert.equal(r.application.effectiveNextAction,'done');
});
