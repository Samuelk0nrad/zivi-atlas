import test from 'node:test';
import assert from 'node:assert/strict';
import {createGmailAuthorization} from '../lib/gmail-authorization.ts';
import {GMAIL_SCOPE,createGmailCopy,GmailHandoffError} from '../lib/gmail.ts';

function fixture(){
  let clock=100000,account='alice@example.org',config;
  const prompts=[],values=new Map();
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const oauth={initTokenClient(options){config=options;return{requestAccessToken(options){prompts.push(options);}};}};
  const request=async()=>Response.json({email:account});
  const make=(options={})=>createGmailAuthorization({clientId:'client-one',owner:'owner-one',oauth,storage,request,now:()=>clock,...options});
  const grant=(extra={})=>config.callback({access_token:'synthetic-token',expires_in:3600,scope:GMAIL_SCOPE,...extra});
  return{make,grant,prompts,values,storage,advance:ms=>{clock+=ms;},setAccount:value=>{account=value;},cancel:()=>config.error_callback({type:'popup_closed'})};
}

test('connecting once creates multiple drafts without reopening Google and stores no token',async()=>{
  const f=fixture(),auth=f.make(),first=auth.authorize();
  assert.deepEqual(f.prompts,[{prompt:'select_account'}]);f.grant();await first;
  let posts=0;
  const request=async(url,options)=>{
    if(url.startsWith('/api/'))return new Response('To: test@example.org\r\n\r\nSynthetic draft',{headers:{'Content-Type':'message/rfc822','X-Draft-Revision':'1','X-Draft-Owner':'owner-one'}});
    assert.equal(options.headers.Authorization,'Bearer synthetic-token');posts++;return Response.json({id:`draft-${posts}`,message:{id:`message-${posts}`}});
  };
  for(const id of ['first','second'])await createGmailCopy(await auth.authorize(),{id,revision:1,attachments:[]},request);
  assert.equal(posts,2);assert.equal(f.prompts.length,1);
  assert.deepEqual([...f.values.values()],['alice@example.org']);
});

test('expiry and reload request the remembered account without forcing account selection',async()=>{
  const f=fixture(),auth=f.make();let pending=auth.authorize();f.grant();await pending;
  f.advance(3540000);pending=auth.authorize();
  assert.deepEqual(f.prompts.at(-1),{prompt:'',login_hint:'alice@example.org'});f.grant();await pending;
  const reloaded=f.make();assert.equal(reloaded.getAccount(),'alice@example.org');pending=reloaded.authorize();
  assert.equal(f.prompts.length,3,'reload must acquire a fresh token');
  assert.deepEqual(f.prompts.at(-1),{prompt:'',login_hint:'alice@example.org'});f.grant();await pending;
  for(const expires_in of [undefined,0,-1,'invalid']){
    const a=f.make();pending=a.authorize();f.grant({expires_in});await pending;
    const before=f.prompts.length;pending=a.authorize();assert.equal(f.prompts.length,before+1);f.grant();await pending;
  }
});

test('account changes are explicit, cancellation keeps the previous account, and forgetting clears it',async()=>{
  const f=fixture(),auth=f.make();let pending=auth.authorize();f.grant();await pending;
  pending=auth.authorize(true);assert.deepEqual(f.prompts.at(-1),{prompt:'select_account'});f.cancel();await assert.rejects(pending,/geschlossen/);
  assert.equal((await auth.authorize()).email,'alice@example.org');
  pending=auth.authorize(true);f.setAccount('bob@example.org');f.grant({access_token:'bob-token'});await pending;
  assert.equal((await auth.authorize()).email,'bob@example.org');assert.deepEqual([...f.values.values()],['bob@example.org']);
  auth.forget();assert.equal(auth.getAccount(),null);assert.equal(f.values.size,0);
  pending=auth.authorize();assert.deepEqual(f.prompts.at(-1),{prompt:'select_account'});f.grant();await pending;
});

test('a different Google account cannot silently replace the remembered sender',async()=>{
  const f=fixture(),auth=f.make();let pending=auth.authorize();f.grant();await pending;
  auth.invalidate();f.setAccount('bob@example.org');pending=auth.authorize();f.grant();await assert.rejects(pending,/Konto wechseln/);
  assert.equal(auth.getAccount(),'alice@example.org');
  f.setAccount('alice@example.org');pending=auth.authorize();f.grant();await pending;
});

test('preferences are isolated by Atlas owner and OAuth client; unavailable storage is harmless',async()=>{
  const f=fixture();let a=f.make(),pending=a.authorize();f.grant();await pending;
  for(const options of [{owner:'owner-two'},{clientId:'client-two'},{storage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}}}]){
    a=f.make(options);assert.equal(a.getAccount(),null);pending=a.authorize();assert.deepEqual(f.prompts.at(-1),{prompt:'select_account'});f.grant();await pending;
  }
});

test('concurrent clicks share a popup and rejected permissions can be retried',async()=>{
  const f=fixture(),auth=f.make();const first=auth.authorize(),second=auth.authorize();assert.equal(first,second);assert.equal(f.prompts.length,1);
  f.grant({scope:'email'});await assert.rejects(first,/Berechtigung/);
  const retry=auth.authorize();assert.equal(f.prompts.length,2);f.grant();await retry;
});

test('Gmail authorization rejection is explicit and never retries the draft write',async()=>{
  for(const status of [401,403]){
    let posts=0;
    await assert.rejects(createGmailCopy({owner:'owner-one',accessToken:'synthetic',email:'alice@example.org'},{id:'test',revision:1,attachments:[]},async url=>{
      if(url.startsWith('/api/'))return new Response('mime',{headers:{'Content-Type':'message/rfc822','X-Draft-Revision':'1','X-Draft-Owner':'owner-one'}});
      posts++;return new Response('',{status});
    }),error=>error instanceof GmailHandoffError&&error.reauthorize&&!error.uncertain);
    assert.equal(posts,1);
  }
});


test('a changed Atlas owner cannot transfer a draft with the previous Gmail connection',async()=>{
  let requests=0;
  await assert.rejects(createGmailCopy({owner:'old-owner',accessToken:'synthetic',email:'alice@example.org'},{id:'test',revision:1,attachments:[]},async()=>{
    requests++;return new Response('private MIME',{headers:{'Content-Type':'message/rfc822','X-Draft-Revision':'1','X-Draft-Owner':'new-owner'}});
  }),error=>error instanceof GmailHandoffError&&error.reauthorize&&/Atlas-Anmeldung/.test(error.message));
  assert.equal(requests,1,'no MIME or token should reach Google');
});
