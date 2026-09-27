import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith('@/'))return next(pathToFileURL(resolve(root,specifier.slice(2)+'.ts')).href,context);
  if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const url=new URL(specifier,context.parentURL);if(!existsSync(url)&&existsSync(fileURLToPath(url)+'.ts'))return next(url.href+'.ts',context);}
  return next(specifier,context);
}});
