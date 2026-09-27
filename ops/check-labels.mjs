import {connection} from './connection.mjs';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const {base,local,headers,browserHeaders}=connection({mutates:true});
const client=new Client({name:'zivildienst-label-check',version:'1.0.0'});
let id;
try{
  await client.connect(new StreamableHTTPClientTransport(new URL(base+'/api/mcp'),{requestInit:{headers}}));
  const{tools}=await client.listTools();for(const name of['list_labels','create_label','update_label','assign_label','remove_label','delete_label'])assert.ok(tools.some(tool=>tool.name===name));
  const call=async(name,args={})=>{const result=await client.callTool({name,arguments:args});if(result.isError)throw new Error(result.content[0]?.text);return result.structuredContent;};
  const before=await call('list_labels');
  const created=await call('create_label',{name:'Label check '+Date.now(),color:'green',organisationCodes:[70193]});id=created.labelId;
  await call('update_label',{labelId:id,name:'Verified label '+Date.now(),color:'purple'});
  await call('assign_label',{labelId:id,organisationCodes:[70193,70193]});
  const saved=(await call('list_labels')).labels.find(label=>label.id===id);
  assert.equal(saved.color,'purple');assert.deepEqual(saved.organisationCodes,[70193]);
  if(local){const response=await fetch(base+'/api/labels',{headers:browserHeaders});assert.equal(response.status,200);assert.equal((await response.json()).labels.find(label=>label.id===id).color,'purple');}
  await call('remove_label',{labelId:id,organisationCodes:[70193]});
  assert.deepEqual((await call('list_labels')).labels.find(label=>label.id===id).organisationCodes,[]);
  await call('delete_label',{labelId:id});id=undefined;
  const after=await call('list_labels');assert.deepEqual(after.labels,before.labels);
  console.log(JSON.stringify({labelsVerified:true,toolCount:tools.length,existingLabelsPreserved:before.labels.length}));
}finally{
  if(id)await client.callTool({name:'delete_label',arguments:{labelId:id}});
  await client.close();
}
