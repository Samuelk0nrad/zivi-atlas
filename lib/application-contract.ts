import {z} from 'zod';
export const applicationStatuses={automatic:'Automatisch',planned:'Geplant',sent:'Warte auf Antwort',replied:'Antwort erhalten',interview:'Gespräch',accepted:'Zusage',rejected:'Absage',withdrawn:'Zurückgezogen'} as const;
export const applicationStatus=z.enum(['automatic','planned','sent','replied','interview','accepted','rejected','withdrawn']);
export const applicationNextActions={automatic:'Automatisch',action_required:'Aktion nötig',waiting:'Warten',done:'Erledigt'} as const;
export const applicationNextAction=z.enum(['automatic','action_required','waiting','done']);
export const applicationActionLabels={action_required:'Aktion nötig',waiting:'Warten',needs_review:'Zu prüfen',done:'Erledigt'} as const;
export type ApplicationNextAction=z.infer<typeof applicationNextAction>;
export type EffectiveNextAction=keyof typeof applicationActionLabels;
const id=z.string().uuid(),code=z.number().int().positive();
export const applicationListSchema=z.object({limit:z.number().int().min(1).max(100).default(100),offset:z.number().int().min(0).max(100000).default(0)}).strict();
export const applicationGetSchema=z.object({applicationId:id,limit:z.number().int().min(1).max(50).default(20),offset:z.number().int().min(0).max(100000).default(0)}).strict();
export const importedEmailSchema=z.object({messageId:z.string().regex(/^[a-f0-9]{8,32}$/i),threadId:z.string().regex(/^[a-f0-9]{8,32}$/i),direction:z.enum(['sent','received']),occurredAt:z.string().datetime({offset:true}),from:z.string().trim().min(1).max(1000),to:z.string().max(4000),cc:z.string().max(4000).default(''),subject:z.string().max(1000),body:z.string().max(20000),bodyTruncated:z.boolean(),gmailLabels:z.array(z.string().max(100)).max(40).optional()}).strict();
export const applicationActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('track_application'),organisationCode:code}).strict(),
 z.object({action:z.literal('update_application'),applicationId:id,expectedRevision:z.number().int().positive(),status:applicationStatus,notes:z.string().max(4000),nextAction:applicationNextAction.optional()}).strict(),
 z.object({action:z.literal('delete_application'),applicationId:id,expectedRevision:z.number().int().positive()}).strict(),
 z.object({action:z.literal('import_application_emails'),organisationCode:code,sourceAccount:z.string().email().max(254).transform(v=>v.toLowerCase()),messages:z.array(importedEmailSchema).min(1).max(5)}).strict(),
]);
export type ApplicationStatus=z.infer<typeof applicationStatus>;
export type Application={nextAction:ApplicationNextAction;effectiveNextAction:EffectiveNextAction;automaticNextAction:EffectiveNextAction;id:string;organisationCode:number;organisationTitle:string;contactEmail:string;status:ApplicationStatus;effectiveStatus:ApplicationStatus;notes:string;revision:number;createdAt:string;updatedAt:string;lastImportAt:string|null;lastMessageAt:string|null;messageCount:number};
export type ApplicationEmail=z.infer<typeof importedEmailSchema>&{id:string;sourceAccount:string;importedAt:string};
export function gmailMessageUrl(email:Pick<ApplicationEmail,'messageId'|'sourceAccount'>){return `https://mail.google.com/mail/?authuser=${encodeURIComponent(email.sourceAccount)}#all/${encodeURIComponent(email.messageId)}`;}
