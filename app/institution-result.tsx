'use client';
import {ChevronDown,ChevronRight,MapPin} from 'lucide-react';
import {Collapsible,CollapsibleContent,CollapsibleTrigger} from '@/components/ui/collapsible';
import {type Filters,type Organisation,type Place,type PlaceGroup,category,isoDate,matchingSlots} from '@/lib/data';
import {type InstitutionLabel} from '@/lib/label-contract';
import {type Application} from '@/lib/application-contract';
import {LabelChips,LabelInstitutionButton} from './labels';
import {SaveInstitutionButton} from './collections';
import {ApplicationBadge} from './applications';

export function PlaceRows({places,selectedId,onSelect}:{places:Place[];selectedId?:string;onSelect:(place:Place)=>void}){
  return <div className="place-rows">{places.map(place=><button key={place.id} className={'place-row '+(selectedId===place.id?'selected':'')} aria-label={`${place.agency.name.trim()}, ${[place.agency.address.address,place.agency.address.city].filter(Boolean).join(', ')} öffnen`} onClick={()=>onSelect(place)}>
    <MapPin size={17}/><span><strong>{place.agency.name.trim()}</strong><small>{[place.agency.address.address,[place.agency.address.zipCode,place.agency.address.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</small>{place.lat===null&&<small>Ohne Kartenposition</small>}</span><ChevronRight size={16}/>
  </button>)}</div>;
}

export function InstitutionResult({group,filters,expanded,onExpandedChange,selectedId,selectedOrganisationCode,labels,application,saved,onOrganisation,onPlace,onLabels,onSave}:{group:PlaceGroup;filters:Filters;expanded:boolean;onExpandedChange:(open:boolean)=>void;selectedId?:string;selectedOrganisationCode?:number;labels:InstitutionLabel[];application?:Application;saved:boolean;onOrganisation:(org:Organisation)=>void;onPlace:(place:Place)=>void;onLabels:(org:Organisation)=>void;onSave:(org:Organisation)=>void}){
  const {org,places}=group;
  const free=matchingSlots(org,filters).find(slot=>slot.available>0);
  const partial=places.length!==org.agencies.length;
  const count=partial?`${places.length} von ${org.agencies.length} Einsatzorten`:`${places.length} ${places.length===1?'Einsatzort':'Einsatzorte'}`;
  return <Collapsible className={'institution-result'+(selectedOrganisationCode===org.code?' selected':'')} open={expanded} onOpenChange={onExpandedChange}>
    <div className="institution-heading"><span className="card-category">{category(org)}</span><LabelInstitutionButton org={org} labeled={labels.length>0} onClick={onLabels}/><SaveInstitutionButton org={org} saved={saved} onSave={onSave}/></div>
    <button className="institution-overview" aria-label={`${org.title.trim()} – Einrichtung öffnen`} onClick={()=>onOrganisation(org)}>
      <span className="card-title"><h2>{org.title.trim()}</h2><ChevronRight size={18}/></span>
      <span className="card-bottom"><span className={free?'free-badge':'full-badge'}>{free?'Freie Plätze':'Kein freier Termin'}</span>{free&&<span>ab {new Intl.DateTimeFormat('de-AT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(isoDate(free.date)+'T12:00:00'))}</span>}</span>
      <LabelChips labels={labels}/><ApplicationBadge application={application}/>
    </button>
    <CollapsibleTrigger className="institution-toggle" aria-label={`${count} ${expanded?'einklappen':'anzeigen'}: ${org.title.trim()}`}><MapPin size={15}/><span>{count}</span><ChevronDown size={16}/></CollapsibleTrigger>
    <CollapsibleContent><PlaceRows places={places} selectedId={selectedId} onSelect={onPlace}/></CollapsibleContent>
  </Collapsible>;
}
