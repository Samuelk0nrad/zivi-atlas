import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {database} from './d1-test-helper.mjs';
import {mutateDraft,getDraft} from '../lib/server/drafts.ts';
import {mutateHandoff} from '../lib/server/gmail-handoffs.ts';
import {uploadAttachment} from '../lib/server/draft-attachments.ts';
import {exportDraftMime} from '../lib/server/draft-export.ts';
import {createGmailCopy,GmailHandoffError,gmailDraftsUrl} from '../lib/gmail.ts';

async function fixture(){
  const {db}=database(),files=new Map();
  const bucket={async put(key,bytes){files.set(key,bytes.slice(0));},async get(key){const bytes=files.get(key);return bytes?{arrayBuffer:async()=>bytes.slice(0)}:null;},async delete(key){files.delete(key);}};
  const {draft}=await mutateDraft(db,'alice',{action:'create_email_draft',recipient:'office@example.org',subject:'Bewerbung Österreich',body:'Grüße!\nMein Lebenslauf.'},async()=>({content:[]}));
  const bytes=new Uint8Array([37,80,68,70,45,0,255,128,10]);
  await uploadAttachment(db,bucket,'alice',{draftId:draft.id,expectedRevision:1},'Lebenslauf – Österreich.pdf',bytes.buffer);
  return {db,bucket,bytes,draft:(await getDraft(db,'alice',{draftId:draft.id})).draft};
}
test('Gmail upload contains the saved text and exact attachment bytes, using only the create-draft endpoint',async()=>{
  const {db,bucket,draft,bytes}=await fixture(),calls=[];
  const request=async(url,options)=>{
    calls.push({url,options});
    if(url==='/api/gmail/handoffs')return Response.json(await mutateHandoff(db,'alice',JSON.parse(options.body)));
    if(url.startsWith('/api/drafts/')){
      assert.equal(options.headers,undefined,'Google token must not be sent to Zivi Atlas');
      const exported=await exportDraftMime(db,bucket,'alice',{draftId:url.split('/')[3],expectedRevision:1});
      return new Response(exported.mime,{headers:{'Content-Type':'message/rfc822','X-Draft-Revision':String(exported.revision),'X-Draft-Owner':exported.owner}});
    }
    assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/drafts');
    assert.equal(options.method,'POST');assert.equal(options.credentials,'omit');
    assert.equal(options.headers.Authorization,'Bearer synthetic-token');
    const mime=Buffer.from(JSON.parse(options.body).message.raw,'base64url');
    const py=spawnSync('python3',['-c',`import sys,json,hashlib\nfrom email import policy\nfrom email.parser import BytesParser\nm=BytesParser(policy=policy.default).parsebytes(sys.stdin.buffer.read())\nprint(json.dumps({'from':str(m['From']),'to':str(m['To']),'subject':str(m['Subject']),'body':m.get_body().get_content(),'files':[{'name':p.get_filename(),'sha256':hashlib.sha256(p.get_payload(decode=True)).hexdigest()} for p in m.iter_attachments()]}))`],{input:mime,encoding:'utf8'});
    assert.equal(py.status,0,py.stderr);const parsed=JSON.parse(py.stdout);
    assert.equal(parsed.from,'alice+test@example.org');assert.equal(parsed.to,draft.recipient);assert.equal(parsed.subject,draft.subject);assert.equal(parsed.body,draft.body.replaceAll('\n','\r\n'));
    assert.deepEqual(parsed.files,[{name:'Lebenslauf – Österreich.pdf',sha256:createHash('sha256').update(bytes).digest('hex')}]);
    return Response.json({id:'draft-synthetic',message:{id:'message-synthetic'}});
  };
  const copy=await createGmailCopy({owner:'alice',accessToken:'synthetic-token',email:'alice+test@example.org'},draft,request);
  assert.equal(calls.length,4);assert.equal(copy.attachmentCount,1);assert.equal(copy.revision,2);assert.equal(copy.url,gmailDraftsUrl('alice+test@example.org'));
});
test('MIME handoff rejects another owner, stale revisions, and changes during attachment reads',async()=>{
  const {db,bucket,draft}=await fixture();
  await assert.rejects(exportDraftMime(db,bucket,'bob',{draftId:draft.id,expectedRevision:2}),e=>e.status===404);
  await assert.rejects(exportDraftMime(db,bucket,'alice',{draftId:draft.id,expectedRevision:1}),e=>e.status===409);
  const racedBucket={...bucket,async get(key){const object=await bucket.get(key);db.prepare('UPDATE email_drafts SET revision=revision+1 WHERE id=?').bind(draft.id).run();return object;}};
  await assert.rejects(exportDraftMime(db,racedBucket,'alice',{draftId:draft.id,expectedRevision:2}),e=>e.status===409);
});
test('failed or mismatched exports never upload to Gmail',async()=>{
  for(const response of [Response.json({error:'changed'},{status:409}),new Response('<html>sign in</html>',{headers:{'Content-Type':'text/html'}}),new Response('mime',{headers:{'Content-Type':'message/rfc822','X-Draft-Revision':'3'}})]){
    let calls=0;
    await assert.rejects(createGmailCopy({owner:'alice',accessToken:'synthetic',email:'a@example.org'},{id:'draft',revision:2,attachments:[]},async(url,options)=>{if(url==='/api/gmail/handoffs')return Response.json({id:'handoff',snapshotId:'snapshot'});calls++;return response;}));
    assert.equal(calls,1);
  }
});
test('ambiguous Gmail failures are not retried and instruct the user to check Drafts',async()=>{
  for(const failure of ['network','server','malformed','denied']){
    let posts=0;
    const request=async(url)=>{
      if(url==='/api/gmail/handoffs')return Response.json({id:'handoff',snapshotId:'snapshot'});
      if(url.startsWith('/api/'))return new Response('mime',{headers:{'Content-Type':'message/rfc822','X-Draft-Revision':'1','X-Draft-Owner':'alice'}});
      posts++;if(failure==='network')throw new Error('offline');
      if(failure==='server')return new Response('',{status:500});
      if(failure==='denied')return new Response('',{status:403});
      return Response.json({});
    };
    await assert.rejects(createGmailCopy({owner:'alice',accessToken:'synthetic',email:'a@example.org'},{id:'draft',revision:1,attachments:[]},request),e=>e instanceof GmailHandoffError&&e.uncertain===(failure!=='denied'));
    assert.equal(posts,1);
  }
});
