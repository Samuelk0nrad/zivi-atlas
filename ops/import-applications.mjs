// Read approved Gmail snapshots from hidden stdin. Never sends mail or writes payloads to disk.
import {connection} from './connection.mjs';
import {validateImport,verifyImportedMessages} from './import-helpers.mjs';
import {createInterface} from 'node:readline/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const {base,headers}=connection({mutates:true});
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log('Ready for approved application import JSON on stdin (input hidden).');
const rl=createInterface({input:process.stdin,output:process.stdout,terminal:false});let input;
try{const line=await rl.question('');try{input=JSON.parse(line);}catch{throw new Error('Invalid import JSON; no messages were imported.');}}finally{rl.close();if(process.stdin.isTTY)process.stdin.setRawMode(false);}
validateImport(input);
const client=new Client({name:'zivildienst-application-import',version:'1.0.0'});
const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw new Error(r.content[0]?.text||'Tool failed');return r.structuredContent;};
try{
 await client.connect(new StreamableHTTPClientTransport(new URL(base+'/api/mcp'),{requestInit:{headers}}));
 const results=[];for(const group of input.groups){let current;let imported=0,duplicates=0;
  for(let offset=0;offset<group.messages.length;offset+=5){current=await call('import_application_emails',{organisationCode:group.organisationCode,sourceAccount:input.sourceAccount,messages:group.messages.slice(offset,offset+5)});imported+=current.imported;duplicates+=current.duplicates;}
  if((group.notes!==undefined||group.status!==undefined)&&current){current=await call('update_application',{applicationId:current.application.id,expectedRevision:current.application.revision,status:group.status??current.application.status,notes:group.notes??current.application.notes});}
  if(current){const check=await verifyImportedMessages(call,current.application.id,input.sourceAccount,group.messages);results.push({organisationCode:group.organisationCode,applicationId:check.application.id,status:check.application.effectiveStatus,messageCount:check.application.messageCount,imported,duplicates});}
 }
 console.log(JSON.stringify({verified:true,applications:results,emailSent:false}));
}finally{await client.close();}
