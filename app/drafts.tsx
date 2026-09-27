'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowUpRight,Search,Check,Copy,Download,Paperclip,FilePenLine,Loader2,Mail,Plus,Save,Trash2,X} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {draftActionSchema,draftLinks,type DraftAction,type DraftFields,type DraftSummary,type EmailDraft} from '@/lib/draft-contract';
import {draftTools} from '@/lib/draft-tools';
import {attachmentTools,MAX_ATTACHMENT_BYTES} from '@/lib/attachment-contract';
import {type Organisation} from '@/lib/data';
import {useGmailConnection,GmailSetup} from './gmail-connection';
import {createGmailCopy,GmailHandoffError,gmailDraftsUrl,type GmailCopy} from '@/lib/gmail';

type DraftResult={draft?:EmailDraft;drafts?:DraftSummary[];total?:number;error?:string;[key:string]:unknown};
export function useDrafts(){
  const[drafts,setDrafts]=useState<DraftSummary[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[needsSignIn,setNeedsSignIn]=useState(false);
  const serial=useRef(0),working=useRef(false),scope=useRef<{organisationCode:number|null;query:string}>({organisationCode:null,query:''}),loadedWindow=useRef(100);
  const refresh=useCallback(async(offset=0)=>{
    if(working.current)return;
    const version=++serial.current,active=scope.current,target=offset?offset+100:loadedWindow.current;
    try{
      const next:DraftSummary[]=[];let count=0;
      for(let page=offset;page<target;page+=100){
        const params=new URLSearchParams({offset:String(page),query:active.query});if(active.organisationCode!==null)params.set('organisationCode',String(active.organisationCode));
        const response=await fetch('/api/drafts?'+params,{cache:'no-store'}),value=await response.json() as DraftResult;
        if(version!==serial.current)return;
        if(!response.ok){if(response.status===401){setNeedsSignIn(true);setDrafts([]);}throw new Error(value.error||'Entwürfe nicht erreichbar.');}
        next.push(...value.drafts!);count=value.total||0;if(page+100>=count)break;
      }
      if(version===serial.current){loadedWindow.current=target;setDrafts(previous=>offset?[...new Map([...previous,...next].map(d=>[d.id,d])).values()]:next);setTotal(count);setNeedsSignIn(false);setLoadError('');}
    }catch(e){if(version===serial.current)setLoadError(e instanceof Error?e.message:'Entwürfe nicht erreichbar.');}
    finally{if(version===serial.current)setLoading(false);}
  },[]);
  const setScope=useCallback((organisationCode:number|null,query='')=>{
    const next={organisationCode,query:query.trim()};if(next.organisationCode===scope.current.organisationCode&&next.query===scope.current.query)return;
    scope.current=next;loadedWindow.current=100;++serial.current;setDrafts([]);setTotal(0);setLoading(true);setLoadError('');void refresh();
  },[refresh]);
  const invoke=useCallback(async(tool:string,args:unknown):Promise<DraftResult>=>{
    if(working.current)throw new Error('Bitte den laufenden Vorgang abwarten.');
    working.current=true;setBusy(true);setError('');++serial.current;
    try{
      const response=await fetch('/api/collection-tools',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tool,arguments:args})}),value=await response.json() as DraftResult;
      if(!response.ok){if(response.status===401){setNeedsSignIn(true);setDrafts([]);}throw new Error(value.error||'Entwurf konnte nicht gespeichert werden.');}
      setNeedsSignIn(false);return value;
    }catch(e){setError(e instanceof Error?e.message:'Entwurf nicht erreichbar.');throw e;}
    finally{working.current=false;setBusy(false);void refresh();}
  },[refresh]);
  const upload=useCallback(async(draft:EmailDraft,file:File):Promise<DraftResult>=>{
    if(working.current)throw new Error('Bitte den laufenden Vorgang abwarten.');working.current=true;++serial.current;setBusy(true);setError('');
    try{const response=await fetch(`/api/draft-attachments?draftId=${draft.id}&revision=${draft.revision}`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name)},body:file}),value=await response.json() as DraftResult;if(!response.ok)throw new Error(value.error||'Datei konnte nicht hochgeladen werden.');return value;}catch(e){setError(e instanceof Error?e.message:'Datei konnte nicht hochgeladen werden.');throw e;}finally{working.current=false;setBusy(false);void refresh();}
  },[refresh]);
  const execute=useCallback((input:DraftAction)=>{const{action,...args}=input;return invoke(action,args);},[invoke]);
  useEffect(()=>{void refresh();const focus=()=>{if(document.visibilityState==='visible')void refresh();};window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);const timer=setInterval(focus,15000);return()=>{clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};},[refresh]);
  useEffect(()=>{const context=(document as any).modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();for(const tool of [...draftTools,...attachmentTools]){try{Promise.resolve(context.registerTool({name:tool.name,title:tool.title,description:tool.description,inputSchema:tool.inputSchema,annotations:{readOnlyHint:tool.readOnly,untrustedContentHint:true},execute:(input:unknown)=>invoke(tool.name,input)},{signal:lifecycle.signal})).catch(()=>{});}catch{}}return()=>lifecycle.abort();},[invoke]);
  return{drafts,total,loading,busy,error:error||loadError,setError,needsSignIn,refresh,setScope,execute,invoke,upload};
}
type DraftsModel=ReturnType<typeof useDrafts>;
type Editor=DraftFields&{saved:EmailDraft|null;organisationCode:number|null;organisationTitle:string};
const fromDraft=(draft:EmailDraft):Editor=>({...draft,saved:draft});
const isDirty=(editor:Editor|null)=>!!editor&&(editor.saved?(['recipient','subject','body'] as const).some(key=>editor[key]!==editor.saved![key]):!!(editor.recipient||editor.subject||editor.body||editor.organisationCode));

export function DraftsDialog({model,open,onOpenChange,organisation,initialDraftId,onApplications}:{onApplications:()=>void;model:DraftsModel;open:boolean;onOpenChange:(open:boolean)=>void;organisation:Organisation|null;initialDraftId:string|null}){
  const[editor,setEditor]=useState<Editor|null>(null),[showAll,setShowAll]=useState(false),[query,setQuery]=useState(''),[pending,setPending]=useState<(()=>void)|null>(null),[deleting,setDeleting]=useState(false),[notice,setNotice]=useState(''),[loadingDraft,setLoadingDraft]=useState(false),[attaching,setAttaching]=useState(false),[chooseSaved,setChooseSaved]=useState(false),[savedAttachments,setSavedAttachments]=useState<import('@/lib/attachment-contract').DraftAttachment[]>([]);
  const gmail=useGmailConnection(open);
  const[gmailBusy,setGmailBusy]=useState(false),[gmailCopies,setGmailCopies]=useState<Record<string,GmailCopy>>({}),[gmailCheckUrl,setGmailCheckUrl]=useState('');
  const gmailWorking=useRef(false);
  const fileInput=useRef<HTMLInputElement>(null);
  const loadSerial=useRef(0),dirty=isDirty(editor),disabled=model.busy||loadingDraft||attaching||gmailBusy;
  const summary=editor?.saved?model.drafts.find(d=>d.id===editor.saved!.id):undefined;
  const changedElsewhere=!!editor?.saved&&!!summary&&summary.revision>editor.saved.revision;
  const resetMessages=()=>{model.setError('');setNotice('');setDeleting(false);setChooseSaved(false);setGmailCheckUrl('');};
  const load=async(id:string)=>{const version=++loadSerial.current;setLoadingDraft(true);resetMessages();try{const value=await model.invoke('get_email_draft',{draftId:id});if(version===loadSerial.current&&value.draft)setEditor(fromDraft(value.draft));}catch{}finally{if(version===loadSerial.current)setLoadingDraft(false);}};
  const newDraft=(org:Organisation|null)=>{resetMessages();setEditor({saved:null,organisationCode:org?.code??null,organisationTitle:org?.title||'',recipient:org?.email||'',subject:org?`Anfrage zum Zivildienst – ${org.title}`.slice(0,200).replace(/[\r\n\x00]/g,' '):'',body:org?'Guten Tag,\n\nich interessiere mich für einen Zivildienst bei Ihrer Einrichtung.\n\n\nMit freundlichen Grüßen\n':''});};
  const guard=(action:()=>void)=>{if(disabled)return;if(dirty)setPending(()=>action);else action();};
  const close=()=>guard(()=>onOpenChange(false));
  const backToList=()=>guard(()=>{++loadSerial.current;setEditor(null);resetMessages();});
  const changeScope=(all:boolean)=>guard(()=>{setShowAll(all);setQuery('');setEditor(null);resetMessages();});
  useEffect(()=>{if(open){setPending(null);setEditor(null);setLoadingDraft(false);setShowAll(false);setQuery('');resetMessages();model.setScope(organisation?.code??null);void model.refresh();if(initialDraftId)void load(initialDraftId);}else ++loadSerial.current;},[open,initialDraftId,organisation]);
  useEffect(()=>{if(open)model.setScope(showAll?null:organisation?.code??null,query);},[open,showAll,organisation?.code,query,model.setScope]);
  useEffect(()=>{if(!open||!dirty)return;const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);},[open,dirty]);
  const save=async()=>{
    if(!editor)return null;
    if(editor.saved&&!dirty)return editor.saved;
    const fields={recipient:editor.recipient,subject:editor.subject,body:editor.body};
    const action=editor.saved?{action:'update_email_draft',draftId:editor.saved.id,expectedRevision:editor.saved.revision,...fields}:{action:'create_email_draft',...(editor.organisationCode?{organisationCode:editor.organisationCode}:{}),...fields};
    const parsed=draftActionSchema.safeParse(action);
    if(!parsed.success){model.setError(parsed.error.issues[0]?.message||'Bitte den Entwurf prüfen.');return null;}
    try{const result=await model.execute(parsed.data);if(result.draft){setEditor(fromDraft(result.draft));setNotice('Gespeichert');return result.draft;}}catch{}return null;
  };
  const attachFile=async(file:File)=>{
    if(file.size>MAX_ATTACHMENT_BYTES||!file.size){model.setError('Bitte eine Datei mit maximal 5 MB auswählen.');return;}
    setAttaching(true);try{const draft=await save();if(!draft)return;const value=await model.upload(draft,file);if(value.draft){setEditor(fromDraft(value.draft));setNotice('Datei angehängt');}}catch{}finally{setAttaching(false);if(fileInput.current)fileInput.current.value='';}
  };
  const savedFiles=async()=>{try{const r=await model.invoke('list_draft_attachments',{});setSavedAttachments((r.attachments as import('@/lib/attachment-contract').DraftAttachment[]||[]).filter(f=>f.draftId!==editor?.saved?.id));setChooseSaved(true);}catch{}};
  const changeAttachment=async(tool:'copy_draft_attachment'|'remove_draft_attachment',attachmentId:string)=>{setAttaching(true);try{const draft=await save();if(!draft)return;const r=await model.invoke(tool,{attachmentId,draftId:draft.id,expectedRevision:draft.revision});if(r.draft){setEditor(fromDraft(r.draft));setNotice(tool==='copy_draft_attachment'?'Datei übernommen':'Anhang entfernt');setChooseSaved(false);}}catch{}finally{setAttaching(false);}};
  const downloadEmail=async()=>{const draft=await save();if(draft)window.location.href=`/api/drafts/${draft.id}/export`;};
  const openMail=async()=>{const draft=await save();if(draft)window.location.href=draftLinks(draft).mailtoUrl;};
  const createInGmail=async()=>{
    if(!editor||disabled||gmailWorking.current)return;
    gmailWorking.current=true;setGmailBusy(true);model.setError('');setGmailCheckUrl('');setNotice('');
    let account='';
    try{
      const session=await gmail.authorize();account=session.email;
      const draft=await save();if(!draft)return;
      const created=await createGmailCopy(session,draft);
      setGmailCopies(current=>({...current,[draft.id]:created}));
      setNotice(`In Gmail gespeichert · ${created.account}${created.attachmentCount?` · ${created.attachmentCount} ${created.attachmentCount===1?'Anhang':'Anhänge'}`:''}`);
    }catch(error){
      model.setError(error instanceof Error?error.message:'Gmail-Entwurf konnte nicht erstellt werden.');
      if(error instanceof GmailHandoffError&&error.uncertain&&account)setGmailCheckUrl(gmailDraftsUrl(account));
    }finally{gmailWorking.current=false;setGmailBusy(false);}
  };
  const copy=async()=>{if(!editor)return;try{await navigator.clipboard.writeText(`An: ${editor.recipient}\nBetreff: ${editor.subject}\n\n${editor.body}`);setNotice('Entwurf kopiert');}catch{setNotice('Kopieren nicht möglich. Bitte den Text im Entwurf markieren und kopieren.');}};
  const field=(key:keyof DraftFields,value:string)=>{setEditor(current=>current?{...current,[key]:value}:null);setNotice('');};
  const links=editor?.saved&&!dirty?draftLinks(editor.saved):null;
  const gmailCopy=editor?.saved?gmailCopies[editor.saved.id]:undefined;
  const currentGmailCopy=gmailCopy&&!dirty&&gmailCopy.revision===editor?.saved?.revision?gmailCopy:null;
  return <Dialog open={open} onOpenChange={value=>{if(!value)close();}}><DialogContent aria-describedby={organisation?'drafts-context':undefined} className={'drafts-dialog drafts-browser '+(editor||loadingDraft?'is-editing':'is-browsing')} showCloseButton={false}>
    <header className="drafts-heading"><div><DialogTitle>E-Mail-Entwürfe</DialogTitle>{organisation&&<DialogDescription id="drafts-context">{organisation.title}</DialogDescription>}</div><button className="draft-mail-app" disabled={disabled} onClick={()=>guard(onApplications)}>Bewerbungen</button><button className="close-detail" aria-label="Entwürfe schließen" onClick={close} disabled={disabled}><X size={20}/></button></header>
    {pending&&<div className="draft-prompt" role="alert"><p>Änderungen zuerst speichern?</p><div><button disabled={disabled} onClick={()=>setPending(null)}>Zurück</button><button disabled={disabled} onClick={()=>{const next=pending;setPending(null);next();}}>Verwerfen</button><button disabled={disabled} className="primary-button" onClick={async()=>{const result=await save();if(result){const next=pending;setPending(null);next();}}}>Speichern & weiter</button></div></div>}
    {model.error&&<div className="collection-error" role="alert">{model.error}{model.needsSignIn?<a href={'/signin-with-chatgpt?return_to='+encodeURIComponent(initialDraftId?'/?draft='+encodeURIComponent(initialDraftId):'/')} target="_top">Mit ChatGPT anmelden</a>:editor?.saved?<button disabled={disabled} onClick={()=>guard(()=>void load(editor.saved!.id))}>Gespeicherte Version laden</button>:<button disabled={disabled} onClick={()=>void model.refresh()}>Erneut laden</button>}</div>}
    {!model.needsSignIn&&<div className="drafts-workspace"><aside className="drafts-sidebar" aria-label="Gespeicherte Entwürfe">
      <div className="draft-navigation">{organisation&&<div className="draft-scope" role="group" aria-label="Entwurfsansicht"><button disabled={disabled} aria-pressed={!showAll} onClick={()=>changeScope(false)}>Diese Einrichtung</button><button disabled={disabled} aria-pressed={showAll} onClick={()=>changeScope(true)}>Alle Entwürfe</button></div>}<div className="draft-search"><Search size={15}/><input aria-label="Entwürfe durchsuchen" placeholder="Entwürfe durchsuchen" value={query} maxLength={120} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="Entwurfssuche löschen" onClick={()=>setQuery('')}><X size={14}/></button>}</div><div className="draft-list-heading"><span>{model.loading?'Wird geladen…':`${model.total} ${model.total===1?'Entwurf':'Entwürfe'}`}</span><button className="draft-new" disabled={disabled} title={organisation?'Neuer Entwurf für '+organisation.title:undefined} onClick={()=>guard(()=>newDraft(organisation))}><Plus size={16}/>Neuer Entwurf</button></div></div>
      <div className="draft-list">{model.loading?<p className="draft-list-empty">Entwürfe werden geladen…</p>:model.error&&!model.drafts.length?<p className="draft-list-empty">Die Entwürfe konnten nicht geladen werden.</p>:model.drafts.length===0?<div className="draft-list-empty"><FilePenLine size={27}/><p>{query?'Keine passenden Entwürfe.':organisation&&!showAll?'Für diese Einrichtung gibt es noch keinen Entwurf.':'Noch keine gespeicherten Entwürfe.'}</p>{!query&&<button className="draft-mail-app" disabled={disabled} onClick={()=>guard(()=>newDraft(organisation))}><Plus size={16}/>Neue E-Mail entwerfen</button>}</div>:model.drafts.map(draft=><button key={draft.id} disabled={disabled} aria-current={editor?.saved?.id===draft.id?'true':undefined} className={'draft-list-item '+(editor?.saved?.id===draft.id?'selected':'')} onClick={()=>guard(()=>void load(draft.id))}><strong>{draft.subject||'Ohne Betreff'}</strong><span>{draft.organisationTitle||draft.recipient||'Ohne Empfänger'}</span><small>{new Intl.DateTimeFormat('de-AT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(draft.updatedAt))}</small></button>)}{model.drafts.length<model.total&&<button className="draft-new" disabled={disabled||model.loading} onClick={()=>void model.refresh(model.drafts.length)}>Weitere laden</button>}</div></aside>
    <section className="draft-editor" aria-label="E-Mail verfassen">{(editor||loadingDraft)&&<div className="draft-editor-navigation"><button disabled={disabled} onClick={backToList}><ArrowLeft size={16}/>Zur Entwurfsliste</button><span>{editor?.saved?'Gespeicherter Entwurf':'Neuer Entwurf'}</span></div>}{loadingDraft?<div className="draft-empty"><Loader2 className="spin"/>Entwurf wird geladen</div>:!editor?null:<>
      {editor.organisationTitle&&<div className="draft-institution">{editor.organisationTitle}<span>#{editor.organisationCode}</span></div>}
      {changedElsewhere&&<div className="draft-conflict" role="status">Dieser Entwurf wurde anderswo geändert. Dein Text bleibt erhalten.<button disabled={disabled} onClick={()=>guard(()=>void load(editor.saved!.id))}>Aktuelle Version laden</button></div>}
      <label className="draft-field"><span>An</span><input type="email" placeholder="E-Mail-Adresse" aria-label="Empfänger" autoComplete="off" value={editor.recipient} maxLength={254} disabled={disabled} onChange={event=>field('recipient',event.target.value)}/></label>
      <label className="draft-field"><span>Betreff</span><input placeholder="Betreff" aria-label="Betreff" value={editor.subject} maxLength={200} disabled={disabled} onChange={event=>field('subject',event.target.value)}/></label>
      <label className="draft-body"><span className="sr-only">Nachricht</span><textarea placeholder="Deine Nachricht…" aria-label="Nachricht" value={editor.body} maxLength={8000} disabled={disabled} onChange={event=>field('body',event.target.value)}/></label>
      <section className="draft-attachments" aria-label="Anhänge"><div className="draft-attachment-heading"><span><Paperclip size={14}/>Anhänge {editor.saved?.attachments?.length?`(${editor.saved.attachments.length})`:''}</span><div><button className="draft-mail-app" disabled={disabled} onClick={savedFiles}>Gespeicherte Datei</button><button className="draft-save" disabled={disabled||(editor.saved?.attachments?.length||0)>=5} onClick={()=>fileInput.current?.click()}><Plus size={14}/>Datei anhängen</button></div></div><input ref={fileInput} type="file" className="sr-only" tabIndex={-1} aria-label="Datei auswählen" accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.jpg,.jpeg,.png,.webp" onChange={e=>{const file=e.target.files?.[0];if(file)void attachFile(file);}}/>
      {editor.saved?.attachments?.map(file=><div className="draft-attachment" key={file.id}><Paperclip size={16}/><a href={file.downloadUrl} download><strong>{file.filename}</strong><small>{file.size>=1024*1024?(file.size/1024/1024).toFixed(1)+' MB':Math.ceil(file.size/1024)+' KB'}</small></a><a className="draft-icon" aria-label={`${file.filename} herunterladen`} href={file.downloadUrl} download><Download size={15}/></a><button className="draft-icon" aria-label={`${file.filename} entfernen`} disabled={disabled} onClick={()=>void changeAttachment('remove_draft_attachment',file.id)}><X size={15}/></button></div>)}
      {chooseSaved&&<div className="draft-saved-files"><div><strong>Aus einem anderen Entwurf</strong><button className="draft-icon" aria-label="Dateiauswahl schließen" onClick={()=>setChooseSaved(false)}><X size={15}/></button></div>{savedAttachments.length?savedAttachments.map(file=><button disabled={disabled} key={file.id} onClick={()=>void changeAttachment('copy_draft_attachment',file.id)}><Paperclip size={14}/><span>{file.filename}</span><Plus size={14}/></button>):<p>Noch keine Datei in einem anderen Entwurf gespeichert.</p>}</div>}
      </section>
      {deleting?<div className="draft-prompt"><p>Diesen gespeicherten Entwurf löschen?</p><div><button disabled={disabled} onClick={()=>setDeleting(false)}>Abbrechen</button><button className="draft-danger" disabled={disabled} onClick={async()=>{if(!editor.saved)return;try{await model.execute({action:'delete_email_draft',draftId:editor.saved.id,expectedRevision:editor.saved.revision});setEditor(null);setDeleting(false);}catch{}}}>Entwurf löschen</button></div></div>:<footer className="draft-footer"><div className="draft-save-row"><span className="draft-status" role="status">{gmailBusy?<><Loader2 size={14} className="spin"/>Gmail-Entwurf wird erstellt…</>:model.busy?<><Loader2 size={14} className="spin"/>Wird gespeichert…</>:notice||(!dirty&&editor.saved?<><Check size={14}/>Gespeichert</>:'Nicht gespeichert')}</span><button className="draft-icon" aria-label="Entwurf kopieren" title="Kopieren" onClick={copy}><Copy size={16}/></button>{editor.saved&&<button className="draft-icon draft-danger" aria-label="Entwurf löschen" title="Löschen" disabled={disabled} onClick={()=>setDeleting(true)}><Trash2 size={16}/></button>}<button className="draft-save" disabled={disabled||(!dirty&&!!editor.saved)} onClick={()=>void save()}><Save size={16}/>Speichern</button></div><div className="draft-send-row">{(editor.saved?.attachments?.length||0)>0&&<button className="draft-mail-app" disabled={disabled} onClick={()=>void downloadEmail()}><Download size={15}/>E-Mail-Datei (.eml)</button>}{links&&!disabled?<a className="draft-mail-app" href={links.mailtoUrl}><Mail size={16}/>Mail-App</a>:<button className="draft-mail-app" disabled={disabled} onClick={()=>void openMail()}><Mail size={16}/>Mail-App</button>}
        {currentGmailCopy?<a className="primary-button" href={currentGmailCopy.url} target="_blank" rel="noopener noreferrer">In Gmail öffnen<ArrowUpRight size={17}/></a>:<button className="primary-button" disabled={disabled||!gmail.ready} onClick={()=>void createInGmail()}>{gmailBusy?<Loader2 size={16} className="spin"/>:<Mail size={16}/>} {gmail.loading?'Gmail wird geladen…':gmailCopy?'Neue Gmail-Kopie erstellen':'Gmail-Entwurf erstellen'}</button>}
      </div>
      {gmail.error&&<p className="gmail-connection-error" role="alert">{gmail.error} <button onClick={gmail.retry} disabled={disabled}>Erneut versuchen</button></p>}
      {!gmail.loading&&!gmail.error&&!gmail.clientId&&<GmailSetup/>}
      {!gmail.loading&&!gmail.ready&&links&&!disabled&&<a className="draft-mail-app" href={links.gmailUrl} target="_blank" rel="noopener noreferrer">{editor.saved?.attachments.length?'Nur Text in Gmail öffnen':'Gmail ohne Verbindung öffnen'}<ArrowUpRight size={15}/></a>}
      {gmailCheckUrl&&<a className="draft-mail-app" href={gmailCheckUrl} target="_blank" rel="noopener noreferrer">Gmail-Entwürfe prüfen<ArrowUpRight size={15}/></a>}
      {currentGmailCopy&&<p className="draft-footnote">Gmail-Kopie für {currentGmailCopy.account}{currentGmailCopy.attachmentCount?` · ${currentGmailCopy.attachmentCount} ${currentGmailCopy.attachmentCount===1?'Anhang':'Anhänge'}`:''}. In Gmail unter „Entwürfe“ öffnen.</p>}
      {gmailCopy&&!currentGmailCopy&&<p className="draft-footnote">Änderungen werden als neue Gmail-Kopie gespeichert.</p>}
      {(editor.saved?.attachments?.length||0)>0&&<p className="draft-footnote">Mail-App: Für Anhänge die E-Mail-Datei (.eml) öffnen.</p>}
      </footer>}
    </>}</section></div>}
  </DialogContent></Dialog>;
}
