export const GMAIL_SCOPE='https://www.googleapis.com/auth/gmail.compose';
export const GMAIL_EMAIL_SCOPE='https://www.googleapis.com/auth/userinfo.email';
export type GmailSession={accessToken:string;email:string};
export type GmailCopy={draftId:string;revision:number;id:string;messageId:string;account:string;url:string;attachmentCount:number};
export class GmailHandoffError extends Error {
  uncertain:boolean;
  constructor(message:string,uncertain=false){super(message);this.uncertain=uncertain;}
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
  const exported=await request(`/api/drafts/${encodeURIComponent(draft.id)}/export?revision=${draft.revision}`,{cache:'no-store',signal:AbortSignal.timeout(60000)});
  if(!exported.ok)throw new GmailHandoffError(await readError(exported,'Anhänge konnten nicht geladen werden.'));
  if(exported.headers.get('X-Draft-Revision')!==String(draft.revision)||!exported.headers.get('Content-Type')?.startsWith('message/rfc822'))throw new GmailHandoffError('Der Entwurf konnte nicht vollständig geladen werden.');
  const sender=new TextEncoder().encode(`From: ${session.email}\r\n`),mime=new Uint8Array(await exported.arrayBuffer());
  const message=new Uint8Array(sender.length+mime.length);message.set(sender);message.set(mime,sender.length);
  const raw=encodeMime(message);
  let response:Response;
  try{
    response=await request('https://gmail.googleapis.com/gmail/v1/users/me/drafts',{method:'POST',headers:{Authorization:`Bearer ${session.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({message:{raw}}),signal:AbortSignal.timeout(60000),credentials:'omit'});
  }catch{throw new GmailHandoffError('Gmail hat nicht geantwortet. Bitte zuerst in Gmail unter Entwürfe nachsehen, bevor du eine weitere Kopie erstellst.',true);}
  if(!response.ok){
    if(response.status===401)throw new GmailHandoffError('Die Gmail-Verbindung ist abgelaufen. Bitte erneut verbinden.');
    if(response.status===403)throw new GmailHandoffError('Gmail hat den Zugriff abgelehnt. Bitte die Berechtigung zum Verwalten von Entwürfen und die Gmail-API-Einrichtung prüfen.');
    throw new GmailHandoffError(response.status>=500?'Gmail hat einen Fehler gemeldet. Bitte vor einem erneuten Versuch unter Entwürfe nachsehen.':'Gmail konnte den Entwurf nicht anlegen. Bitte später erneut versuchen.',response.status>=500);
  }
  let result:{id?:string;message?:{id?:string}};
  try{result=await response.json();}catch{throw new GmailHandoffError('Die Gmail-Antwort war unvollständig. Bitte zuerst unter Entwürfe nachsehen.',true);}
  if(!result.id||!result.message?.id)throw new GmailHandoffError('Die Gmail-Antwort war unvollständig. Bitte zuerst unter Entwürfe nachsehen.',true);
  return {draftId:draft.id,revision:draft.revision,id:result.id,messageId:result.message.id,account:session.email,url:gmailDraftsUrl(session.email),attachmentCount:draft.attachments.length};
}
