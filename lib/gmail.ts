import {HANDOFF_HEADER,messageMarker,sentEvidence,type GmailHandoff,type GmailMetadata} from './gmail-tracking';
export const GMAIL_METADATA_SCOPE='https://www.googleapis.com/auth/gmail.metadata';
export const GMAIL_SCOPE='https://www.googleapis.com/auth/gmail.compose';
export const GMAIL_EMAIL_SCOPE='https://www.googleapis.com/auth/userinfo.email';
export type GmailSession={accessToken:string;email:string;owner:string;metadata?:boolean};
export type GmailCopy={draftId:string;revision:number;id:string;messageId:string;account:string;url:string;attachmentCount:number};
export class GmailHandoffError extends Error {
  uncertain:boolean;
  reauthorize:boolean;
  constructor(message:string,uncertain=false,reauthorize=false){super(message);this.uncertain=uncertain;this.reauthorize=reauthorize;}
}
export function gmailDraftsUrl(email:string){return `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#drafts`;}
export function encodeMime(bytes:Uint8Array){
  let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function readError(response:Response,fallback:string){
  try{const value=await response.json() as {error?:unknown};if(typeof value.error==='string')return value.error;}catch{}
  return fallback;
}

/** No send/update endpoint: each explicit handoff makes an unsent Gmail copy. */
export async function createGmailCopy(session:GmailSession,draft:{id:string;revision:number;attachments:unknown[]},request:typeof fetch=fetch):Promise<GmailCopy>{
  if(!/^[^\s<>@]+@[^\s<>@]+$/.test(session.email))throw new GmailHandoffError('Ungültiges Gmail-Konto. Bitte erneut verbinden.');
  const handoff=await handoffRequest(session,{action:'prepare',draftId:draft.id,expectedRevision:draft.revision,account:session.email},request) as {id:string;snapshotId:string};
  let uncertain=false;
  try{
  const exported=await request(`/api/drafts/${encodeURIComponent(handoff.snapshotId)}/export?revision=1`,{cache:'no-store',signal:AbortSignal.timeout(60000)});
  if(!exported.ok)throw new GmailHandoffError(await readError(exported,'Anhänge konnten nicht geladen werden.'));
  if(!session.owner||exported.headers.get('X-Draft-Owner')!==session.owner)throw new GmailHandoffError('Die Atlas-Anmeldung wurde geändert. Bitte Gmail erneut verbinden.',false,true);
  if(exported.headers.get('X-Draft-Revision')!=='1'||!exported.headers.get('Content-Type')?.startsWith('message/rfc822'))throw new GmailHandoffError('Der Entwurf konnte nicht vollständig geladen werden.');
  const sender=new TextEncoder().encode(`From: ${session.email}\r\n${HANDOFF_HEADER}: ${handoff.id}\r\nMessage-ID: ${messageMarker(handoff.id)}\r\n`),mime=new Uint8Array(await exported.arrayBuffer());
  const message=new Uint8Array(sender.length+mime.length);message.set(sender);message.set(mime,sender.length);
  const raw=encodeMime(message);
  let response:Response;
  uncertain=true;
  try{
    response=await request('https://gmail.googleapis.com/gmail/v1/users/me/drafts',{method:'POST',headers:{Authorization:`Bearer ${session.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({message:{raw}}),signal:AbortSignal.timeout(60000),credentials:'omit'});
  }catch{throw new GmailHandoffError('Gmail hat nicht geantwortet. Bitte zuerst in Gmail unter Entwürfe nachsehen, bevor du eine weitere Kopie erstellst.',true);}
  if(!response.ok){
    uncertain=response.status>=500;
    if(response.status===401)throw new GmailHandoffError('Die Gmail-Verbindung ist abgelaufen. Bitte erneut versuchen.',false,true);
    if(response.status===403)throw new GmailHandoffError('Gmail hat den Zugriff abgelehnt. Bitte die Berechtigung zum Verwalten von Entwürfen und die Gmail-API-Einrichtung prüfen.',false,true);
    throw new GmailHandoffError(response.status>=500?'Gmail hat einen Fehler gemeldet. Bitte vor einem erneuten Versuch unter Entwürfe nachsehen.':'Gmail konnte den Entwurf nicht anlegen. Bitte später erneut versuchen.',response.status>=500);
  }
  let result:{id?:string;message?:{id?:string;threadId?:string}};
  try{result=await response.json();}catch{throw new GmailHandoffError('Die Gmail-Antwort war unvollständig. Bitte zuerst unter Entwürfe nachsehen.',true);}
  if(!result.id||!result.message?.id)throw new GmailHandoffError('Die Gmail-Antwort war unvollständig. Bitte zuerst unter Entwürfe nachsehen.',true);
  try{await handoffRequest(session,{action:'record',id:handoff.id,gmailDraftId:result.id,threadId:result.message.threadId||null},request);}catch{throw new GmailHandoffError('In Gmail erstellt. Die Verknüpfung konnte nicht gespeichert werden; bitte zuerst Gmail prüfen.',true);}
  return {draftId:draft.id,revision:draft.revision,id:result.id,messageId:result.message.id,account:session.email,url:gmailDraftsUrl(session.email),attachmentCount:draft.attachments.length};
  }catch(error){if(!uncertain){try{await handoffRequest(session,{action:'abandon',id:handoff.id},request);}catch{}}throw error;}
}

async function handoffRequest(session:GmailSession,input:Record<string,unknown>,request:typeof fetch){
 const response=await request('/api/gmail/handoffs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,owner:session.owner}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new GmailHandoffError(await readError(response,'Gmail-Verknüpfung konnte nicht gespeichert werden.'),false,response.status===409);
 return response.json();
}
/** Reads headers only; never prompts for OAuth and never sends or deletes mail. */
export async function syncGmailSent(session:GmailSession,request:typeof fetch=fetch){
 if(!session.metadata)throw new GmailHandoffError('Zum Abgleichen Gmail erneut verbinden.',false,true);
 const pending=await request('/api/gmail/handoffs?'+new URLSearchParams({account:session.email,owner:session.owner}),{cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!pending.ok)throw new GmailHandoffError(await readError(pending,'Gmail-Verknüpfungen konnten nicht geladen werden.'),false,pending.status===409);
 const {handoffs}=await pending.json() as {handoffs:GmailHandoff[]};if(!handoffs.length)return{confirmed:0,pending:0};
 const google=async(path:string)=>{
  const response=await request('https://gmail.googleapis.com/gmail/v1/users/me/'+path,{headers:{Authorization:`Bearer ${session.accessToken}`},credentials:'omit',signal:AbortSignal.timeout(15000)});
  if(response.status===404)return null;
  if(!response.ok)throw new GmailHandoffError('Gmail-Abgleich fehlgeschlagen. Bitte erneut verbinden.',false,response.status===401||response.status===403);
  return response.json();
 };
 const headers='format=metadata&metadataHeaders=X-Zivi-Atlas-Handoff&metadataHeaders=Message-ID&metadataHeaders=To';
 const candidates=new Map<string,GmailMetadata>();
 const missing:GmailHandoff[]=[];
 for(const handoff of handoffs){if(!handoff.gmailDraftId||!await google('drafts/'+encodeURIComponent(handoff.gmailDraftId)+'?format=minimal'))missing.push(handoff);}
 if(!missing.length)return{confirmed:0,pending:handoffs.length};
 // Threads are hints only; an exact marker is required even in a known thread.
 for(const threadId of new Set(missing.map(h=>h.threadId).filter((id):id is string=>!!id))){
  const thread=await google('threads/'+encodeURIComponent(threadId)+'?'+headers) as {messages?:GmailMetadata[]}|null;
  for(const message of thread?.messages||[])if(message.id)candidates.set(message.id,message);
 }
 let confirmed=0;
 const remaining=new Map(missing.map(h=>[h.id,h]));
 const reconcile=async(message:GmailMetadata)=>{
  for(const [id,handoff] of remaining){const evidence=sentEvidence(message,handoff);if(!evidence)continue;await handoffRequest(session,{action:'confirm',id,account:session.email,evidence},request);remaining.delete(id);confirmed++;}
 };
 for(const message of candidates.values())await reconcile(message);
 // Gmail may move an edited draft to a new thread. Search recent SENT metadata,
 // bounded per check; reaching the cap is unknown, never proof of sending.
 let pageToken='';
 for(let page=0;page<2&&remaining.size;page++){
  const listing=await google('messages?'+new URLSearchParams({labelIds:'SENT',maxResults:'50',...(pageToken?{pageToken}:{})})) as {messages?:{id:string}[];nextPageToken?:string}|null;
  for(const entry of listing?.messages||[]){if(candidates.has(entry.id))continue;const message=await google('messages/'+encodeURIComponent(entry.id)+'?'+headers) as GmailMetadata|null;if(message)await reconcile(message);if(!remaining.size)break;}
  if(!listing?.nextPageToken)break;pageToken=listing.nextPageToken;
 }
 return{confirmed,pending:handoffs.length-confirmed};
}
