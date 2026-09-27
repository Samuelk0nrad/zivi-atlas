import {z} from 'zod';
import {MAX_ATTACHMENT_BYTES,MAX_ATTACHMENTS,MAX_DRAFT_BYTES,attachmentListSchema,attachmentActionSchema,type DraftAttachment} from '../attachment-contract';
import {CollectionError} from './collections';
const columns='f.id,f.draft_id AS draftId,f.filename,f.content_type AS contentType,f.size,f.created_at AS createdAt';
const types:Record<string,string>={pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',odt:'application/vnd.oasis.opendocument.text',rtf:'application/rtf',txt:'text/plain',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
const scope=z.object({draftId:z.string().uuid(),expectedRevision:z.number().int().positive()}).strict();
function metadata(filename:string,size:number){
 const name=filename.normalize('NFC').trim();
 if(!name||name.length>160||/[\x00-\x1f\x7f/\\]/.test(name))throw new CollectionError('Bitte einen Dateinamen ohne Sonder-Steuerzeichen verwenden (max. 160 Zeichen).');
 const contentType=types[name.split('.').at(-1)!.toLowerCase()];if(!contentType)throw new CollectionError('Unterstützt: PDF, Word, ODT, RTF, Text, JPG, PNG und WebP.');
 if(size<1||size>MAX_ATTACHMENT_BYTES)throw new CollectionError('Eine Datei muss zwischen 1 Byte und 5 MB groß sein.',413);
 return{filename:name,contentType,size};
}
function storage(bucket:R2Bucket|undefined){if(!bucket)throw new CollectionError('Dateispeicher gerade nicht erreichbar. Bitte erneut versuchen.',503);return bucket;}
export async function listAttachments(db:D1Database,owner:string,input:unknown={}){
 const p=attachmentListSchema.safeParse(input);if(!p.success)throw new CollectionError('Ungültige Anhangssuche.');const{draftId,limit,offset}=p.data;
 const where='f.owner_id=? AND d.owner_id=?'+(draftId?' AND f.draft_id=?':''),args=draftId?[owner,owner,draftId]:[owner,owner];
 const {results}=await db.prepare(`SELECT ${columns} FROM draft_attachments f JOIN email_drafts d ON d.id=f.draft_id WHERE ${where} ORDER BY f.created_at,f.id LIMIT ? OFFSET ?`).bind(...args,limit,offset).all<DraftAttachment>();
 const count=await db.prepare(`SELECT COUNT(*) AS total FROM draft_attachments f JOIN email_drafts d ON d.id=f.draft_id WHERE ${where}`).bind(...args).first<{total:number}>();
 return{attachments:results.map(f=>({...f,downloadUrl:`/api/draft-attachments/${f.id}`})),total:count?.total||0,offset};
}
export async function readAttachment(db:D1Database,bucket:R2Bucket|undefined,owner:string,id:string){
 if(!z.string().uuid().safeParse(id).success)throw new CollectionError('Ungültiger Anhang.');
 const file=await db.prepare(`SELECT ${columns},f.object_key AS objectKey FROM draft_attachments f JOIN email_drafts d ON d.id=f.draft_id WHERE f.id=? AND f.owner_id=? AND d.owner_id=?`).bind(id,owner,owner).first<DraftAttachment&{objectKey:string}>();if(!file)throw new CollectionError('Anhang nicht gefunden.',404);
 let object:R2ObjectBody|null;try{object=await storage(bucket).get(file.objectKey);}catch{throw new CollectionError('Dateispeicher gerade nicht erreichbar. Bitte erneut versuchen.',503);}if(!object)throw new CollectionError('Datei gerade nicht verfügbar. Bitte erneut versuchen.',503);return{file,object};
}
/** Removed metadata remains until its private blob has been successfully deleted. */
export async function cleanupAttachments(db:D1Database,bucket:R2Bucket|undefined,owner:string){
 if(!bucket)return;const{results}=await db.prepare('SELECT id,object_key AS objectKey FROM draft_attachments WHERE owner_id=? AND draft_id IS NULL LIMIT 20').bind(owner).all<{id:string;objectKey:string}>();
 for(const file of results){try{await bucket.delete(file.objectKey);await db.prepare('DELETE FROM draft_attachments WHERE id=? AND owner_id=? AND draft_id IS NULL').bind(file.id,owner).run();}catch{console.error('Private draft attachment cleanup deferred.');}}
}
export async function uploadAttachment(db:D1Database,bucket:R2Bucket|undefined,owner:string,input:unknown,filename:string,bytes:ArrayBuffer){
 const p=scope.safeParse(input);if(!p.success)throw new CollectionError('Ungültiger Entwurf oder Versionsstand.');const {draftId,expectedRevision}=p.data,meta=metadata(filename,bytes.byteLength),r2=storage(bucket);
 const draft=await db.prepare('SELECT revision FROM email_drafts WHERE id=? AND owner_id=?').bind(draftId,owner).first<{revision:number}>();if(!draft)throw new CollectionError('Entwurf nicht gefunden.',404);if(draft.revision!==expectedRevision)throw new CollectionError('Der Entwurf wurde inzwischen geändert. Bitte neu laden.',409);
 const id=crypto.randomUUID(),key='draft-attachments/'+id,now=new Date().toISOString();
 try{await r2.put(key,bytes,{httpMetadata:{contentType:meta.contentType}});}catch{throw new CollectionError('Datei konnte nicht gespeichert werden. Bitte erneut versuchen.',503);}
 try{
  const result=await db.batch([
   db.prepare(`INSERT INTO draft_attachments(id,draft_id,owner_id,object_key,filename,content_type,size,created_at) SELECT ?,id,owner_id,?,?,?,?,? FROM email_drafts WHERE id=? AND owner_id=? AND revision=? AND (SELECT COUNT(*) FROM draft_attachments WHERE draft_id=?)<? AND (SELECT COALESCE(SUM(size),0) FROM draft_attachments WHERE draft_id=?)+?<=?`).bind(id,key,meta.filename,meta.contentType,meta.size,now,draftId,owner,expectedRevision,draftId,MAX_ATTACHMENTS,draftId,meta.size,MAX_DRAFT_BYTES),
   db.prepare('UPDATE email_drafts SET revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND EXISTS(SELECT 1 FROM draft_attachments WHERE id=? AND draft_id=?)').bind(now,draftId,owner,id,draftId),
  ]);
  if(!result[0].meta.changes)throw new CollectionError('Entwurf geändert oder Anhang-Limit erreicht (5 Dateien, insgesamt 15 MB). Bitte neu laden.',409);
 }catch(error){try{await r2.delete(key);}catch{await db.prepare('INSERT INTO draft_attachments(id,owner_id,object_key,filename,content_type,size,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,key,meta.filename,meta.contentType,meta.size,now).run();}throw error;}
 await cleanupAttachments(db,bucket,owner);return {attachmentId:id,draftId};
}
export async function mutateAttachment(db:D1Database,bucket:R2Bucket|undefined,owner:string,input:unknown){
 const p=attachmentActionSchema.safeParse(input);if(!p.success)throw new CollectionError('Ungültiger Anhang.');const action=p.data;
 if(action.action==='copy_draft_attachment'){const{file,object}=await readAttachment(db,bucket,owner,action.attachmentId);return uploadAttachment(db,bucket,owner,{draftId:action.draftId,expectedRevision:action.expectedRevision},file.filename,await object.arrayBuffer());}
 const result=await db.batch([
  db.prepare('UPDATE draft_attachments SET draft_id=NULL WHERE id=? AND draft_id=? AND owner_id=? AND EXISTS(SELECT 1 FROM email_drafts WHERE id=? AND owner_id=? AND revision=?)').bind(action.attachmentId,action.draftId,owner,action.draftId,owner,action.expectedRevision),
  db.prepare('UPDATE email_drafts SET revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=? AND changes()=1 AND EXISTS(SELECT 1 FROM draft_attachments WHERE id=? AND owner_id=? AND draft_id IS NULL)').bind(new Date().toISOString(),action.draftId,owner,action.expectedRevision,action.attachmentId,owner),
 ]);
 if(!result[0].meta.changes)throw new CollectionError('Anhang nicht gefunden oder Entwurf inzwischen geändert. Bitte neu laden.',409);
 await cleanupAttachments(db,bucket,owner);return{draftId:action.draftId,removed:true};
}
