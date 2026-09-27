import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {database} from './d1-test-helper.mjs';
import {mutateDraft,getDraft} from '../lib/server/drafts.ts';
import {listAttachments,uploadAttachment,readAttachment,mutateAttachment,cleanupAttachments} from '../lib/server/draft-attachments.ts';
import {buildDraftMime} from '../lib/server/draft-mime.ts';
const catalog=async()=>({content:[]});
const create=(db,owner='alice')=>mutateDraft(db,owner,{action:'create_email_draft',recipient:'office@example.org',subject:'Bewerbung Österreich',body:'Grüße\nMein Lebenslauf.'},catalog);
function bucket(){const files=new Map();return{files,async put(key,bytes){files.set(key,bytes.slice(0));},async get(key){const b=files.get(key);return b?{arrayBuffer:async()=>b.slice(0)}:null;},async delete(key){files.delete(key);}};}
const bytes=()=>new TextEncoder().encode('%PDF-1.7\nCV Test\n%%EOF').buffer;
const upload=(db,r2,draft,extra={})=>uploadAttachment(db,r2,'alice',{draftId:draft.id,expectedRevision:draft.revision},'Lebenslauf.pdf',bytes(),extra);
test('uploaded attachments persist, enforce ownership and revision checks, and copy actual bytes',async()=>{
 const{db}=database(),r2=bucket(),{draft}=await create(db);const u=await upload(db,r2,draft);let a=(await getDraft(db,'alice',{draftId:draft.id})).draft;
 assert.equal(a.revision,2);assert.equal(a.attachments.length,1);assert.equal(a.attachments[0].filename,'Lebenslauf.pdf');assert.equal((await listAttachments(db,'bob')).total,0);
 await assert.rejects(readAttachment(db,r2,'bob',u.attachmentId),e=>e.status===404);
 await assert.rejects(uploadAttachment(db,r2,'bob',{draftId:draft.id,expectedRevision:2},'file.pdf',bytes()),e=>e.status===404);
 await assert.rejects(upload(db,r2,draft),e=>e.status===409);assert.equal(r2.files.size,1);
 const {draft:target}=await create(db);const copy=await mutateAttachment(db,r2,'alice',{action:'copy_draft_attachment',attachmentId:u.attachmentId,draftId:target.id,expectedRevision:1});assert.equal(r2.files.size,2);
 assert.deepEqual(await(await readAttachment(db,r2,'alice',copy.attachmentId)).object.arrayBuffer(),bytes());
 await mutateDraft(db,'alice',{action:'delete_email_draft',draftId:draft.id,expectedRevision:a.revision},catalog,r2);assert.equal(r2.files.size,1);assert.equal((await getDraft(db,'alice',{draftId:target.id})).draft.attachments.length,1);
});
test('removal defers cleanup safely and a rejected retry cannot increment any revision',async()=>{
 const{db}=database(),r2=bucket(),{draft}=await create(db);const u=await upload(db,r2,draft);await mutateAttachment(db,undefined,'alice',{action:'remove_draft_attachment',attachmentId:u.attachmentId,draftId:draft.id,expectedRevision:2});
 const current=(await getDraft(db,'alice',{draftId:draft.id})).draft;assert.equal(current.revision,3);assert.equal(current.attachments.length,0);assert.equal(r2.files.size,1);
 await assert.rejects(mutateAttachment(db,undefined,'alice',{action:'remove_draft_attachment',attachmentId:u.attachmentId,draftId:draft.id,expectedRevision:3}));assert.equal((await getDraft(db,'alice',{draftId:draft.id})).draft.revision,3);
 const{draft:other}=await create(db);await assert.rejects(mutateAttachment(db,undefined,'alice',{action:'remove_draft_attachment',attachmentId:u.attachmentId,draftId:other.id,expectedRevision:1}));assert.equal((await getDraft(db,'alice',{draftId:other.id})).draft.revision,1);
 await cleanupAttachments(db,r2,'alice');assert.equal(r2.files.size,0);
});
test('failed uploads and limits do not leave visible attachments or orphan blobs',async()=>{
 const{db}=database(),r2=bucket(),{draft}=await create(db);
 for(const name of['evil\r\nContent-Type: html.pdf','../CV.pdf','file.html'])await assert.rejects(uploadAttachment(db,r2,'alice',{draftId:draft.id,expectedRevision:1},name,bytes()));
 await assert.rejects(uploadAttachment(db,r2,'alice',{draftId:draft.id,expectedRevision:1},'CV.pdf',new ArrayBuffer(5*1024*1024+1)),e=>e.status===413);assert.equal(r2.files.size,0);
 let current=draft;for(let i=0;i<5;i++){await upload(db,r2,current);current=(await getDraft(db,'alice',{draftId:draft.id})).draft;}
 await assert.rejects(upload(db,r2,current),e=>e.status===409);assert.equal(r2.files.size,5);assert.equal((await getDraft(db,'alice',{draftId:draft.id})).draft.revision,6);
 const{draft:another}=await create(db);await assert.rejects(uploadAttachment(db,{...r2,put(){throw new Error('offline');}},'alice',{draftId:another.id,expectedRevision:1},'CV.pdf',bytes()),e=>e.status===503);assert.equal((await getDraft(db,'alice',{draftId:another.id})).draft.attachments.length,0);
});
test('MIME export round trips unicode headers, common filenames and exact binary bytes in an independent parser',()=>{
 const filenames=['Lebenslauf – Österreich (2026)*.pdf',"CV's final version.docx",'ä'.repeat(80)+'.pdf'];const data=new Uint8Array(Array.from({length:512},(_,i)=>i%256));
 const mime=buildDraftMime({recipient:'office@example.org',subject:'Bewerbung – '+ 'Österreich '.repeat(15),body:'Guten Tag,\nGrüße!'},filenames.map(filename=>({filename,contentType:'application/pdf',bytes:data})));
 const py=spawnSync('python3',['-c',`import sys,json,hashlib\nfrom email import policy\nfrom email.parser import BytesParser\nm=BytesParser(policy=policy.default).parsebytes(sys.stdin.buffer.read())\nprint(json.dumps({'subject':str(m['Subject']),'body':m.get_body().get_content(),'unsent':m['X-Unsent'],'files':[{'filename':p.get_filename(),'sha256':hashlib.sha256(p.get_payload(decode=True)).hexdigest(),'defects':[str(d) for d in p.defects]} for p in m.iter_attachments()]}))`],{input:mime,encoding:'utf8'});assert.equal(py.status,0,py.stderr);const parsed=JSON.parse(py.stdout);
 assert.equal(parsed.unsent,'1');assert.equal(parsed.subject,'Bewerbung – '+'Österreich '.repeat(15));assert.equal(parsed.body,'Guten Tag,\r\nGrüße!');assert.deepEqual(parsed.files.map(f=>f.filename),filenames);for(const f of parsed.files){assert.equal(f.sha256,createHash('sha256').update(data).digest('hex'));assert.deepEqual(f.defects,[]);}assert.ok(mime.split('\r\n').every(line=>line.length<998));
});
