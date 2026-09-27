import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './d1-test-helper.mjs';
import {listCollections,mutateCollection} from '../lib/server/collections.ts';

const orgs=[{code:70193,title:'Sozialzentrum Zirl',branchCode:'3d',branch:'Altenbetreuung',address:{city:'Zirl'}},{code:999,title:'Test Rettung',branchCode:'2',branch:'Rettungswesen',address:{city:'Graz'}}];
const catalog=async()=>({content:orgs});
test('save and deduplicate whole institutions, preserve entries through rename and remove',async()=>{
  const{db,sql}=database();const created=await mutateCollection(db,'alice',{action:'create_collection',name:'  Favoriten  ',organisationCodes:[70193,70193]},catalog);const id=created.collectionId;
  assert.equal(created.collections[0].name,'Favoriten');assert.equal(created.collections[0].items.length,1);
  await mutateCollection(db,'alice',{action:'add_to_collection',collectionId:id,organisationCodes:[70193,999]},catalog);
  await mutateCollection(db,'alice',{action:'rename_collection',collectionId:id,name:'Bewerbungen'},catalog);
  const saved=await listCollections(db,'alice');assert.equal(saved[0].name,'Bewerbungen');assert.deepEqual(saved[0].items.map(i=>i.code).sort((a,b)=>a-b),[999,70193]);
  await mutateCollection(db,'alice',{action:'remove_from_collection',collectionId:id,organisationCodes:[999]},catalog);assert.equal((await listCollections(db,'alice'))[0].items[0].code,70193);sql.close();
});
test('another account cannot list or mutate a collection even with its exact ID',async()=>{
  const{db,sql}=database();const{collectionId}=await mutateCollection(db,'alice',{action:'create_collection',name:'Privat',organisationCodes:[70193]},catalog);
  assert.deepEqual(await listCollections(db,'bob'),[]);
  for(const action of[{action:'rename_collection',name:'stolen'},{action:'add_to_collection',organisationCodes:[999]},{action:'remove_from_collection',organisationCodes:[70193]},{action:'delete_collection'}])await assert.rejects(mutateCollection(db,'bob',{...action,collectionId},catalog),e=>e.status===404);
  const [saved]=await listCollections(db,'alice');assert.equal(saved.name,'Privat');assert.equal(saved.items.length,1);sql.close();
});
test('invalid input and unknown codes leave no partial collection',async()=>{
  const{db,sql}=database();for(const input of[{action:'create_collection',name:'  '},{action:'create_collection',name:'Unknown',organisationCodes:[70193,123]},{action:'create_collection',name:'Hijack',ownerId:'bob'},{action:'create_collection',name:'Bulk',organisationCodes:Array(101).fill(70193)}])await assert.rejects(mutateCollection(db,'alice',input,catalog));assert.deepEqual(await listCollections(db,'alice'),[]);sql.close();
});
test('deleting one collection cascades its memberships but preserves another collection',async()=>{
  const{db,sql}=database();const a=await mutateCollection(db,'alice',{action:'create_collection',name:'A',organisationCodes:[70193]},catalog);const b=await mutateCollection(db,'alice',{action:'create_collection',name:'B',organisationCodes:[70193]},catalog);
  await mutateCollection(db,'alice',{action:'delete_collection',collectionId:a.collectionId},catalog);const [saved]=await listCollections(db,'alice');assert.equal(saved.id,b.collectionId);assert.equal(saved.items.length,1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM collection_items').get().n,1);sql.close();
});
test('collection deleted while catalog is loading returns 404 instead of false success',async()=>{
  const{db,sql}=database();const{collectionId}=await mutateCollection(db,'alice',{action:'create_collection',name:'Race'},catalog);
  await assert.rejects(mutateCollection(db,'alice',{action:'add_to_collection',collectionId,organisationCodes:[70193]},async()=>{sql.prepare('DELETE FROM collections WHERE id=?').run(collectionId);return catalog();}),e=>e.status===404);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM collection_items').get().n,0);sql.close();
});
