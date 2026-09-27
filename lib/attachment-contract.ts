import {z} from 'zod';
export const MAX_ATTACHMENT_BYTES=5*1024*1024,MAX_DRAFT_BYTES=15*1024*1024,MAX_ATTACHMENTS=5;
export type DraftAttachment={id:string;draftId:string;filename:string;contentType:string;size:number;createdAt:string;downloadUrl:string};
const id=z.string().uuid();
export const attachmentActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('remove_draft_attachment'),attachmentId:id,draftId:id,expectedRevision:z.number().int().positive()}).strict(),
 z.object({action:z.literal('copy_draft_attachment'),attachmentId:id,draftId:id,expectedRevision:z.number().int().positive()}).strict(),
]);
export const attachmentListSchema=z.object({draftId:id.optional(),limit:z.number().int().min(1).max(100).default(100),offset:z.number().int().min(0).max(100000).default(0)}).strict();
const object=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
const uuid={type:'string',format:'uuid'},revision={type:'integer',minimum:1};
export const attachmentTools=[
 {name:'list_draft_attachments',title:'Gespeicherte Anhänge anzeigen',description:'List private files already uploaded to Zivi Atlas drafts, optionally for one draft. Returns metadata and authenticated download links, never public URLs. Use copy_draft_attachment to reuse a CV. New files are uploaded by the user in the website.',inputSchema:object({draftId:uuid,limit:{type:'integer',minimum:1,maximum:100},offset:{type:'integer',minimum:0,maximum:100000}}),readOnly:true},
 {name:'copy_draft_attachment',title:'Gespeicherten Anhang übernehmen',description:'Copy an existing file owned by this user into another saved draft. Read the target draft first and pass expectedRevision. Copies real bytes privately; never sends email or attaches files to Gmail. Return the draft review/export link. Maximum 5 files, 5 MB each and 15 MB total.',inputSchema:object({attachmentId:uuid,draftId:uuid,expectedRevision:revision},['attachmentId','draftId','expectedRevision']),readOnly:false},
 {name:'remove_draft_attachment',title:'Anhang aus Entwurf entfernen',description:'Remove one file from this Zivi Atlas draft when requested. Requires the current draft expectedRevision. Other drafts and Gmail remain unchanged.',inputSchema:object({attachmentId:uuid,draftId:uuid,expectedRevision:revision},['attachmentId','draftId','expectedRevision']),readOnly:false},
];
