'use client';
import {useEffect,useRef,useState} from 'react';
import {type GmailSession} from '@/lib/gmail';
import {createGmailAuthorization,type GoogleOAuth} from '@/lib/gmail-authorization';
const googleOAuth=()=> (window as unknown as {google?:{accounts?:{oauth2?:GoogleOAuth}}}).google?.accounts?.oauth2;
let scriptPromise:Promise<void>|undefined;
function loadGoogle(){
  if(googleOAuth())return Promise.resolve();
  if(scriptPromise)return scriptPromise;
  scriptPromise=new Promise<void>((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
    const fail=()=>{clearTimeout(timer);script.remove();scriptPromise=undefined;reject(new Error('Google konnte nicht geladen werden. Bitte erneut versuchen.'));};
    const timer=setTimeout(fail,15000);
    script.onload=()=>{clearTimeout(timer);if(googleOAuth())resolve();else fail();};script.onerror=fail;
    document.head.appendChild(script);
  });return scriptPromise;
}

export function useGmailConnection(active:boolean){
  const[clientId,setClientId]=useState<string|null>(null),[loading,setLoading]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const[account,setAccount]=useState<string|null>(null);
  const connection=useRef<{key:string;auth:ReturnType<typeof createGmailAuthorization>}|null>(null);
  useEffect(()=>{
    if(!active)return;let cancelled=false;setLoading(true);setError('');setReady(false);
    void(async()=>{try{
      const response=await fetch('/api/gmail/config',{cache:'no-store',signal:AbortSignal.timeout(15000)}),config=await response.json() as {clientId:string|null;owner:string;error?:string};
      if(!response.ok)throw new Error(config.error||'Gmail-Einrichtung nicht erreichbar.');
      if(cancelled)return;setClientId(config.clientId);
      const key=JSON.stringify([config.clientId,config.owner]);
      if(connection.current?.key!==key){connection.current=null;setAccount(null);}
      if(config.clientId&&config.owner){
        await loadGoogle();if(cancelled)return;
        if(!connection.current){
          let storage:Storage|undefined;try{storage=window.localStorage;}catch{}
          connection.current={key,auth:createGmailAuthorization({clientId:config.clientId,owner:config.owner,oauth:googleOAuth()!,storage})};
        }
        setAccount(connection.current.auth.getAccount());setReady(true);
      }
    }catch(e){if(!cancelled){connection.current=null;setAccount(null);setError(e instanceof Error?e.message:'Google nicht erreichbar.');}}
    finally{if(!cancelled)setLoading(false);}})();
    return()=>{cancelled=true;};
  },[active,attempt]);
  // Called directly from the click handler, before any await: Google requires a user gesture.
  const authorize=(switchAccount=false):Promise<GmailSession>=>{
    const current=connection.current;if(!current||!ready)return Promise.reject(new Error('Gmail ist noch nicht eingerichtet.'));
    return current.auth.authorize(switchAccount).then(session=>{if(connection.current===current)setAccount(session.email);return session;});
  };
  const forget=()=>{connection.current?.auth.forget();setAccount(null);};
  const invalidate=()=>connection.current?.auth.invalidate();
  return{clientId,loading,ready,error,account,authorize,forget,invalidate,retry:()=>setAttempt(value=>value+1)};
}

export function GmailSetup(){return <details className="gmail-setup"><summary>Gmail einmalig einrichten</summary><ol>
  <li>In der <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud Console</a> ein Projekt anlegen und die Gmail API aktivieren.</li>
  <li>Unter Google Auth Platform „External“ und „Testing“ wählen und deine Gmail-Adresse als Testnutzer hinzufügen.</li>
  <li>Unter „Data Access“ die Berechtigungen <code>gmail.compose</code> und <code>userinfo.email</code> hinzufügen.</li>
  <li>Einen OAuth-Client vom Typ „Web application“ erstellen. Unter „Authorized JavaScript origins“ die Adresse dieser Website eintragen: <code>{typeof window!=='undefined'?window.location.origin:''}</code></li>
  <li>Die Client-ID für Zivi Atlas als <code>GOOGLE_GMAIL_CLIENT_ID</code> hinterlegen lassen. Kein Client-Secret erforderlich.</li>
  </ol><p>Google erlaubt mit dieser Berechtigung auch das Senden. Zivi Atlas erstellt ausschließlich Entwürfe. Die Verbindung bitte in Chrome oder Brave öffnen.</p></details>;}
