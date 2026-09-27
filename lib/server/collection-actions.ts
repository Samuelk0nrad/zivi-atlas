import {z} from 'zod';
import {attachmentTools} from '../attachment-contract';
import {listAttachments,mutateAttachment} from './draft-attachments';
import {applicationTools} from '../application-tools';
import {listApplications,getApplication,mutateApplication} from './applications';
import {collectionTools} from '../collection-tools';
import {labelTools} from '../label-tools';
import {draftTools} from '../draft-tools';
import {listDrafts,getDraft,mutateDraft} from './drafts';
import {listLabels,mutateLabel} from './labels';
import {listCollections,mutateCollection,CollectionError} from './collections';
import {getCatalog,searchOrganisations} from './catalog';

const callSchema=z.object({tool:z.string(),arguments:z.record(z.unknown())}).strict();

/** Shared by the dashboard and authenticated MCP callers. Identity is never an input argument. */
export async function runCollectionTool(db:D1Database,owner:string,input:unknown,bucket?:R2Bucket){
  const parsed=callSchema.safeParse(input);
  if(!parsed.success)throw new CollectionError('Ungültiger Tool-Aufruf.');
  const payload=parsed.data;
  if('action' in payload.arguments)throw new CollectionError('Unbekanntes Argument.');
  if(![...collectionTools,...labelTools,...draftTools,...applicationTools,...attachmentTools].some(tool=>tool.name===payload.tool))throw new CollectionError('Unbekanntes Tool.');
  if(payload.tool==='list_draft_attachments')return listAttachments(db,owner,payload.arguments);
  if(attachmentTools.some(tool=>tool.name===payload.tool)){const result=await mutateAttachment(db,bucket,owner,{...payload.arguments,action:payload.tool});return getDraft(db,owner,{draftId:result.draftId});}
  if(payload.tool==='list_applications')return listApplications(db,owner,payload.arguments);
  if(payload.tool==='get_application')return getApplication(db,owner,payload.arguments);
  if(applicationTools.some(tool=>tool.name===payload.tool))return mutateApplication(db,owner,{...payload.arguments,action:payload.tool},getCatalog);
  if(payload.tool==='list_email_drafts')return listDrafts(db,owner,payload.arguments);
  if(payload.tool==='get_email_draft')return getDraft(db,owner,payload.arguments);
  if(draftTools.some(tool=>tool.name===payload.tool))return mutateDraft(db,owner,{...payload.arguments,action:payload.tool},getCatalog,bucket);
  if(payload.tool==='list_labels'){
    if(Object.keys(payload.arguments).length)throw new CollectionError('Keine Argumente erwartet.');
    return{labels:await listLabels(db,owner)};
  }
  if(labelTools.some(tool=>tool.name===payload.tool))return mutateLabel(db,owner,{...payload.arguments,action:payload.tool},getCatalog);
  if(payload.tool==='list_collections'){
    if(Object.keys(payload.arguments).length)throw new CollectionError('Keine Argumente erwartet.');
    return{collections:await listCollections(db,owner)};
  }
  if(payload.tool==='search_einrichtungen'){
    try{return await searchOrganisations(payload.arguments);}
    catch(error){throw new CollectionError(error instanceof Error?error.message:'Ungültige Suche.');}
  }
  return mutateCollection(db,owner,{...payload.arguments,action:payload.tool},getCatalog);
}
