import {spawnSync} from 'node:child_process';

const LOCAL_URL='http://localhost:5173';

// Resolve the target before reading credentials or contacting any service.
export function resolveTarget({mutates=false,localOnly=false}={},env=process.env,args=process.argv.slice(2)){
  let url;
  try{url=new URL(args.includes('--local')?LOCAL_URL:(env.ZIVI_BASE_URL||LOCAL_URL));}
  catch{throw new Error('ZIVI_BASE_URL must be an absolute HTTP(S) origin.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('ZIVI_BASE_URL must be an HTTP(S) origin without credentials, path, query or fragment.');
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(localOnly&&!local)throw new Error('This check requires the local preview and its mock browser authentication.');
  if(!local&&url.protocol!=='https:')throw new Error('Remote targets require HTTPS.');
  if(!local&&mutates&&!args.includes('--allow-remote-writes'))throw new Error('Remote writes are disabled. Review ZIVI_BASE_URL and add --allow-remote-writes to explicitly enable them.');
  return{base:url.origin,local};
}

export function readCredential(variable,key,{required=false,env=process.env,lookup=spawnSync}={}){
  let value=env[variable]?.trim();
  if(!value&&env.ZIVI_USE_KEYRING==='1'){
    const result=lookup('secret-tool',['lookup','service',env.ZIVI_KEYRING_SERVICE||'zivildienst-mcp-tunnel','credential',key],{encoding:'utf8'});
    if(result.status===0)value=result.stdout?.trim();
  }
  if(!value&&required)throw new Error(`Set ${variable}, or explicitly enable the optional desktop keyring with ZIVI_USE_KEYRING=1.`);
  return value;
}

export function connection(options={}){
  const target=resolveTarget(options);
  const authorization=process.env.ZIVI_AUTHORIZATION?.trim()||'Bearer '+readCredential('ZIVI_MCP_TOKEN','app-bearer',{required:true});
  const siteToken=target.local||process.env.ZIVI_SITES_AUTHORIZATION?.trim()?undefined:readCredential('ZIVI_SITES_TOKEN','sites-bypass');
  const siteAuthorization=target.local?undefined:(process.env.ZIVI_SITES_AUTHORIZATION?.trim()||(siteToken?'Bearer '+siteToken:undefined));
  const browserHeaders=target.local?{Cookie:'__sites_local_auth=1'}:{};
  return{...target,browserHeaders,headers:{Authorization:authorization,...browserHeaders,...(siteAuthorization?{'OAI-Sites-Authorization':siteAuthorization}:{})}};
}
