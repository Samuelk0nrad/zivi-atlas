import {getChatGPTUser,chatGPTSignInPath} from '../chatgpt-auth';
import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
export default async function ConnectionPage(){
  const user=await getChatGPTUser();
  const configured=!!user&&env.COLLECTIONS_MCP_OWNER_ID===user.userId&&!!env.COLLECTIONS_MCP_TOKEN_SHA256;
  return <main style={{maxWidth:520,margin:'12vh auto',padding:24,fontFamily:'system-ui',lineHeight:1.6}}>
    <h1 style={{fontSize:28,fontWeight:650}}>ChatGPT-Verbindung</h1>
    {user?<><p aria-label="Verbindungskonto" data-account-id={user.userId}>{user.displayName}</p>
      <p>{configured?'Der Sammlungsserver ist für dein Konto eingerichtet.':'Dein Konto ist bereit für die Einrichtung.'}</p>
      <p>ChatGPT kann deine Sammlungen und Labels verwalten sowie E-Mail-Entwürfe erstellen und bearbeiten. Du prüfst die Entwürfe hier und sendest sie in Gmail oder deiner Mail-App.</p>
      <p>Die Verbindung funktioniert, solange dein Computer und der sichere Tunnel laufen.</p>
    </>:<a href={chatGPTSignInPath('/connection')} target="_top">Mit ChatGPT anmelden</a>}
    <a href="/">Zur Karte</a>
  </main>;
}
