import {z} from 'zod';
import {CollectionError} from './collections';
import {getDraft} from './drafts';
import {type GmailHandoff} from '../gmail-tracking';
const uuid=z.string().uuid(),gmailId=z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const handoffAction=z.discriminatedUnion('action',[
 z.object({action:z.literal('prepare'),draftId:uuid,expectedRevision:z.number().int().positive(),account:z.string().email().max(254),owner:z.string().min(1)}).strict(),
 z.object({action:z.literal('abandon'),id:uuid,owner:z.string().min(1)}).strict(),
 z.object({action:z.literal('record'),id:uuid,gmailDraftId:gmailId,threadId:gmailId.nullable(),owner:z.string().min(1)}).strict(),
 z.object({action:z.literal('confirm'),id:uuid,account:z.string().email(),owner:z.string().min(1),evidence:z.object({marker:uuid,messageId:gmailId,threadId:gmailId,occurredAt:z.string().datetime(),recipient:z.string().email()}).strict()}).strict(),
]);
export async function listHandoffs(db:D1Database,owner:string,account:string){
 if(!z.string().email().safeParse(account).success)throw new CollectionError('Ungültiges Gmail-Konto.');
 const {results}=await db.prepare(`SELECT h.id,h.draft_id AS draftId,h.revision,h.snapshot_id AS snapshotId,h.account,h.gmail_draft_id AS gmailDraftId,h.thread_id AS threadId,h.created_at AS createdAt,d.recipient FROM gmail_handoffs h JOIN email_drafts d ON d.id=h.snapshot_id WHERE h.owner_id=? AND h.account=? AND d.state='pending' ORDER BY h.created_at DESC LIMIT 100`).bind(owner,account.toLowerCase()).all<GmailHandoff>();
 return{handoffs:results};
}
export async function prepareHandoff(db:D1Database,owner:string,draftId:string,revision:number,account:string){
 const digest=account?null:new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([owner,draftId,revision]))));
 const hex=digest?Array.from(digest.slice(0,16),b=>b.toString(16).padStart(2,'0')).join(''):'';
 const id=account?crypto.randomUUID():`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20)}`,snapshotId=crypto.randomUUID(),now=new Date().toISOString();
 const prior=await db.prepare('SELECT snapshot_id AS snapshotId FROM gmail_handoffs WHERE id=? AND owner_id=?').bind(id,owner).first<{snapshotId:string}>();if(prior)return{id,snapshotId:prior.snapshotId,owner};
 // A single transaction freezes text and the exact attachment references at this revision.
 let result:D1Result[];try{result=await db.batch([
  db.prepare(`INSERT INTO email_drafts(id,owner_id,org_code,org_title,recipient,subject,body,revision,created_at,updated_at,state) SELECT ?,owner_id,org_code,org_title,recipient,subject,body,1,?,?,'pending' FROM email_drafts WHERE id=? AND owner_id=? AND revision=? AND state='active'`).bind(snapshotId,now,now,draftId,owner,revision),
  db.prepare(`INSERT INTO gmail_handoffs(id,owner_id,draft_id,revision,snapshot_id,account,created_at) SELECT ?,owner_id,?,?,id,?,? FROM email_drafts WHERE id=? AND owner_id=?`).bind(id,draftId,revision,account.toLowerCase(),now,snapshotId,owner),
  db.prepare(`INSERT INTO draft_attachments(id,draft_id,owner_id,object_key,filename,content_type,size,created_at) SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-8'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),?,owner_id,object_key,filename,content_type,size,created_at FROM draft_attachments WHERE draft_id=? AND owner_id=? AND EXISTS(SELECT 1 FROM email_drafts WHERE id=? AND owner_id=?)`).bind(snapshotId,draftId,owner,snapshotId,owner),
 ]);}catch(error){const prior=await db.prepare('SELECT snapshot_id AS snapshotId FROM gmail_handoffs WHERE id=? AND owner_id=?').bind(id,owner).first<{snapshotId:string}>();if(prior)return{id,snapshotId:prior.snapshotId,owner};throw error;}
 if(!result[0].meta.changes){const prior=await db.prepare('SELECT snapshot_id AS snapshotId FROM gmail_handoffs WHERE id=? AND owner_id=?').bind(id,owner).first<{snapshotId:string}>();if(prior)return{id,snapshotId:prior.snapshotId,owner};}
 if(!result[0].meta.changes)throw new CollectionError('Entwurf nicht gefunden, bereits gesendet oder inzwischen geändert. Bitte neu laden.',409);
 return{id,snapshotId,owner};
}
/** Idempotent completion preserves newer source edits and never changes a user's advanced status. */
export async function completeHandoff(db:D1Database,owner:string,id:string,sentAt:string,messageId:string|null=null){
 const row=await db.prepare(`SELECT h.draft_id AS draftId,h.revision,h.snapshot_id AS snapshotId,d.state FROM gmail_handoffs h JOIN email_drafts d ON d.id=h.snapshot_id WHERE h.id=? AND h.owner_id=?`).bind(id,owner).first<{draftId:string;revision:number;snapshotId:string;state:string}>();
 if(!row)throw new CollectionError('Gmail-Kopie nicht gefunden.',404);
 if(row.state==='sent')return getDraft(db,owner,{draftId:row.snapshotId});
 const now=new Date().toISOString();
 await db.batch([
  db.prepare(`INSERT INTO applications(id,owner_id,org_code,org_title,contact_email,created_at,updated_at) SELECT ?,owner_id,org_code,org_title,recipient,?,? FROM email_drafts WHERE id=? AND owner_id=? AND state='pending' AND org_code IS NOT NULL ON CONFLICT(owner_id,org_code) DO NOTHING`).bind(crypto.randomUUID(),now,now,row.snapshotId,owner),
  db.prepare(`UPDATE applications SET status=CASE WHEN status='planned' THEN 'automatic' ELSE status END,updated_at=?,revision=revision+1 WHERE owner_id=? AND org_code=(SELECT org_code FROM email_drafts WHERE id=? AND state='pending')`).bind(now,owner,row.snapshotId),
  db.prepare(`UPDATE email_drafts SET state='archived',sent_at=?,updated_at=?,revision=revision+1 WHERE id=? AND owner_id=? AND revision=? AND state='active' AND EXISTS(SELECT 1 FROM email_drafts WHERE id=? AND state='pending')`).bind(sentAt,now,row.draftId,owner,row.revision,row.snapshotId),
  db.prepare(`UPDATE gmail_handoffs SET message_id=? WHERE id=? AND owner_id=? AND EXISTS(SELECT 1 FROM email_drafts WHERE id=? AND state='pending')`).bind(messageId,id,owner,row.snapshotId),
  db.prepare(`UPDATE email_drafts SET state='sent',sent_at=?,updated_at=?,revision=revision+1 WHERE id=? AND owner_id=? AND state='pending'`).bind(sentAt,now,row.snapshotId,owner),
 ]);
 return getDraft(db,owner,{draftId:row.snapshotId});
}
export async function markDraftSent(db:D1Database,owner:string,draftId:string,revision:number){
 const {draft}=await getDraft(db,owner,{draftId});
 // Repeated confirmation after a successful response was lost is harmless.
 if(draft.state==='sent'||draft.state==='archived')return getDraft(db,owner,{draftId});
 if(draft.revision!==revision)throw new CollectionError('Der Entwurf wurde inzwischen geändert. Bitte neu laden.',409);
 const existing=await db.prepare(`SELECT h.id FROM gmail_handoffs h JOIN email_drafts d ON d.id=h.snapshot_id WHERE h.owner_id=? AND h.draft_id=? AND h.revision=? AND d.state='pending' ORDER BY h.created_at DESC LIMIT 1`).bind(owner,draftId,revision).first<{id:string}>();
 const handoff=existing||await prepareHandoff(db,owner,draftId,revision,'');
 return completeHandoff(db,owner,handoff.id,new Date().toISOString());
}
export async function mutateHandoff(db:D1Database,owner:string,input:unknown){
 const p=handoffAction.safeParse(input);if(!p.success)throw new CollectionError('Ungültige Gmail-Kopie.');const a=p.data;
 if(a.owner!==owner)throw new CollectionError('Die Atlas-Anmeldung wurde geändert. Bitte Gmail erneut verbinden.',409);
 if(a.action==='prepare')return prepareHandoff(db,owner,a.draftId,a.expectedRevision,a.account);
 const row=await db.prepare(`SELECT h.account,h.created_at AS createdAt,d.recipient FROM gmail_handoffs h JOIN email_drafts d ON d.id=h.snapshot_id WHERE h.id=? AND h.owner_id=?`).bind(a.id,owner).first<{account:string;createdAt:string;recipient:string}>();
 if(!row)throw new CollectionError('Gmail-Kopie nicht gefunden.',404);
 if(a.action==='abandon'){await db.prepare("DELETE FROM email_drafts WHERE id=(SELECT snapshot_id FROM gmail_handoffs WHERE id=? AND owner_id=?) AND owner_id=? AND state='pending'").bind(a.id,owner,owner).run();return{abandoned:true};}
 if(a.action==='record'){await db.prepare('UPDATE gmail_handoffs SET gmail_draft_id=?,thread_id=? WHERE id=? AND owner_id=?').bind(a.gmailDraftId,a.threadId,a.id,owner).run();return{recorded:true};}
 if(a.account.toLowerCase()!==row.account||a.evidence.marker!==a.id||a.evidence.recipient.toLowerCase()!==row.recipient.toLowerCase()||Date.parse(a.evidence.occurredAt)<Date.parse(row.createdAt)-60000||Date.parse(a.evidence.occurredAt)>Date.now()+300000)throw new CollectionError('Die gesendete Nachricht passt nicht zur Gmail-Kopie.',409);
 return completeHandoff(db,owner,a.id,a.evidence.occurredAt,a.evidence.messageId);
}
