import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './d1-test-helper.mjs';
import {listDrafts,getDraft,mutateDraft} from '../lib/server/drafts.ts';
import {draftLinks} from '../lib/draft-contract.ts';
const catalog=async()=>({content:[{code:70193,title:'Einrichtung Österreich',email:'office@example.org'}]});
const create=(db,owner='alice',extra={})=>mutateDraft(db,owner,{action:'create_email_draft',organisationCode:70193,body:'Guten Tag,\nGrüße & danke! + # ? 📨',...extra},catalog);
test('drafts prefill official contacts, persist editable content and provide encoded review/composer links',async()=>{
  const{db}=database();const result=await create(db);const d=result.draft;
  assert.equal(d.recipient,'office@example.org');assert.equal(d.revision,1);assert.equal(d.organisationTitle,'Einrichtung Österreich');assert.ok(result.draftUrl.endsWith('?draft='+d.id));
  const gmail=new URL(result.gmailUrl);assert.equal(gmail.searchParams.get('body'),d.body);assert.equal(gmail.searchParams.get('to'),d.recipient);assert.equal(gmail.searchParams.get('su'),d.subject);assert.equal(gmail.searchParams.get('view'),'cm');
  assert.ok(result.mailtoUrl.startsWith('mailto:office@example.org?'));
  const mail=new URL(result.mailtoUrl);assert.equal(mail.searchParams.get('body'),d.body.replace(/\n/g,'\r\n'));assert.equal(mail.searchParams.has('bcc'),false);
  const list=await listDrafts(db,'alice');assert.equal(list.total,1);assert.equal(list.drafts[0].body,undefined);assert.equal((await getDraft(db,'alice',{draftId:d.id})).draft.body,d.body);
});
test('known draft IDs never allow access or writes across owners',async()=>{
  const{db}=database(),{draft}=await create(db);
  assert.equal((await listDrafts(db,'bob')).total,0);
  await assert.rejects(getDraft(db,'bob',{draftId:draft.id}),e=>e.status===404);
  for(const action of[{action:'update_email_draft',recipient:'other@example.org',subject:'Changed',body:'Secret'},{action:'delete_email_draft'}])await assert.rejects(mutateDraft(db,'bob',{...action,draftId:draft.id,expectedRevision:1},catalog),e=>e.status===404);
  assert.equal((await getDraft(db,'alice',{draftId:draft.id})).draft.body,draft.body);
});
test('concurrent edits and stale deletes cannot overwrite a newer revision',async()=>{
  const{db}=database(),{draft}=await create(db);
  const update={action:'update_email_draft',draftId:draft.id,expectedRevision:1,recipient:draft.recipient,subject:'Updated',body:'Browser edit'};
  const results=await Promise.allSettled([mutateDraft(db,'alice',update,catalog),mutateDraft(db,'alice',{...update,body:'Chat edit'},catalog)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
  await assert.rejects(mutateDraft(db,'alice',{action:'delete_email_draft',draftId:draft.id,expectedRevision:1},catalog),e=>e.status===409);
  const current=(await getDraft(db,'alice',{draftId:draft.id})).draft;assert.equal(current.revision,2);
  await mutateDraft(db,'alice',{action:'delete_email_draft',draftId:draft.id,expectedRevision:2},catalog);assert.equal((await listDrafts(db,'alice')).total,0);
});
test('invalid recipients, header injection, unknown codes and owner injection do not save drafts',async()=>{
  const{db}=database();
  for(const extra of[{recipient:'invalid'},{recipient:'office@example.org\r\nBcc: stranger@example.org'},{subject:'Hi\nBcc: stranger@example.org'},{organisationCode:1},{ownerId:'bob'},{body:'x'.repeat(8001)}])await assert.rejects(create(db,'alice',extra),e=>e.status===400);
  assert.equal((await listDrafts(db,'alice')).total,0);
  const unsafe=await mutateDraft(db,'alice',{action:'create_email_draft',organisationCode:1},async()=>({content:[{code:1,title:'One',email:'invalid source address'}]}));assert.equal(unsafe.draft.recipient,'');
  const links=draftLinks({recipient:'office+zivi@example.org',subject:'Anfrage &bcc=bad@example.org',body:'Text\r\nNext\rLast\nEnd'});
  assert.doesNotThrow(()=>draftLinks({recipient:'',subject:'',body:'\ud800'}));
  assert.equal(new URL(links.gmailUrl).searchParams.has('bcc'),false);assert.equal(new URL(links.mailtoUrl).searchParams.get('body'),'Text\r\nNext\r\nLast\r\nEnd');
});
test('saved drafts remain editable after catalog removal; manual drafts and filtered pagination work',async()=>{
  const{db}=database(),{draft}=await create(db);
  const saved=await mutateDraft(db,'alice',{action:'update_email_draft',draftId:draft.id,expectedRevision:1,recipient:'new@example.org',subject:'My subject',body:'My message'},async()=>{throw new Error('Catalog must not be loaded');});
  assert.equal(saved.draft.organisationCode,70193);assert.equal(saved.draft.recipient,'new@example.org');
  const manual=await mutateDraft(db,'alice',{action:'create_email_draft',recipient:'manual@example.org',subject:'Manual'},catalog);assert.equal(manual.draft.organisationCode,null);
  assert.equal((await listDrafts(db,'alice',{organisationCode:70193})).total,1);
  const first=await listDrafts(db,'alice',{limit:1}),second=await listDrafts(db,'alice',{limit:1,offset:1});assert.equal(first.total,2);assert.notEqual(first.drafts[0].id,second.drafts[0].id);
});
test('institution search returns matching drafts and counts without leaking other owners or institutions',async()=>{
  const{db}=database();
  const first=await create(db,'alice',{subject:'Ärztliches Zentrum – Bewerbung'});
  const second=await create(db,'alice',{subject:'Ärztliches Zentrum – Nachfrage'});
  await create(db,'bob',{subject:'Ärztliches Zentrum – Privat'});
  await mutateDraft(db,'alice',{action:'create_email_draft',subject:'Ärztliches Zentrum – Andere Stelle'},catalog);
  const input={organisationCode:70193,query:'ärztliches',limit:1};
  const page1=await listDrafts(db,'alice',input),page2=await listDrafts(db,'alice',{...input,offset:1});
  assert.equal(page1.total,2);assert.equal(page2.total,2);
  assert.deepEqual(new Set([page1.drafts[0].id,page2.drafts[0].id]),new Set([first.draft.id,second.draft.id]));
  assert.equal((await listDrafts(db,'alice',{query:'ärztliches'})).total,3);
  assert.equal((await listDrafts(db,'alice',{query:'österreich'})).total,2);
  assert.equal((await listDrafts(db,'alice',{query:'OFFICE@EXAMPLE.ORG'})).total,2);
  assert.equal((await listDrafts(db,'alice',{query:'%'})).total,0);
});
