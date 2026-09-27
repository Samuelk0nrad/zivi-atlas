import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultFilters,flatten,filterPlaces,groupPlaces} from '../lib/data.ts';

const agency=(city,region='VIENNA')=>({name:'Standort',address:{address:'Hauptstraße 1',zipCode:'1000',city,region},location:{latitude:48,longitude:16}});
const organisation=(code,agencies)=>({code,title:'Gleicher Einrichtungsname',branchCode:'3a',agencies,slots:[{date:[2030,1,1],capacity:4,used:1,available:3}]});
const dataset=(...content)=>({content,totalCount:content.length,lastUpdated:0});

test('equal institution and location names retain distinct official identities',()=>{
  const places=flatten(dataset(organisation(101,[agency('Wien'),agency('Wien')]),organisation(102,[agency('Wien')])));
  const groups=groupPlaces(places);
  assert.deepEqual(groups.map(group=>[group.org.code,group.places.map(place=>place.id)]),[[101,['101-0','101-1']],[102,['102-0']]]);
  assert.equal(groups[0].places[1],places[1]);
});

test('grouping filtered matches does not restore excluded locations or change their IDs',()=>{
  const places=flatten(dataset(organisation(101,[agency('Graz','STYRIA'),agency('Wien'),agency('Wien')])));
  for(const filters of [{...defaultFilters,region:'VIENNA'},{...defaultFilters,query:'Wien',freeOnly:true,from:'2030-01',until:'2030-01'}]){
    const [group]=groupPlaces(filterPlaces(places,filters,'2029-01-01'));
    assert.deepEqual(group.places.map(place=>place.id),['101-1','101-2']);
    assert.equal(group.org.agencies.length,3);
    assert.equal(group.org.slots[0].available,3);
  }
  assert.deepEqual(groupPlaces(filterPlaces(places,{...defaultFilters,query:'Unbekannt'},'2029-01-01')),[]);
});

test('a page of institutions keeps a large institution together',()=>{
  const first=organisation(101,Array.from({length:153},()=>agency('Wien')));
  const groups=groupPlaces(flatten(dataset(first,organisation(102,[agency('Wien')]))));
  const page=groups.slice(0,1);
  assert.equal(page.length,1);
  assert.equal(page[0].places.length,153);
  assert.equal(groups[1].places[0].id,'102-0');
});
