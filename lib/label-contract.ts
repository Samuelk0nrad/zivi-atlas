import {z} from 'zod';

export const labelColors=['blue','green','orange','red','purple','gray'] as const;
export type LabelColor=typeof labelColors[number];
export const labelColorNames:Record<LabelColor,string>={blue:'Blau',green:'Grün',orange:'Orange',red:'Rot',purple:'Violett',gray:'Grau'};
export type InstitutionLabel={id:string;name:string;color:LabelColor;organisationCodes:number[];createdAt:string;updatedAt:string};
const labelId=z.string().uuid();
const name=z.string().trim().min(1,'Bitte einen Namen eingeben.').max(40,'Maximal 40 Zeichen.');
const color=z.enum(labelColors);
const codes=z.array(z.number().int().positive()).min(1).max(100).transform(values=>[...new Set(values)]);
export const labelActionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('create_label'),name,color:color.default('blue'),organisationCodes:codes.optional()}).strict(),
  z.object({action:z.literal('update_label'),labelId,name,color}).strict(),
  z.object({action:z.literal('delete_label'),labelId}).strict(),
  z.object({action:z.literal('assign_label'),labelId,organisationCodes:codes}).strict(),
  z.object({action:z.literal('remove_label'),labelId,organisationCodes:codes}).strict(),
]);
export type LabelAction=z.infer<typeof labelActionSchema>;
