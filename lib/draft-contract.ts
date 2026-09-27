import {z} from 'zod';
import {type DraftAttachment} from './attachment-contract';

const singleLine=(max:number)=>z.string().trim().max(max).refine(value=>!/[\r\n\x00]/.test(value),'Bitte nur eine Zeile eingeben.');
export const draftRecipient=singleLine(254).refine(value=>value===''||z.string().email().safeParse(value).success,'Bitte eine gültige E-Mail-Adresse eingeben.');
const subject=singleLine(200),body=z.string().max(8000,'Maximal 8.000 Zeichen.').refine(value=>!value.includes('\0'),'Ungültiges Zeichen im Text.');
const draftId=z.string().uuid(),expectedRevision=z.number().int().positive();
export const draftListSchema=z.object({query:z.string().trim().max(120).default(''),state:z.enum(['active','sent']).default('active'),organisationCode:z.number().int().positive().optional(),limit:z.number().int().min(1).max(100).default(100),offset:z.number().int().min(0).max(100000).default(0)}).strict();
export const draftGetSchema=z.object({draftId}).strict();
export const draftActionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('create_email_draft'),organisationCode:z.number().int().positive().optional(),recipient:draftRecipient.optional(),subject:subject.optional(),body:body.default('')}).strict(),
  z.object({action:z.literal('update_email_draft'),draftId,expectedRevision,recipient:draftRecipient,subject,body}).strict(),
  z.object({action:z.literal('delete_email_draft'),draftId,expectedRevision}).strict(),
  z.object({action:z.literal('mark_email_draft_sent'),draftId,expectedRevision}).strict(),
]);
export type EmailDraft={state:'active'|'pending'|'sent'|'archived';sentAt:string|null;attachments:DraftAttachment[];id:string;organisationCode:number|null;organisationTitle:string;recipient:string;subject:string;body:string;revision:number;createdAt:string;updatedAt:string};
export type DraftSummary=Omit<EmailDraft,'body'|'attachments'>;
export type DraftFields=Pick<EmailDraft,'recipient'|'subject'|'body'>;
export type DraftAction=z.infer<typeof draftActionSchema>;

/** Handoff URLs only open a composer. They never send mail or imply delivery. */
export function draftLinks(draft:DraftFields&{id?:string}){
  const recipient=draftRecipient.parse(draft.recipient),title=subject.parse(draft.subject),text=body.parse(draft.body);
  const encoded=(value:string)=>encodeURIComponent(new TextDecoder().decode(new TextEncoder().encode(value)));
  const normalized=text.replace(/\r\n|\r|\n/g,'\r\n');
  return{
    mailtoUrl:`mailto:${encoded(recipient).replace(/%40/g,'@')}?subject=${encoded(title)}&body=${encoded(normalized)}`,
    gmailUrl:`https://mail.google.com/mail/?view=cm&fs=1&to=${encoded(recipient)}&su=${encoded(title)}&body=${encoded(text)}`,
    ...(draft.id?{exportUrl:`/api/drafts/${encoded(draft.id)}/export`,draftUrl:`/?draft=${encoded(draft.id)}`}:{})
  };
}
