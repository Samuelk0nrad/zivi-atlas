import {applicationActionSchema,applicationGetSchema,applicationListSchema,type Application,type ApplicationEmail} from '../application-contract';
import {type Organisation} from '../data';
import {listDrafts,getDraft} from './drafts';
import {CollectionError} from './collections';
const columns=`a.id,a.org_code AS organisationCode,a.org_title AS organisationTitle,a.contact_email AS contactEmail,a.status,a.notes,a.revision,a.created_at AS createdAt,a.updated_at AS updatedAt,a.last_import_at AS lastImportAt,
 (SELECT COUNT(*) FROM application_emails e WHERE e.application_id=a.id) AS messageCount,
 (SELECT MAX(occurred_at) FROM application_emails e WHERE e.application_id=a.id) AS lastMessageAt,
 CASE WHEN a.status!='automatic' THEN a.status WHEN COALESCE((SELECT MAX(sent_at) FROM email_drafts d WHERE d.owner_id=a.owner_id AND d.org_code=a.org_code AND d.state='sent'),'')>COALESCE((SELECT MAX(occurred_at) FROM application_emails e WHERE e.application_id=a.id),'') THEN 'sent' ELSE COALESCE((SELECT CASE direction WHEN 'sent' THEN 'sent' ELSE 'replied' END FROM application_emails e WHERE e.application_id=a.id ORDER BY occurred_at DESC,message_id DESC LIMIT 1),CASE WHEN EXISTS(SELECT 1 FROM email_drafts d WHERE d.owner_id=a.owner_id AND d.org_code=a.org_code AND d.state='sent') THEN 'sent' ELSE 'planned' END) END AS effectiveStatus`;
export async function listApplications(db:D1Database,owner:string,input:unknown={}){
 const p=applicationListSchema.safeParse(input);if(!p.success)throw new CollectionError('Ungültige Bewerbungssuche.');
 const {results}=await db.prepare(`SELECT ${columns} FROM applications a WHERE owner_id=? ORDER BY COALESCE(lastMessageAt,a.updated_at) DESC,a.id LIMIT ? OFFSET ?`).bind(owner,p.data.limit,p.data.offset).all<Application>();
 const count=await db.prepare('SELECT COUNT(*) AS total FROM applications WHERE owner_id=?').bind(owner).first<{total:number}>();return {applications:results,total:count?.total||0,offset:p.data.offset};
}
export async function getApplication(db:D1Database,owner:string,input:unknown){
 const p=applicationGetSchema.safeParse(input);if(!p.success)throw new CollectionError('Ungültige Bewerbung.');
 const application=await db.prepare(`SELECT ${columns} FROM applications a WHERE a.id=? AND owner_id=?`).bind(p.data.applicationId,owner).first<Application>();if(!application)throw new CollectionError('Bewerbung nicht gefunden.',404);
 const {results}=await db.prepare('SELECT id,source_account AS sourceAccount,message_id AS messageId,thread_id AS threadId,direction,occurred_at AS occurredAt,sender AS "from",recipients AS "to",cc,subject,body,body_truncated AS bodyTruncated,imported_at AS importedAt FROM application_emails WHERE application_id=? AND owner_id=? ORDER BY occurred_at DESC,message_id DESC LIMIT ? OFFSET ?').bind(application.id,owner,p.data.limit,p.data.offset).all<ApplicationEmail>();
 const archive=await listDrafts(db,owner,{organisationCode:application.organisationCode,state:'sent'});
 const sentDrafts=await Promise.all(archive.drafts.map(async d=>(await getDraft(db,owner,{draftId:d.id})).draft));
 return {sentDrafts,application,emailTotal:application.messageCount,offset:p.data.offset,emails:results.map(e=>({...e,bodyTruncated:!!e.bodyTruncated})),applicationUrl:`/?application=${application.id}`};
}
export async function mutateApplication(db:D1Database,owner:string,input:unknown,loadCatalog:()=>Promise<{content:Organisation[]}>){
 const p=applicationActionSchema.safeParse(input);if(!p.success)throw new CollectionError(p.error.issues[0]?.message||'Ungültige Bewerbung.');
 const action=p.data,now=new Date().toISOString();
 if(action.action==='update_application'||action.action==='delete_application'){
  const result=await(action.action==='delete_application'?db.prepare('DELETE FROM applications WHERE id=? AND owner_id=? AND revision=?').bind(action.applicationId,owner,action.expectedRevision):db.prepare('UPDATE applications SET status=?,notes=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=?').bind(action.status,action.notes,now,action.applicationId,owner,action.expectedRevision)).run();
  if(!result.meta.changes){const exists=await db.prepare('SELECT id FROM applications WHERE id=? AND owner_id=?').bind(action.applicationId,owner).first();throw new CollectionError(exists?'Der Bewerbungsstand wurde inzwischen geändert. Bitte neu laden.':'Bewerbung nicht gefunden.',exists?409:404);}
  return action.action==='delete_application'?{deleted:true,applicationId:action.applicationId}:getApplication(db,owner,{applicationId:action.applicationId});
 }
 let existing=await db.prepare('SELECT id FROM applications WHERE org_code=? AND owner_id=?').bind(action.organisationCode,owner).first<{id:string}>();
 if(action.action==='import_application_emails'){
  for(const email of action.messages){
   const addresses=email.from.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+/gi)||[];
   if(email.gmailLabels?.includes('DRAFT')||(email.gmailLabels?((email.direction==='sent')!==email.gmailLabels.includes('SENT')):((email.direction==='sent')!==addresses.some(a=>a.toLowerCase()===action.sourceAccount))))throw new CollectionError('Absender und Nachrichtenrichtung passen nicht zum Gmail-Konto.');
   const other=await db.prepare('SELECT application_id AS applicationId FROM application_emails WHERE owner_id=? AND source_account=? AND message_id=?').bind(owner,action.sourceAccount,email.messageId.toLowerCase()).first<{applicationId:string}>();
   if(other&&other.applicationId!==existing?.id)throw new CollectionError('Diese Gmail-Nachricht ist bereits einer anderen Einrichtung zugeordnet.',409);
  }
 }
 if(!existing){
  const org=(await loadCatalog()).content.find(o=>o.code===action.organisationCode);if(!org)throw new CollectionError('Einrichtung nicht gefunden. Bitte zuerst nach der Einrichtung suchen.');
  await db.prepare('INSERT INTO applications(id,owner_id,org_code,org_title,contact_email,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner_id,org_code) DO NOTHING').bind(crypto.randomUUID(),owner,org.code,org.title,org.email||'',now,now).run();
  existing=await db.prepare('SELECT id FROM applications WHERE org_code=? AND owner_id=?').bind(action.organisationCode,owner).first<{id:string}>();
 }
 if(!existing)throw new CollectionError('Bewerbung konnte nicht gespeichert werden.',503);
 if(action.action==='track_application')return getApplication(db,owner,{applicationId:existing.id});
 const applicationId=existing.id;
 const rowIds=action.messages.map(()=>crypto.randomUUID());
 const statements=action.messages.map((email,index)=>db.prepare(`INSERT INTO application_emails(id,application_id,owner_id,source_account,message_id,thread_id,direction,occurred_at,sender,recipients,cc,subject,body,body_truncated,imported_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,source_account,message_id) DO NOTHING`).bind(rowIds[index],applicationId,owner,action.sourceAccount,email.messageId.toLowerCase(),email.threadId.toLowerCase(),email.direction,new Date(email.occurredAt).toISOString(),email.from,email.to,email.cc,email.subject,email.body,email.bodyTruncated?1:0,now));
 // Conditional parent update shares the same transaction as the message inserts.
 statements.push(db.prepare(`UPDATE applications SET last_import_at=?,updated_at=?,revision=revision+1 WHERE id=? AND owner_id=? AND EXISTS(SELECT 1 FROM application_emails WHERE application_id=? AND id IN (${rowIds.map(()=>'?').join(',')}))`).bind(now,now,applicationId,owner,applicationId,...rowIds));
 let result:D1Result[];try{result=await db.batch(statements);}catch(error){if(String(error).includes('email_application_conflict'))throw new CollectionError('Diese Gmail-Nachricht ist bereits einer anderen Einrichtung zugeordnet.',409);throw error;}const imported=result.slice(0,-1).reduce((n,r)=>n+Number(r.meta.changes||0),0);
 return {...await getApplication(db,owner,{applicationId}),imported,duplicates:action.messages.length-imported};
}
