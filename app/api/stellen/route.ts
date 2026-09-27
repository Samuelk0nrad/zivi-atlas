import {getCatalog} from '@/lib/server/catalog';
export async function GET(){return Response.json(await getCatalog(),{headers:{'Cache-Control':'public, max-age=300'}});}
