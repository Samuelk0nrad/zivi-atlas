import {labelActionSchema,type InstitutionLabel,type LabelColor} from '../label-contract';
import {type Organisation} from '../data';
import {CollectionError} from './collections';

type Row={id:string;name:string;color:LabelColor;created_at:string;updated_at:string;org_code:number|null};
export async function listLabels(db:D1Database,owner:string):Promise<InstitutionLabel[]>{
  const{results}=await db.prepare('SELECT l.id,l.name,l.color,l.created_at,l.updated_at,i.org_code FROM labels l LEFT JOIN label_items i ON l.id=i.label_id WHERE l.owner_id=? ORDER BY l.name_key,l.id,i.org_code').bind(owner).all<Row>();
  const labels=new Map<string,InstitutionLabel>();
  for(const row of results){
    if(!labels.has(row.id))labels.set(row.id,{id:row.id,name:row.name,color:row.color,organisationCodes:[],createdAt:row.created_at,updatedAt:row.updated_at});
    if(row.org_code!==null)labels.get(row.id)!.organisationCodes.push(row.org_code);
  }
  return [...labels.values()];
}

export async function mutateLabel(db:D1Database,owner:string,input:unknown,loadCatalog:()=>Promise<{content:Organisation[]}>){
  const parsed=labelActionSchema.safeParse(input);
  if(!parsed.success)throw new CollectionError(parsed.error.issues[0]?.message||'Ungültige Eingabe.');
  const action=parsed.data,now=new Date().toISOString();
  const id=action.action==='create_label'?crypto.randomUUID():action.labelId;
  if(action.action!=='create_label'&&!await db.prepare('SELECT id FROM labels WHERE id=? AND owner_id=?').bind(id,owner).first())throw new CollectionError('Label nicht gefunden.',404);
  const codes=action.action==='assign_label'||action.action==='create_label'?action.organisationCodes||[]:[];
  if(codes.length){
    const valid=new Set((await loadCatalog()).content.map(o=>o.code));
    if(codes.some(code=>!valid.has(code)))throw new CollectionError('Eine Einrichtungsnummer ist unbekannt. Bitte zuerst nach der Einrichtung suchen.');
  }
  const statements:D1PreparedStatement[]=[];
  if(action.action==='create_label'||action.action==='update_label'){
    const nameKey=action.name.normalize('NFKC').toLocaleLowerCase('de-AT');
    if(await db.prepare('SELECT id FROM labels WHERE owner_id=? AND name_key=? AND id<>?').bind(owner,nameKey,id).first())throw new CollectionError('Ein Label mit diesem Namen existiert bereits.',409);
    if(action.action==='create_label')statements.push(db.prepare('INSERT INTO labels(id,owner_id,name,name_key,color,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,action.name,nameKey,action.color,now,now));
    else statements.push(db.prepare('UPDATE labels SET name=?,name_key=?,color=?,updated_at=? WHERE id=? AND owner_id=?').bind(action.name,nameKey,action.color,now,id,owner));
  }
  if(action.action==='delete_label')statements.push(db.prepare('DELETE FROM labels WHERE id=? AND owner_id=?').bind(id,owner));
  if(action.action==='remove_label')for(const code of action.organisationCodes)statements.push(db.prepare('DELETE FROM label_items WHERE label_id=? AND org_code=? AND EXISTS(SELECT 1 FROM labels WHERE id=? AND owner_id=?)').bind(id,code,id,owner));
  for(const code of codes)statements.push(db.prepare('INSERT INTO label_items(label_id,org_code,added_at) SELECT id,?,? FROM labels WHERE id=? AND owner_id=? ON CONFLICT(label_id,org_code) DO NOTHING').bind(code,now,id,owner));
  if(action.action==='assign_label'||action.action==='remove_label')statements.push(db.prepare('UPDATE labels SET updated_at=? WHERE id=? AND owner_id=?').bind(now,id,owner));
  let results;
  try{results=await db.batch(statements);}catch(error){
    if(error instanceof Error&&/UNIQUE constraint failed: labels.owner_id, labels.name_key/i.test(error.message))throw new CollectionError('Ein Label mit diesem Namen existiert bereits.',409);
    throw error;
  }
  if(action.action!=='create_label'&&!results[results.length-1]?.meta.changes)throw new CollectionError('Label nicht gefunden.',404);
  return{labelId:id,deleted:action.action==='delete_label',labels:await listLabels(db,owner)};
}
