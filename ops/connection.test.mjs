import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {readCredential,resolveTarget} from './connection.mjs';
import {validateImport,verifyImportedMessages} from './import-helpers.mjs';

test('targets default to local and allow configured loopback ports',()=>{
  assert.deepEqual(resolveTarget({}, {}, []),{base:'http://localhost:5173',local:true});
  for(const origin of ['http://127.0.0.1:9000','http://[::1]:9000'])assert.equal(resolveTarget({mutates:true},{ZIVI_BASE_URL:origin},[]).base,origin);
  assert.equal(resolveTarget({},{ZIVI_BASE_URL:'https://remote.example'},['--local']).base,'http://localhost:5173');
});

test('remote mutations need explicit opt-in while read-only checks do not',()=>{
  const env={ZIVI_BASE_URL:'https://remote.example'};
  assert.equal(resolveTarget({},env,[]).local,false);
  assert.throws(()=>resolveTarget({mutates:true},env,[]),/--allow-remote-writes/);
  assert.equal(resolveTarget({mutates:true},env,['--allow-remote-writes']).base,env.ZIVI_BASE_URL);
  assert.throws(()=>resolveTarget({mutates:true,localOnly:true},env,['--allow-remote-writes']),/local preview/);
});

test('invalid origins cannot leak credentials through URL components',()=>{
  for(const origin of ['not a URL','file:///tmp','http://remote.example','https://user:password@remote.example','https://remote.example/api','https://remote.example/?token=x','https://remote.example/#fragment','http://localhost.remote.example']){
    assert.throws(()=>resolveTarget({mutates:true},{ZIVI_BASE_URL:origin},['--allow-remote-writes']));
  }
});

test('credentials prefer environment and never read the keyring implicitly',()=>{
  const forbiddenLookup=()=>{throw new Error('Unexpected keyring lookup');};
  assert.equal(readCredential('TOKEN','app-bearer',{env:{},lookup:forbiddenLookup}),undefined);
  assert.throws(()=>readCredential('TOKEN','app-bearer',{required:true,env:{},lookup:forbiddenLookup}),/Set TOKEN/);
  assert.equal(readCredential('TOKEN','app-bearer',{env:{TOKEN:'fixture-token',ZIVI_USE_KEYRING:'1'},lookup:forbiddenLookup}),'fixture-token');
});

test('explicit keyring fallback uses configurable service and hides failures',()=>{
  const env={ZIVI_USE_KEYRING:'1',ZIVI_KEYRING_SERVICE:'test-service'};
  const lookup=(command,args)=>{assert.equal(command,'secret-tool');assert.deepEqual(args,['lookup','service','test-service','credential','app-bearer']);return{status:0,stdout:'fixture-token\n'};};
  assert.equal(readCredential('TOKEN','app-bearer',{env,lookup}),'fixture-token');
  assert.throws(()=>readCredential('TOKEN','app-bearer',{env,required:true,lookup:()=>({status:1})}),/Set TOKEN/);
});

test('tunnel wrapper forwards synthetic environment credentials and arguments',()=>{
  const wrapper=fileURLToPath(new URL('./zivildienst-tunnel',import.meta.url));
  const check="const a=require('node:assert/strict');a.equal(process.env.CONTROL_PLANE_API_KEY,'fixture-runtime');a.equal(process.env.ZIVI_AUTHORIZATION,'Bearer fixture-app');a.equal(process.env.ZIVI_SITES_AUTHORIZATION,'Bearer fixture-site');a.deepEqual(process.argv.slice(1),['argument with spaces']);";
  const env={PATH:process.env.PATH,TUNNEL_CLIENT:process.execPath,CONTROL_PLANE_API_KEY:'fixture-runtime',ZIVI_MCP_TOKEN:'fixture-app',ZIVI_SITES_TOKEN:'fixture-site'};
  const result=spawnSync('/bin/sh',[wrapper,'-e',check,'argument with spaces'],{env,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');
  const full=spawnSync('/bin/sh',[wrapper,'-e',check,'argument with spaces'],{env:{...env,ZIVI_MCP_TOKEN:'unused',ZIVI_SITES_TOKEN:'unused',ZIVI_AUTHORIZATION:'Bearer fixture-app',ZIVI_SITES_AUTHORIZATION:'Bearer fixture-site'},encoding:'utf8'});
  assert.equal(full.status,0,full.stderr);
  const missing=spawnSync('/bin/sh',[wrapper],{env:{PATH:process.env.PATH},encoding:'utf8'});
  assert.equal(missing.status,1);assert.match(missing.stderr,/Set CONTROL_PLANE_API_KEY/);assert.equal(missing.stdout,'');
});

test('import input rejects empty or malformed groups before writing',()=>{
  const valid={sourceAccount:'fixture@example.org',groups:[{organisationCode:70193,messages:[{messageId:'abcdef01'}]}]};
  assert.equal(validateImport(valid),valid);
  for(const input of [null,{}, {...valid,groups:[]},{...valid,groups:[{organisationCode:70193,messages:[]}]},{...valid,groups:[{...valid.groups[0],status:'unknown'}]}])assert.throws(()=>validateImport(input),/no messages were imported/);
});

test('import readback spans pages and matches the account as well as message ID',async()=>{
  const offsets=[];
  const call=async(name,args)=>{assert.equal(name,'get_application');assert.equal(args.limit,50);offsets.push(args.offset);return{application:{id:'fixture'},emailTotal:2,emails:args.offset===0?[{sourceAccount:'other@example.org',messageId:'abcdef01'}]:[{sourceAccount:'fixture@example.org',messageId:'abcdef01'}]};};
  await verifyImportedMessages(call,'fixture','Fixture@example.org',[{messageId:'ABCDEF01'}]);assert.deepEqual(offsets,[0,1]);
  await assert.rejects(()=>verifyImportedMessages(async()=>({emailTotal:1,emails:[{sourceAccount:'other@example.org',messageId:'abcdef01'}]}),'fixture','fixture@example.org',[{messageId:'abcdef01'}]),/already completed remain saved/);
});
