import {Buffer} from 'node:buffer';
import {type DraftFields} from '../draft-contract';
export function encodeHeader(value:string){
 const words:string[]=[];let part='';for(const c of value.replace(/[\r\n\0]/g,' ')){if(Buffer.byteLength(part+c)>42){words.push('=?UTF-8?B?'+Buffer.from(part).toString('base64')+'?=');part='';}part+=c;}if(part)words.push('=?UTF-8?B?'+Buffer.from(part).toString('base64')+'?=');return words.join('\r\n ');
}
const base64=(bytes:Uint8Array)=>Buffer.from(bytes).toString('base64').match(/.{1,76}/g)?.join('\r\n')||'';
function filenameParams(name:string){const chunks:string[]=[];let part='';for(const token of encodeURIComponent(name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase()).match(/%[0-9A-F]{2}|./g)||[]){if(part.length+token.length>48){chunks.push(part);part='';}part+=token;}chunks.push(part);return chunks.map((chunk,i)=>`filename*${i}*=${i===0?"UTF-8''":''}${chunk}`).join(';\r\n ');}
export function buildDraftMime(draft:DraftFields,files:{filename:string;contentType:string;bytes:Uint8Array}[]){
 const boundary='zivi_'+crypto.randomUUID().replaceAll('-','');
 const lines=['MIME-Version: 1.0','X-Unsent: 1',...(draft.recipient?['To: '+draft.recipient.replace(/[\r\n\0]/g,'')]:[]),'Subject: '+encodeHeader(draft.subject),`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',base64(new TextEncoder().encode(draft.body.replace(/\r\n|\r|\n/g,'\r\n')))];
 for(const file of files)lines.push(`--${boundary}`,'Content-Type: '+file.contentType,'Content-Disposition: attachment;\r\n '+filenameParams(file.filename),'Content-Transfer-Encoding: base64','',base64(file.bytes));
 lines.push(`--${boundary}--`,'');return lines.join('\r\n');
}
