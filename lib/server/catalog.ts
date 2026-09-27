import snapshot from '@/public/data/snapshot.json';
import {type Dataset,category,filterPlaces,flatten,matchingSlots,isoDate,regions,categories} from '@/lib/data';
import {searchSchema} from '@/lib/collection-contract';

const endpoint='https://www.zivildienst.gv.at/.rest/zisa/organisations/v1?limit=0&availableSlots=false';
let cached:{data:Dataset;at:number}|null=null;
let pending:Promise<Dataset>|null=null;
export async function getCatalog():Promise<Dataset>{
  if(cached&&Date.now()-cached.at<300000)return cached.data;
  if(!pending)pending=(async()=>{
    try{
      const response=await fetch(endpoint,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error('Source unavailable');
      const value=await response.json() as Dataset;
      if(!Array.isArray(value.content)||value.content.length!==value.totalCount||!value.lastUpdated)throw new Error('Incomplete source');
      const data={...value,source:'live'};cached={data,at:Date.now()};return data;
    }catch{
      const data={...snapshot,source:'snapshot'} as Dataset;
      cached={data,at:Date.now()-240000};return data;
    }
  })().finally(()=>{pending=null;});
  return pending;
}
export async function searchOrganisations(input:unknown){
  const f=searchSchema.parse(input);
  if(f.region!=='all'&&!(f.region in regions))throw new Error('Unbekanntes Bundesland.');
  if(f.branch!=='all'&&!(f.branch in categories))throw new Error('Unbekannter Tätigkeitsbereich.');
  if(f.from!=='all'&&f.until!=='all'&&f.from>f.until)throw new Error('Der Endmonat darf nicht vor dem Startmonat liegen.');
  const data=await getCatalog();const places=filterPlaces(flatten(data),f);
  const organisations=[...new Map(places.map(p=>[p.org.code,p.org])).values()];
  return {total:organisations.length,offset:f.offset,source:data.source,lastUpdated:data.lastUpdated,organisations:organisations.slice(f.offset,f.offset+f.limit).map(o=>({code:o.code,title:o.title,activity:o.activity,category:category(o),city:o.address.city,website:o.homepage,email:o.email,contactName:o.name,phone:o.phone,locations:o.agencies.map(a=>({name:a.name,city:a.address.city,zipCode:a.address.zipCode,address:a.address.address})),dates:matchingSlots(o,f).map(s=>({date:isoDate(s.date),available:s.available,capacity:s.capacity}))}))};
}
