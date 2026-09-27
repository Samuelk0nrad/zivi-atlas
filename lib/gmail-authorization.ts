import {GMAIL_SCOPE,GMAIL_EMAIL_SCOPE,type GmailSession} from './gmail';

type TokenResult={access_token?:string;expires_in?:number|string;scope?:string;error?:string};
type TokenRequest={prompt:string;login_hint?:string};
export type GoogleOAuth={initTokenClient:(options:{client_id:string;scope:string;include_granted_scopes:boolean;callback:(value:TokenResult)=>void;error_callback:(value:{type:string})=>void})=>{requestAccessToken:(options:TokenRequest)=>void}};
type Preferences=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const validEmail=(value:unknown):value is string=>typeof value==='string'&&value.length<=254&&/^[^\s<>@]+@[^\s<>@]+$/.test(value);

/** Only the account preference is persisted. Access tokens never leave memory. */
export function createGmailAuthorization({clientId,owner,oauth,storage,request=fetch,now=Date.now}:{clientId:string;owner:string;oauth:GoogleOAuth;storage?:Preferences;request?:typeof fetch;now?:()=>number}){
  const key=`zivi-atlas:gmail-account:${encodeURIComponent(owner)}:${clientId}`;
  let email:string|null=null,session:(GmailSession&{expiresAt:number})|null=null,pending:Promise<GmailSession>|null=null;
  try{const saved=storage?.getItem(key);if(validEmail(saved))email=saved;}catch{}
  const invalidate=()=>{session=null;};
  const forget=()=>{invalidate();email=null;try{storage?.removeItem(key);}catch{}};
  const authorize=(switchAccount=false):Promise<GmailSession>=>{
    if(pending)return pending;
    if(!switchAccount&&session&&session.expiresAt>now()+60000)return Promise.resolve(session);
    const expectedEmail=switchAccount?null:email;
    const operation=new Promise<GmailSession>((resolve,reject)=>{
      const client=oauth.initTokenClient({client_id:clientId,scope:`${GMAIL_SCOPE} ${GMAIL_EMAIL_SCOPE}`,include_granted_scopes:false,
        error_callback:()=>reject(new Error('Google-Anmeldung geschlossen oder blockiert. Bitte erneut versuchen.')),
        callback:result=>{void(async()=>{try{
          if(result.error||!result.access_token)throw new Error('Gmail-Verbindung nicht freigegeben.');
          if(!result.scope?.split(' ').includes(GMAIL_SCOPE))throw new Error('Bitte die Berechtigung zum Verwalten von Gmail-Entwürfen freigeben.');
          const lifetime=Number(result.expires_in),expiresAt=now()+(Number.isFinite(lifetime)&&lifetime>0?lifetime*1000:0);
          const response=await request('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:`Bearer ${result.access_token}`},credentials:'omit',signal:AbortSignal.timeout(15000)});
          const profile=await response.json() as {email?:string};
          if(!response.ok||!validEmail(profile.email))throw new Error('Das ausgewählte Gmail-Konto konnte nicht ermittelt werden.');
          // A login hint is only a hint: never silently upload to another account.
          if(expectedEmail&&profile.email.toLowerCase()!==expectedEmail.toLowerCase())throw new Error(`Bitte ${expectedEmail} verwenden oder „Konto wechseln“ wählen.`);
          session={accessToken:result.access_token,email:profile.email,owner,expiresAt};email=profile.email;
          try{storage?.setItem(key,email);}catch{}
          resolve(session);
        }catch(error){reject(error);}})();}
      });
      // Keep this synchronous with the click so Google can open its popup.
      client.requestAccessToken(expectedEmail?{prompt:'',login_hint:expectedEmail}:{prompt:'select_account'});
    });
    pending=operation.finally(()=>{pending=null;});return pending;
  };
  return{authorize,invalidate,forget,getAccount:()=>email};
}
