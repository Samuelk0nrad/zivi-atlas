'use client';
import {useEffect,useState} from 'react';
import {GMAIL_SCOPE,GMAIL_EMAIL_SCOPE,type GmailSession} from '@/lib/gmail';

type TokenResult={access_token?:string;scope?:string;error?:string};
type GoogleOAuth={initTokenClient:(options:{client_id:string;scope:string;include_granted_scopes:boolean;callback:(value:TokenResult)=>void;error_callback:(value:{type:string})=>void})=>{requestAccessToken:(options:{prompt:string})=>void}};
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
  useEffect(()=>{
    if(!active)return;let cancelled=false;setLoading(true);setError('');setReady(false);
    void(async()=>{try{
      const response=await fetch('/api/gmail/config',{cache:'no-store',signal:AbortSignal.timeout(15000)}),config=await response.json() as {clientId:string|null;error?:string};
      if(!response.ok)throw new Error(config.error||'Gmail-Einrichtung nicht erreichbar.');
      if(cancelled)return;setClientId(config.clientId);
      if(config.clientId){await loadGoogle();if(!cancelled)setReady(true);}
    }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Google nicht erreichbar.');}
    finally{if(!cancelled)setLoading(false);}})();
    return()=>{cancelled=true;};
  },[active,attempt]);
  // Called directly from the click handler, before any await: Google requires a user gesture.
  const authorize=():Promise<GmailSession>=>new Promise((resolve,reject)=>{
    const oauth=googleOAuth();if(!clientId||!oauth||!ready){reject(new Error('Gmail ist noch nicht eingerichtet.'));return;}
    const client=oauth.initTokenClient({client_id:clientId,scope:`${GMAIL_SCOPE} ${GMAIL_EMAIL_SCOPE}`,include_granted_scopes:false,
      error_callback:()=>reject(new Error('Google-Anmeldung geschlossen oder blockiert. Bitte Zivi Atlas in Chrome oder Brave öffnen und Pop-ups erlauben.')),
      callback:result=>{void(async()=>{try{
        if(result.error||!result.access_token)throw new Error('Gmail-Verbindung nicht freigegeben.');
        if(!result.scope?.split(' ').includes(GMAIL_SCOPE))throw new Error('Bitte die Berechtigung zum Verwalten von Gmail-Entwürfen freigeben.');
        const response=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:`Bearer ${result.access_token}`},credentials:'omit',signal:AbortSignal.timeout(15000)});
        const profile=await response.json() as {email?:string};
        if(!response.ok||typeof profile.email!=='string'||!profile.email.includes('@'))throw new Error('Das ausgewählte Gmail-Konto konnte nicht ermittelt werden.');
        resolve({accessToken:result.access_token,email:profile.email});
      }catch(e){reject(e);}})();}
    });client.requestAccessToken({prompt:'select_account'});
  });
  return{clientId,loading,ready,error,authorize,retry:()=>setAttempt(value=>value+1)};
}

export function GmailSetup(){return <details className="gmail-setup"><summary>Gmail einmalig einrichten</summary><ol>
  <li>In der <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud Console</a> ein Projekt anlegen und die Gmail API aktivieren.</li>
  <li>Unter Google Auth Platform „External“ und „Testing“ wählen und deine Gmail-Adresse als Testnutzer hinzufügen.</li>
  <li>Unter „Data Access“ die Berechtigungen <code>gmail.compose</code> und <code>userinfo.email</code> hinzufügen.</li>
  <li>Einen OAuth-Client vom Typ „Web application“ erstellen. Unter „Authorized JavaScript origins“ die Adresse dieser Website eintragen: <code>{typeof window!=='undefined'?window.location.origin:''}</code></li>
  <li>Die Client-ID für Zivi Atlas als <code>GOOGLE_GMAIL_CLIENT_ID</code> hinterlegen lassen. Kein Client-Secret erforderlich.</li>
  </ol><p>Google erlaubt mit dieser Berechtigung auch das Senden. Zivi Atlas erstellt ausschließlich Entwürfe. Die Verbindung bitte in Chrome oder Brave öffnen.</p></details>;}
