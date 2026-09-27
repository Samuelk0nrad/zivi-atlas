export function validateImport(input){
  const statuses=['automatic','planned','sent','replied','interview','accepted','rejected','withdrawn'];
  if(!input||typeof input.sourceAccount!=='string'||!input.sourceAccount.trim()||!Array.isArray(input.groups)||!input.groups.length||input.groups.some(group=>!group||!Number.isInteger(group.organisationCode)||group.organisationCode<1||!Array.isArray(group.messages)||!group.messages.length||group.messages.some(message=>!message||typeof message.messageId!=='string')||(group.notes!==undefined&&typeof group.notes!=='string')||(group.status!==undefined&&!statuses.includes(group.status))))throw new Error('Expected sourceAccount and nonempty groups with organisationCode and messages; no messages were imported.');
  return input;
}

export async function verifyImportedMessages(call,applicationId,sourceAccount,messages){
  const remaining=new Set(messages.map(message=>message.messageId.toLowerCase()));
  for(let offset=0;;){
    const page=await call('get_application',{applicationId,limit:50,offset});
    for(const message of page.emails)if(message.sourceAccount.toLowerCase()===sourceAccount.trim().toLowerCase())remaining.delete(message.messageId.toLowerCase());
    if(!remaining.size)return page;
    offset+=page.emails.length;
    if(!page.emails.length||offset>=page.emailTotal)throw new Error('Readback did not include every imported message. Imports already completed remain saved.');
  }
}
