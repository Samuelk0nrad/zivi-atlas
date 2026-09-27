import {type Collection,collectionActionSchema} from '@/lib/collection-contract';
import {category,type Organisation} from '@/lib/data';

export class CollectionError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status;}}
type Row={id:string;name:string;created_at:string;updated_at:string;org_code:number|null;title:string|null;branch:string|null;city:string|null;added_at:string|null};
export async function listCollections(db:D1Database,owner:string):Promise<Collection[]>{
  const {results}=await db.prepare(`SELECT c.id,c.name,c.created_at,c.updated_at,i.org_code,i.title,i.branch,i.city,i.added_at FROM collections c LEFT JOIN collection_items i ON c.id=i.collection_id WHERE c.owner_id=? ORDER BY c.name COLLATE NOCASE,c.id,i.added_at,i.org_code`).bind(owner).all<Row>();
  const groups=new Map<string,Collection>();
  for(const r of results){if(!groups.has(r.id))groups.set(r.id,{id:r.id,name:r.name,createdAt:r.created_at,updatedAt:r.updated_at,items:[]});if(r.org_code!==null)groups.get(r.id)!.items.push({code:r.org_code,title:r.title!,branch:r.branch!,city:r.city!,addedAt:r.added_at!});}
  return [...groups.values()];
}
export async function mutateCollection(db:D1Database,owner:string,input:unknown,loadCatalog:()=>Promise<{content:Organisation[]}>) {
  const parsed=collectionActionSchema.safeParse(input);
  if(!parsed.success)throw new CollectionError(parsed.error.issues[0]?.message||'Ungültige Eingabe.');
  const action=parsed.data,now=new Date().toISOString();
  const id=action.action==='create_collection'?crypto.randomUUID():action.collectionId;
  if(action.action!=='create_collection'&&!await db.prepare('SELECT id FROM collections WHERE id=? AND owner_id=?').bind(id,owner).first())throw new CollectionError('Sammlung nicht gefunden.',404);
  let organisations:Organisation[]=[];
  if(action.action==='add_to_collection'||(action.action==='create_collection'&&action.organisationCodes)){
    const codes=action.organisationCodes!;const catalog=await loadCatalog();const byCode=new Map(catalog.content.map(o=>[o.code,o]));
    if(codes.some(code=>!byCode.has(code)))throw new CollectionError('Eine Einrichtungsnummer ist unbekannt. Bitte zuerst nach der Einrichtung suchen.');
    organisations=codes.map(code=>byCode.get(code)!);
  }
  const statements:D1PreparedStatement[]=[];
  if(action.action==='create_collection')statements.push(db.prepare('INSERT INTO collections(id,owner_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,owner,action.name,now,now));
  if(action.action==='rename_collection')statements.push(db.prepare('UPDATE collections SET name=?,updated_at=? WHERE id=? AND owner_id=?').bind(action.name,now,id,owner));
  if(action.action==='delete_collection')statements.push(db.prepare('DELETE FROM collections WHERE id=? AND owner_id=?').bind(id,owner));
  if(action.action==='remove_from_collection'){
    for(const code of action.organisationCodes)statements.push(db.prepare('DELETE FROM collection_items WHERE collection_id=? AND org_code=? AND EXISTS(SELECT 1 FROM collections WHERE id=? AND owner_id=?)').bind(id,code,id,owner));
  }
  for(const o of organisations)statements.push(db.prepare(`INSERT INTO collection_items(collection_id,org_code,title,branch,city,added_at) SELECT id,?,?,?,?,? FROM collections WHERE id=? AND owner_id=? ON CONFLICT(collection_id,org_code) DO NOTHING`).bind(o.code,o.title,category(o),o.address.city||'',now,id,owner));
  if(action.action==='add_to_collection'||action.action==='remove_from_collection')statements.push(db.prepare('UPDATE collections SET updated_at=? WHERE id=? AND owner_id=?').bind(now,id,owner));
  const results=await db.batch(statements);
  if(action.action!=='create_collection'&&!results[results.length-1]?.meta.changes)throw new CollectionError('Sammlung nicht gefunden.',404);
  const collections=await listCollections(db,owner);
  return{collectionId:id,deleted:action.action==='delete_collection',collections};
}
