import {z} from 'zod';

export type CollectionItem={code:number;title:string;branch:string;city:string;addedAt:string};
export type Collection={id:string;name:string;createdAt:string;updatedAt:string;items:CollectionItem[]};
const collectionId=z.string().uuid();
const name=z.string().trim().min(1,'Bitte einen Namen eingeben.').max(80,'Maximal 80 Zeichen.');
const codes=z.array(z.number().int().positive()).min(1).max(100).transform(values=>[...new Set(values)]);
export const collectionActionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('create_collection'),name,organisationCodes:codes.optional()}).strict(),
  z.object({action:z.literal('rename_collection'),collectionId,name}).strict(),
  z.object({action:z.literal('delete_collection'),collectionId}).strict(),
  z.object({action:z.literal('add_to_collection'),collectionId,organisationCodes:codes}).strict(),
  z.object({action:z.literal('remove_from_collection'),collectionId,organisationCodes:codes}).strict(),
]);
export type CollectionAction=z.infer<typeof collectionActionSchema>;
export const searchSchema=z.object({query:z.string().max(200).default(''),region:z.string().default('all'),branch:z.string().default('all'),from:z.string().regex(/^(all|\d{4}-(0[1-9]|1[0-2]))$/).default('all'),until:z.string().regex(/^(all|\d{4}-(0[1-9]|1[0-2]))$/).default('all'),freeOnly:z.boolean().default(false),limit:z.number().int().min(1).max(100).default(30),offset:z.number().int().min(0).default(0)}).strict();
