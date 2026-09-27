import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';

export function database(){
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
  const migrations=new URL('../drizzle/',import.meta.url);
  for(const file of readdirSync(migrations).filter(file=>file.endsWith('.sql')).sort())sql.exec(readFileSync(new URL(file,migrations),'utf8'));
  const db={prepare(query){let args=[];const statement={bind(...values){args=values;return statement;},async all(){return{results:sql.prepare(query).all(...args)};},async first(){return sql.prepare(query).get(...args)||null;},run(){return{meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};return statement;},async batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>s.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
  return{sql,db};
}
