import {labelColors} from './label-contract';
const id={type:'string',format:'uuid'},name={type:'string',minLength:1,maxLength:40},color={type:'string',enum:labelColors};
const codes={type:'array',items:{type:'integer',minimum:1},minItems:1,maxItems:100};
const schema=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
export const labelTools=[
  {name:'list_labels',title:'Labels anzeigen',description:'List the connected user’s personal labels, colors and assigned Einrichtung codes. Labels apply to the entire Einrichtung across all its Einsatzorte and collections.',inputSchema:schema({}),readOnly:true},
  {name:'create_label',title:'Label anlegen',description:'Create a personal label, optionally assigning up to 100 verified Einrichtungen. Names are unique per account; use list_labels to reuse an existing label.',inputSchema:schema({name,color,organisationCodes:codes},['name']),readOnly:false},
  {name:'update_label',title:'Label bearbeiten',description:'Change a label’s name and color while preserving every assigned Einrichtung.',inputSchema:schema({labelId:id,name,color},['labelId','name','color']),readOnly:false},
  {name:'delete_label',title:'Label löschen',description:'Delete one personal label and its assignments. Preserves Einrichtungen and collections. Only use when the user asks to delete that label.',inputSchema:schema({labelId:id},['labelId']),readOnly:false},
  {name:'assign_label',title:'Label zuweisen',description:'Assign a label to up to 100 verified Einrichtung codes. Existing assignments and other labels are preserved; duplicates are ignored. Search Einrichtungen first to obtain their codes.',inputSchema:schema({labelId:id,organisationCodes:codes},['labelId','organisationCodes']),readOnly:false},
  {name:'remove_label',title:'Label entfernen',description:'Remove this label from specified Einrichtung codes, preserving the label itself, other labels and collections.',inputSchema:schema({labelId:id,organisationCodes:codes},['labelId','organisationCodes']),readOnly:false},
];
