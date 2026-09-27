/** Resolve app-owned review paths against the current deployment, never a personal Site URL. */
export function withReviewLinks<T extends Record<string,unknown>>(result:T,requestUrl:string):T{
  const copy:Record<string,unknown>={...result},origin=new URL(requestUrl).origin;
  for(const key of ['draftUrl','exportUrl','applicationUrl']){
    const path=copy[key];
    if(typeof path==='string'&&path.startsWith('/')&&!path.startsWith('//'))copy[key]=new URL(path,origin).href;
  }
  return copy as T;
}
