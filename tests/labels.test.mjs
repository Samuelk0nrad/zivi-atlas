import test from 'node:test';
import assert from 'node:assert/strict';
import {listLabels,mutateLabel} from '../lib/server/labels.ts';
import {listCollections,mutateCollection} from '../lib/server/collections.ts';
import {database} from './d1-test-helper.mjs';
const catalog=async()=>({content:[{code:70193,title:'Zirl',branchCode:'3d',branch:'Altenbetreuung',address:{city:'Zirl'}},{code:999,title:'Graz',branchCode:'2',branch:'Rettung',address:{city:'Graz'}}]});

test('labels deduplicate assignments and preserve memberships across name and color changes',async()=>{
  const{db,sql}=database();try{
    const{labelId}=await mutateLabel(db,'alice',{action:'create_label',name:'  Interessant  ',color:'green',organisationCodes:[70193,70193]},catalog);
    await mutateLabel(db,'alice',{action:'assign_label',labelId,organisationCodes:[70193,999]},catalog);
    await mutateLabel(db,'alice',{action:'update_label',labelId,name:'Beworben',color:'blue'},catalog);
    const[label]=await listLabels(db,'alice');assert.equal(label.name,'Beworben');assert.equal(label.color,'blue');assert.deepEqual(label.organisationCodes,[999,70193]);
    await mutateLabel(db,'alice',{action:'remove_label',labelId,organisationCodes:[70193]},async()=>{throw new Error('Removal must not require current catalog membership');});
    assert.deepEqual((await listLabels(db,'alice'))[0].organisationCodes,[999]);
  }finally{sql.close();}
});
test('all label operations enforce account ownership even with an exact foreign ID',async()=>{
  const{db,sql}=database();try{
    const{labelId}=await mutateLabel(db,'alice',{action:'create_label',name:'Privat',color:'purple',organisationCodes:[70193]},catalog);
    assert.deepEqual(await listLabels(db,'bob'),[]);
    for(const action of[{action:'update_label',name:'Stolen',color:'red'},{action:'assign_label',organisationCodes:[999]},{action:'remove_label',organisationCodes:[70193]},{action:'delete_label'}])await assert.rejects(mutateLabel(db,'bob',{...action,labelId},catalog),error=>error.status===404);
    assert.deepEqual((await listLabels(db,'alice'))[0].organisationCodes,[70193]);
  }finally{sql.close();}
});
test('invalid labels and unknown codes never partially write; names are unique within an account',async()=>{
  const{db,sql}=database();try{
    for(const input of[{name:' '},{name:'A',color:'invalid'},{name:'A',ownerId:'bob'},{name:'A',organisationCodes:[70193,123]},{name:'A',organisationCodes:Array(101).fill(70193)}])await assert.rejects(mutateLabel(db,'alice',{action:'create_label',...input},catalog));
    assert.deepEqual(await listLabels(db,'alice'),[]);
    const{labelId}=await mutateLabel(db,'alice',{action:'create_label',name:'Beworben'},catalog);
    await assert.rejects(mutateLabel(db,'alice',{action:'create_label',name:' BEWORBEN '},catalog),error=>error.status===409);
    await mutateLabel(db,'bob',{action:'create_label',name:'Beworben'},catalog);
    await assert.rejects(mutateLabel(db,'alice',{action:'assign_label',labelId,organisationCodes:[70193,123]},catalog));
    assert.deepEqual((await listLabels(db,'alice'))[0].organisationCodes,[]);
  }finally{sql.close();}
});
test('labels survive collection deletion; deleting a label preserves other labels and collections',async()=>{
  const{db,sql}=database();try{
    const{collectionId}=await mutateCollection(db,'alice',{action:'create_collection',name:'Graz',organisationCodes:[999]},catalog);
    const a=await mutateLabel(db,'alice',{action:'create_label',name:'A',organisationCodes:[999]},catalog),b=await mutateLabel(db,'alice',{action:'create_label',name:'B',organisationCodes:[999]},catalog);
    await mutateLabel(db,'alice',{action:'delete_label',labelId:a.labelId},catalog);
    assert.equal((await listCollections(db,'alice'))[0].items.length,1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM label_items').get().n,1);
    await mutateCollection(db,'alice',{action:'delete_collection',collectionId},catalog);
    const[label]=await listLabels(db,'alice');assert.equal(label.id,b.labelId);assert.deepEqual(label.organisationCodes,[999]);
  }finally{sql.close();}
});
test('concurrent label deletion while checking catalog returns 404 without orphaned assignments',async()=>{
  const{db,sql}=database();try{
    const{labelId}=await mutateLabel(db,'alice',{action:'create_label',name:'Race'},catalog);
    await assert.rejects(mutateLabel(db,'alice',{action:'assign_label',labelId,organisationCodes:[999]},async()=>{sql.prepare('DELETE FROM labels WHERE id=?').run(labelId);return catalog();}),error=>error.status===404);
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM label_items').get().n,0);
  }finally{sql.close();}
});
