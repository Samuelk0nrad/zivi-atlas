'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {flushSync} from 'react-dom';
import {Bookmark,Check,ChevronLeft,ChevronRight,Folder,Loader2,Pencil,Plus,Trash2,X} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogClose} from '@/components/ui/dialog';
import {type Collection,type CollectionAction} from '@/lib/collection-contract';
import {collectionTools} from '@/lib/collection-tools';
import {type Organisation} from '@/lib/data';

export function useCollections(){
  const[collections,setCollections]=useState<Collection[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[needsSignIn,setNeedsSignIn]=useState(false),[activeId,setActiveId]=useState<string|null>(null);
  const serial=useRef(0),writing=useRef(false);
  const accept=useCallback((values:Collection[])=>{setCollections(values);setActiveId(id=>id&&values.some(c=>c.id===id)?id:null);},[]);
  const refresh=useCallback(async(throwErrors=false)=>{
    if(writing.current)return;
    const version=++serial.current;
    try{const response=await fetch('/api/collections',{cache:'no-store'});const value=await response.json() as {collections:Collection[];error?:string;[key:string]:unknown};if(!response.ok){if(response.status===401&&version===serial.current){setNeedsSignIn(true);accept([]);}throw new Error(value.error||'Sammlungen nicht erreichbar.');}if(version===serial.current){accept(value.collections);setNeedsSignIn(false);setError('');}return value;
    }catch(e){if(version===serial.current)setError(e instanceof Error?e.message:'Sammlungen nicht erreichbar.');if(throwErrors)throw e;}finally{if(version===serial.current)setLoading(false);}
  },[accept]);
  const invoke=useCallback(async(tool:string,args:unknown)=>{
    if(writing.current)throw new Error('Bitte den laufenden Speichervorgang abwarten.');
    writing.current=true;setBusy(true);setError('');++serial.current;
    try{const response=await fetch('/api/collection-tools',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tool,arguments:args})});const value=await response.json() as {collections:Collection[];error?:string;[key:string]:unknown};if(!response.ok){if(response.status===401){setNeedsSignIn(true);accept([]);}throw new Error(value.error||'Speichern fehlgeschlagen.');}flushSync(()=>{if(Array.isArray(value.collections))accept(value.collections);setNeedsSignIn(false);setLoading(false);});return value;
    }catch(e){setError(e instanceof Error?e.message:'Speichern fehlgeschlagen.');throw e;}finally{writing.current=false;setBusy(false);}
  },[accept]);
  const execute=useCallback(async(input:CollectionAction)=>{const{action,...args}=input;return invoke(action,args);},[invoke]);
  useEffect(()=>{refresh();const focus=()=>{if(document.visibilityState==='visible')refresh();};window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);const timer=setInterval(focus,15000);return()=>{clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};},[refresh]);
  useEffect(()=>{const context=(document as any).modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();for(const tool of collectionTools){try{Promise.resolve(context.registerTool({name:tool.name,title:tool.title,description:tool.description,inputSchema:tool.inputSchema,annotations:{readOnlyHint:tool.readOnly,untrustedContentHint:true},execute:async(input:unknown)=>invoke(tool.name,input)},{signal:lifecycle.signal})).catch(()=>{});}catch{}}return()=>lifecycle.abort();},[invoke]);
  return{collections,loading,busy,error,needsSignIn,activeId,setActiveId,active:collections.find(c=>c.id===activeId)||null,refresh,execute};
}
export type CollectionsModel=ReturnType<typeof useCollections>;

export function SaveInstitutionButton({org,saved,onSave,className=''}:{org:Organisation;saved:boolean;onSave:(o:Organisation)=>void;className?:string}){
  return <button className={'save-institution '+className+(saved?' saved':'')} aria-label={`${org.title} ${saved?'in Sammlungen verwalten':'in Sammlung speichern'}`} title={saved?'In Sammlungen gespeichert':'In Sammlung speichern'} onClick={()=>onSave(org)}><Bookmark size={17} fill={saved?'currentColor':'none'}/></button>;
}

export function CollectionsDialog({model,open,onOpenChange,organisation,onShowOrganisation}:{model:CollectionsModel;open:boolean;onOpenChange:(open:boolean)=>void;organisation:Organisation|null;onShowOrganisation:(code:number)=>void}){
  const[name,setName]=useState(''),[editId,setEditId]=useState<string|null>(null),[rename,setRename]=useState(''),[deleteId,setDeleteId]=useState<string|null>(null);
  const edited=model.collections.find(c=>c.id===editId),deleting=model.collections.find(c=>c.id===deleteId);
  useEffect(()=>{if(open){setName('');setEditId(null);setDeleteId(null);model.refresh();}},[open]);
  const create=async(event:FormEvent)=>{event.preventDefault();if(!name.trim())return;try{await model.execute({action:'create_collection',name,organisationCodes:organisation?[organisation.code]:undefined});setName('');}catch{}};
  const select=(id:string)=>{model.setActiveId(id);onOpenChange(false);};
  const toggle=async(c:Collection)=>{if(!organisation)return;const saved=c.items.some(i=>i.code===organisation.code);try{await model.execute({action:saved?'remove_from_collection':'add_to_collection',collectionId:c.id,organisationCodes:[organisation.code]});}catch{}};
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent aria-describedby={organisation||edited?'collections-context':undefined} className="collections-dialog" showCloseButton={false}>
    <div className="collections-dialog-heading"><div>{edited&&<button className="collection-back" onClick={()=>setEditId(null)}><ChevronLeft size={16}/>Sammlungen</button>}<DialogTitle>{organisation?'Einrichtung speichern':edited?'Sammlung bearbeiten':'Sammlungen'}</DialogTitle></div><DialogClose className="close-detail" aria-label="Sammlungen schließen"><X size={19}/></DialogClose></div>
    {(organisation||edited)&&<DialogDescription id="collections-context">{organisation?organisation.title:`${edited!.items.length} Einrichtungen`}</DialogDescription>}
    {model.error&&<div className="collection-error" role="alert">{model.error}{model.needsSignIn?<a href="/signin-with-chatgpt?return_to=/" target="_top">Mit ChatGPT anmelden</a>:<button onClick={()=>model.refresh()}>Erneut laden</button>}</div>}
    {model.loading?<div className="collection-loading"><Loader2 className="spin" size={20}/>Sammlungen werden geladen</div>:model.needsSignIn?null:deleting?<div className="collection-delete-confirm"><p>„{deleting.name}“ und {deleting.items.length} gespeicherte Einträge löschen?</p><div><button onClick={()=>setDeleteId(null)}>Abbrechen</button><button className="danger-button" disabled={model.busy} onClick={async()=>{try{await model.execute({action:'delete_collection',collectionId:deleting.id});setDeleteId(null);setEditId(null);}catch{}}}>Sammlung löschen</button></div></div>:edited?<>
      <form className="collection-form" onSubmit={async e=>{e.preventDefault();try{await model.execute({action:'rename_collection',collectionId:edited.id,name:rename});}catch{}}}><label className="sr-only" htmlFor="rename-collection">Sammlungsname</label><input id="rename-collection" value={rename} onChange={e=>setRename(e.target.value)} required maxLength={80}/><button disabled={model.busy||!rename.trim()} type="submit">Speichern</button></form>
      <button className="collection-map-link" onClick={()=>select(edited.id)}><Folder size={16}/>Auf der Karte zeigen<ChevronRight size={16}/></button>
      <div className="collection-items">{edited.items.length===0?<p className="collection-empty">Noch keine Einrichtungen gespeichert.</p>:edited.items.map(item=><div className="collection-item" key={item.code}><button onClick={()=>{onShowOrganisation(item.code);onOpenChange(false);}}><strong>{item.title}</strong><span>{item.city} · #{item.code}</span></button><button className="collection-icon-button" disabled={model.busy} aria-label={`${item.title} aus Sammlung entfernen`} onClick={()=>model.execute({action:'remove_from_collection',collectionId:edited.id,organisationCodes:[item.code]}).catch(()=>{})}><X size={17}/></button></div>)}</div>
      <button className="collection-delete-link" onClick={()=>setDeleteId(edited.id)}><Trash2 size={15}/>Sammlung löschen</button>
    </>:<>
      <form className="collection-form" onSubmit={create}><label className="sr-only" htmlFor="new-collection">Neue Sammlung</label><input id="new-collection" placeholder="Neue Sammlung" value={name} onChange={e=>setName(e.target.value)} maxLength={80} required/><button type="submit" disabled={model.busy||!name.trim()}><Plus size={17}/>Anlegen</button></form>
      <div className="collection-items">{model.collections.length===0?<p className="collection-empty">Lege deine erste Sammlung an{organisation?', um diese Einrichtung zu speichern.':'.'}</p>:model.collections.map(c=>{const saved=!!organisation&&c.items.some(i=>i.code===organisation.code);return <div className="collection-row" key={c.id}><button className="collection-choice" disabled={model.busy} aria-pressed={organisation?saved:undefined} onClick={()=>organisation?toggle(c):select(c.id)}>{organisation?<span className={'collection-check '+(saved?'checked':'')}>{saved&&<Check size={14}/>}</span>:<Folder size={19}/>}<span><strong>{c.name}</strong><small>{c.items.length} {c.items.length===1?'Einrichtung':'Einrichtungen'}</small></span>{!organisation&&<ChevronRight size={16}/>}</button>{!organisation&&<button className="collection-icon-button" aria-label={`${c.name} bearbeiten`} onClick={()=>{setEditId(c.id);setRename(c.name);}}><Pencil size={16}/></button>}</div>;})}</div>
    </>}
    {model.busy&&<span className="collection-busy" role="status"><Loader2 size={14} className="spin"/>Wird gespeichert…</span>}
  </DialogContent></Dialog>;
}
