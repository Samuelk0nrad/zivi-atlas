export type GmailHandoff={id:string;draftId:string;revision:number;snapshotId:string;account:string;gmailDraftId:string|null;threadId:string|null;recipient:string;createdAt:string};
export type SentEvidence={messageId:string;threadId:string;occurredAt:string;recipient:string;marker:string};
export const HANDOFF_HEADER='X-Zivi-Atlas-Handoff';
export const messageMarker=(id:string)=>`<${id}@drafts.zivi-atlas.invalid>`;
export type GmailMetadata={id?:string;threadId?:string;labelIds?:string[];internalDate?:string;payload?:{headers?:{name:string;value:string}[]}};
/** A missing draft, matching subject or shared thread is never evidence of sending. */
export function sentEvidence(message:GmailMetadata,handoff:GmailHandoff):SentEvidence|null{
  if(!message.labelIds?.includes('SENT')||message.labelIds.includes('DRAFT'))return null;
  const headers=message.payload?.headers||[];
  const values=(name:string)=>headers.filter(h=>h.name.toLowerCase()===name.toLowerCase()).map(h=>h.value.trim());
  if(!values(HANDOFF_HEADER).includes(handoff.id)&&!values('Message-ID').includes(messageMarker(handoff.id)))return null;
  // Extract addr-specs, never an address-looking display name or comment.
  const addresses=values('To').filter(value=>!/[()\r\n\\]/.test(value)).flatMap(value=>value.split(/,(?=(?:[^"\\]*"[^"\\]*")*[^"\\]*$)/).map(part=>{
    const angle=part.match(/^[^<>]*<([^<>]+)>\s*$/);const address=(angle?angle[1]:part).trim();
    return /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+$/i.test(address)?address:'';
  }));
  if(!handoff.recipient||!addresses.some(a=>a.toLowerCase()===handoff.recipient.toLowerCase()))return null;
  const time=Number(message.internalDate);
  if(!message.id||!message.threadId||!Number.isFinite(time)||time<Date.parse(handoff.createdAt)-60000||time>Date.now()+300000)return null;
  return{messageId:message.id,threadId:message.threadId,occurredAt:new Date(time).toISOString(),recipient:handoff.recipient,marker:handoff.id};
}
