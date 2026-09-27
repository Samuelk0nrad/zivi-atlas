'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {flushSync} from 'react-dom';
import {Check,ChevronLeft,ChevronRight,Loader2,Pencil,Plus,Tag,Trash2,X} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogClose} from '@/components/ui/dialog';
import {labelColors,labelColorNames,type LabelColor,type InstitutionLabel,type LabelAction} from '@/lib/label-contract';
import {labelTools} from '@/lib/label-tools';
import {type Organisation} from '@/lib/data';
type LabelResult={labels:InstitutionLabel[];error?:string;[key:string]:unknown};

export function useLabels(){
  const[labels,setLabels]=useState<InstitutionLabel[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[needsSignIn,setNeedsSignIn]=useState(false),[activeId,setActiveId]=useState<string|null>(null);
  const serial=useRef(0),writing=useRef(false);
  const accept=useCallback((values:InstitutionLabel[])=>{setLabels(values);setActiveId(id=>id&&values.some(label=>label.id===id)?id:null);},[]);
  const refresh=useCallback(async()=>{
    if(writing.current)return;
    const version=++serial.current;
    try{
      const response=await fetch('/api/labels',{cache:'no-store'}),value=await response.json() as LabelResult;
      if(!response.ok){if(response.status===401&&version===serial.current){setNeedsSignIn(true);accept([]);}throw new Error(value.error||'Labels nicht erreichbar.');}
      if(version===serial.current){accept(value.labels);setNeedsSignIn(false);setError('');}
    }catch(e){if(version===serial.current)setError(e instanceof Error?e.message:'Labels nicht erreichbar.');}
    finally{if(version===serial.current)setLoading(false);}
  },[accept]);
  const invoke=useCallback(async(tool:string,args:unknown)=>{
    if(writing.current)throw new Error('Bitte den laufenden Speichervorgang abwarten.');
    writing.current=true;setBusy(true);setError('');++serial.current;
    try{
      const response=await fetch('/api/collection-tools',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tool,arguments:args})}),value=await response.json() as LabelResult;
      if(!response.ok){if(response.status===401){setNeedsSignIn(true);accept([]);}throw new Error(value.error||'Labels konnten nicht gespeichert werden.');}
      flushSync(()=>{if(Array.isArray(value.labels))accept(value.labels);setNeedsSignIn(false);setLoading(false);});return value;
    }catch(e){setError(e instanceof Error?e.message:'Speichern fehlgeschlagen.');throw e;}
    finally{writing.current=false;setBusy(false);}
  },[accept]);
  const execute=useCallback((input:LabelAction)=>{const{action,...args}=input;return invoke(action,args);},[invoke]);
  useEffect(()=>{refresh();const focus=()=>{if(document.visibilityState==='visible')refresh();};window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);const timer=setInterval(focus,15000);return()=>{clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};},[refresh]);
  useEffect(()=>{const context=(document as any).modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();for(const tool of labelTools){try{Promise.resolve(context.registerTool({name:tool.name,title:tool.title,description:tool.description,inputSchema:tool.inputSchema,annotations:{readOnlyHint:tool.readOnly,untrustedContentHint:true},execute:(input:unknown)=>invoke(tool.name,input)},{signal:lifecycle.signal})).catch(()=>{});}catch{}}return()=>lifecycle.abort();},[invoke]);
  return{labels,loading,busy,error,needsSignIn,activeId,setActiveId,active:labels.find(label=>label.id===activeId)||null,refresh,execute};
}
export type LabelsModel=ReturnType<typeof useLabels>;

export function LabelChips({labels}:{labels:InstitutionLabel[]}){
  if(!labels.length)return null;
  return <div className="label-chips">{labels.map(label=><span className={'label-chip label-'+label.color} key={label.id}>{label.name}</span>)}</div>;
}
export function LabelInstitutionButton({org,labeled,onClick}:{org:Organisation;labeled:boolean;onClick:(org:Organisation)=>void}){
  return <button className={'label-institution'+(labeled?' labeled':'')} aria-label={`Labels für ${org.title} bearbeiten`} title="Labels bearbeiten" onClick={()=>onClick(org)}><Tag size={16}/></button>;
}
function ColorPicker({value,onChange}:{value:LabelColor;onChange:(color:LabelColor)=>void}){
  return <fieldset className="label-colors"><legend className="sr-only">Labelfarbe</legend>{labelColors.map(color=><button type="button" className={'label-color label-'+color} key={color} aria-label={labelColorNames[color]} aria-pressed={value===color} onClick={()=>onChange(color)}>{value===color&&<Check size={15}/>}</button>)}</fieldset>;
}

export function LabelsDialog({model,open,onOpenChange,organisation}:{model:LabelsModel;open:boolean;onOpenChange:(open:boolean)=>void;organisation:Organisation|null}){
  const[name,setName]=useState(''),[color,setColor]=useState<LabelColor>('blue'),[editId,setEditId]=useState<string|null>(null),[deleteId,setDeleteId]=useState<string|null>(null);
  const edited=model.labels.find(label=>label.id===editId),deleting=model.labels.find(label=>label.id===deleteId);
  useEffect(()=>{if(open){setName('');setColor('blue');setEditId(null);setDeleteId(null);model.refresh();}},[open]);
  useEffect(()=>{if(editId&&!edited){setEditId(null);setName('');}if(deleteId&&!deleting)setDeleteId(null);},[editId,edited,deleteId,deleting]);
  const save=async(event:FormEvent)=>{event.preventDefault();if(!name.trim()||(editId&&!edited))return;try{await model.execute(editId?{action:'update_label',labelId:editId,name,color}:{action:'create_label',name,color,organisationCodes:organisation?[organisation.code]:undefined});setName('');setEditId(null);}catch{}};
  const toggle=async(label:InstitutionLabel)=>{if(!organisation)return;try{await model.execute({action:label.organisationCodes.includes(organisation.code)?'remove_label':'assign_label',labelId:label.id,organisationCodes:[organisation.code]});}catch{}};
  const show=(id:string)=>{model.setActiveId(id);onOpenChange(false);};
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent aria-describedby={organisation?'labels-context':undefined} className="collections-dialog labels-dialog" showCloseButton={false}>
    <div className="collections-dialog-heading"><div>{edited&&<button className="collection-back" onClick={()=>{setEditId(null);setName('');}}><ChevronLeft size={16}/>Labels</button>}<DialogTitle>{edited?'Label bearbeiten':'Labels'}</DialogTitle></div><DialogClose className="close-detail" aria-label="Labels schließen"><X size={19}/></DialogClose></div>
    {organisation&&<DialogDescription id="labels-context">{organisation.title}</DialogDescription>}
    {model.error&&<div className="collection-error" role="alert">{model.error}{model.needsSignIn?<a href="/signin-with-chatgpt?return_to=/" target="_top">Mit ChatGPT anmelden</a>:<button onClick={()=>model.refresh()}>Erneut laden</button>}</div>}
    {model.loading?<div className="collection-loading"><Loader2 className="spin" size={20}/>Labels werden geladen</div>:model.needsSignIn?null:deleting?<div className="collection-delete-confirm"><p>„{deleting.name}“ löschen und von {deleting.organisationCodes.length} {deleting.organisationCodes.length===1?'Einrichtung':'Einrichtungen'} entfernen?</p><div><button disabled={model.busy} onClick={()=>setDeleteId(null)}>Abbrechen</button><button className="danger-button" disabled={model.busy} onClick={async()=>{try{await model.execute({action:'delete_label',labelId:deleting.id});setDeleteId(null);setEditId(null);setName('');}catch{}}}>Label löschen</button></div></div>:<>
      <form onSubmit={save}><div className="collection-form"><label className="sr-only" htmlFor="label-name">Labelname</label><input id="label-name" placeholder="Neues Label" value={name} onChange={e=>setName(e.target.value)} maxLength={40} required disabled={model.busy}/><button type="submit" disabled={model.busy||!name.trim()}>{edited?'Speichern':<><Plus size={16}/>Anlegen</>}</button></div><ColorPicker value={color} onChange={setColor}/></form>
      {edited?<><button className="collection-map-link" onClick={()=>show(edited.id)}><Tag size={16}/>Auf der Karte zeigen<ChevronRight size={16}/></button><button className="collection-delete-link" disabled={model.busy} onClick={()=>setDeleteId(edited.id)}><Trash2 size={15}/>Label löschen</button></>:<div className="collection-items">{model.labels.length===0?<p className="collection-empty">Noch keine Labels. Zum Beispiel „Interessant“ oder „Beworben“.</p>:model.labels.map(label=>{const assigned=!!organisation&&label.organisationCodes.includes(organisation.code);return <div className="collection-row" key={label.id}><button className="collection-choice" disabled={model.busy} aria-pressed={organisation?assigned:undefined} onClick={()=>organisation?toggle(label):show(label.id)}>{organisation&&<span className={'collection-check '+(assigned?'checked':'')}>{assigned&&<Check size={14}/>}</span>}<span><strong><span className={'label-chip label-'+label.color}>{label.name}</span></strong><small>{label.organisationCodes.length} {label.organisationCodes.length===1?'Einrichtung':'Einrichtungen'}</small></span>{!organisation&&<ChevronRight size={16}/>}</button><button className="collection-icon-button" aria-label={`${label.name} bearbeiten`} disabled={model.busy} onClick={()=>{setEditId(label.id);setName(label.name);setColor(label.color);}}><Pencil size={16}/></button></div>;})}</div>}
    </>}
    {model.busy&&<span className="collection-busy" role="status"><Loader2 size={14} className="spin"/>Wird gespeichert…</span>}
  </DialogContent></Dialog>;
}
