import {draftActionSchema,draftGetSchema,draftListSchema,draftLinks,draftRecipient,type EmailDraft,type DraftSummary} from '../draft-contract';
import {type Organisation} from '../data';
import {listAttachments,cleanupAttachments} from './draft-attachments';
import {CollectionError} from './collections';

const columns='id,org_code AS organisationCode,org_title AS organisationTitle,recipient,subject,revision,created_at AS createdAt,updated_at AS updatedAt';
// SQLite lower() folds ASCII only; include German capitals in both operands.
const searchFold=(sql:string)=>`lower(replace(replace(replace(replace(${sql},'Ä','ä'),'Ö','ö'),'Ü','ü'),'ẞ','ß'))`;
export async function listDrafts(db:D1Database,owner:string,input:unknown={}){
  const parsed=draftListSchema.safeParse(input);if(!parsed.success)throw new CollectionError('Ungültige Entwurfssuche.');
  const {organisationCode,query,limit,offset}=parsed.data,args:unknown[]=[owner];
  let where='owner_id=?';if(organisationCode!==undefined){where+=' AND org_code=?';args.push(organisationCode);}
  if(query){where+=` AND instr(${searchFold("subject||' '||org_title||' '||recipient")},${searchFold('?')})>0`;args.push(query);}
  const {results}=await db.prepare(`SELECT ${columns} FROM email_drafts WHERE ${where} ORDER BY updated_at DESC,id LIMIT ? OFFSET ?`).bind(...args,limit,offset).all<DraftSummary>();
  const count=await db.prepare(`SELECT COUNT(*) AS total FROM email_drafts WHERE ${where}`).bind(...args).first<{total:number}>();
  return {drafts:results,total:count?.total||0,offset};
}
export async function getDraft(db:D1Database,owner:string,input:unknown){
  const parsed=draftGetSchema.safeParse(input);if(!parsed.success)throw new CollectionError('Ungültiger Entwurf.');
  const draft=await db.prepare(`SELECT ${columns},body FROM email_drafts WHERE id=? AND owner_id=?`).bind(parsed.data.draftId,owner).first<EmailDraft>();
  if(!draft)throw new CollectionError('Entwurf nicht gefunden.',404);
  draft.attachments=(await listAttachments(db,owner,{draftId:draft.id})).attachments;
  return {draft,...draftLinks(draft)};
}
export async function mutateDraft(db:D1Database,owner:string,input:unknown,loadCatalog:()=>Promise<{content:Organisation[]}>,bucket?:R2Bucket){
  const parsed=draftActionSchema.safeParse(input);if(!parsed.success)throw new CollectionError(parsed.error.issues[0]?.message||'Ungültiger Entwurf.');
  const action=parsed.data,now=new Date().toISOString();
  if(action.action==='create_email_draft'){
    let org:Organisation|undefined;
    if(action.organisationCode!==undefined){org=(await loadCatalog()).content.find(o=>o.code===action.organisationCode);if(!org)throw new CollectionError('Einrichtung nicht gefunden. Bitte zuerst nach der Einrichtung suchen.');}
    const official=draftRecipient.safeParse(org?.email||'');
    const recipient=action.recipient??(official.success?official.data:'');
    const subject=action.subject??(org?`Anfrage zum Zivildienst – ${org.title}`.slice(0,200).replace(/[\r\n\x00]/g,' '):'');
    const id=crypto.randomUUID();
    await db.prepare('INSERT INTO email_drafts(id,owner_id,org_code,org_title,recipient,subject,body,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?)').bind(id,owner,org?.code??null,org?.title||'',recipient,subject,action.body,now,now).run();
    return getDraft(db,owner,{draftId:id});
  }
  const statement=action.action==='delete_email_draft'
    ?db.prepare('DELETE FROM email_drafts WHERE id=? AND owner_id=? AND revision=?').bind(action.draftId,owner,action.expectedRevision)
    :db.prepare('UPDATE email_drafts SET recipient=?,subject=?,body=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=?').bind(action.recipient,action.subject,action.body,now,action.draftId,owner,action.expectedRevision);
  const result=await statement.run();
  if(!result.meta.changes){
    const exists=await db.prepare('SELECT id FROM email_drafts WHERE id=? AND owner_id=?').bind(action.draftId,owner).first();
    throw new CollectionError(exists?'Dieser Entwurf wurde inzwischen geändert. Bitte die aktuelle Version laden; dein Text bleibt erhalten.':'Entwurf nicht gefunden.',exists?409:404);
  }
  if(action.action==='delete_email_draft')await cleanupAttachments(db,bucket,owner);
  return action.action==='delete_email_draft'?{draftId:action.draftId,deleted:true}:getDraft(db,owner,{draftId:action.draftId});
}
