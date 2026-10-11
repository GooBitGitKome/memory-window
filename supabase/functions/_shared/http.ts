import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
export class HttpError extends Error { constructor(public status:number,public code:string) {super(code);} }
export function env(name:string) {const value=Deno.env.get(name);if(!value)throw new HttpError(503,'not_configured');return value;}
export function allowedOrigin(request:Request) {
  const origin=request.headers.get('Origin');
  const allowed=env('APP_ORIGINS').split(',').map(value=>value.trim()).filter(Boolean);
  if(origin && !allowed.includes(origin)) throw new HttpError(403,'invalid_origin');
  return origin;
}
export function json(request:Request,data:unknown,status=200) {
  const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  const origin=request.headers.get('Origin');
  if(origin && (Deno.env.get('APP_ORIGINS')??'').split(',').map(value=>value.trim()).includes(origin))headers['Access-Control-Allow-Origin']=origin;
  headers['Access-Control-Allow-Headers']='authorization, apikey, content-type';headers['Access-Control-Allow-Methods']='GET, POST, PATCH, DELETE, OPTIONS';
  return new Response(JSON.stringify(data),{status,headers});
}
export async function limitedText(request:Request,maximum=65536) {
  const reader=request.body?.getReader();if(!reader)return '';
  const chunks:Uint8Array[]=[];let length=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>maximum){await reader.cancel();throw new HttpError(413,'too_large');}chunks.push(value);}}
  finally {reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder().decode(bytes);
}
export async function input(request:Request) {
  try {return z.record(z.string(),z.unknown()).parse(JSON.parse(await limitedText(request)||'{}'));}
  catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'invalid_input');}
}
export const uuid=z.string().uuid();
export const text=z.string().min(1).max(512);
export function parse<T>(schema:z.ZodType<T>,value:unknown):T {const result=schema.safeParse(value);if(!result.success)throw new HttpError(400,'invalid_input');return result.data;}
const expected=new Set(['invalid_invite','consent_required','caregiver_required','revision_mismatch','not_found','owner_required','premium_required','key_required','session_active','limit_reached','invalid_input']);
export function must<T>(result:{data:T;error:{message:string;code?:string}|null}):T {
  if(result.error){const code=result.error.message;if(expected.has(code))throw new HttpError(code==='limit_reached'?429:code==='not_found'?404:code==='premium_required'||code==='owner_required'?403:409,code);if(result.error.code==='PGRST116')throw new HttpError(404,'not_found');throw new HttpError(500,'database_error');}
  return result.data;
}
export function required<T>(result:{data:T;error:{message:string;code?:string}|null}):NonNullable<T> {
  const value=must(result);if(value===null || value===undefined)throw new HttpError(404,'not_found');return value as NonNullable<T>;
}
export function serviceClient() {return createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(request,init)=>fetch(request,{...init,signal:AbortSignal.timeout(10000)})}});}
export async function context(request:Request) {
  const header=request.headers.get('Authorization')??'';if(!/^Bearer \S+$/.test(header))throw new HttpError(401,'unauthorized');
  const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:header},fetch:(request,init)=>fetch(request,{...init,signal:AbortSignal.timeout(10000)})}});
  const {data,error}=await client.auth.getUser(header.slice(7));
  if(error || !data.user)throw new HttpError(401,'unauthorized');
  const row=must(await client.from('profiles').select('id,display_name,role').eq('id',data.user.id).single());
  const profile=parse(z.object({id:uuid,display_name:z.string(),role:z.enum(['end_user','caregiver','administrator'])}),row);
  return {client,service:serviceClient(),profile,userId:data.user.id};
}
export type Context=Awaited<ReturnType<typeof context>>;
export function requireOwner(ctx:Context) {if(ctx.profile.role!=='end_user')throw new HttpError(403,'owner_required');}
export function safeFailure(request:Request,error:unknown) {
  const status=error instanceof HttpError?error.status:500;const code=error instanceof HttpError?error.code:'internal_error';
  if(status>=500)console.error('memory_window_error',{requestId:crypto.randomUUID(),code});
  return json(request,{error:code},status);
}
