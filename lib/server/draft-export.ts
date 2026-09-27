import {z} from 'zod';
import {CollectionError} from './collections';
import {getDraft} from './drafts';
import {readAttachment} from './draft-attachments';
import {buildDraftMime} from './draft-mime';

const exportSchema=z.object({draftId:z.string().uuid(),expectedRevision:z.number().int().positive().optional()}).strict();

export async function exportDraftMime(db:D1Database,bucket:R2Bucket|undefined,owner:string,input:unknown){
  const parsed=exportSchema.safeParse(input);
  if(!parsed.success)throw new CollectionError('Ungültiger Entwurf.');
  const {draftId,expectedRevision}=parsed.data;
  const {draft}=await getDraft(db,owner,{draftId});
  const conflict=()=>new CollectionError('Dieser Entwurf wurde inzwischen geändert. Bitte die aktuelle Version laden.',409);
  if(expectedRevision!==undefined&&draft.revision!==expectedRevision)throw conflict();
  const files=[];
  for(const attachment of draft.attachments){
    const {file,object}=await readAttachment(db,bucket,owner,attachment.id);
    files.push({filename:file.filename,contentType:file.contentType,bytes:new Uint8Array(await object.arrayBuffer())});
  }
  // A concurrent edit or attachment removal must not produce a mixed snapshot.
  const current=await getDraft(db,owner,{draftId});
  if(current.draft.revision!==draft.revision)throw conflict();
  return {mime:buildDraftMime(draft,files),revision:draft.revision,owner};
}
