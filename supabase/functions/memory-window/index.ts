import {z} from 'zod';
import {DraftInput,ShareInput,Snapshot} from '../../../packages/api-contracts/src/index.ts';
import {allowedOrigin,context,env,HttpError,input,json,must,required,parse,requireOwner,safeFailure,text,uuid,type Context} from '../_shared/http.ts';
import {encryptKey,hashToken,randomToken} from '../_shared/crypto.ts';
import {createCheckout,createPortal} from '../_shared/billing.ts';
import {createVoice,finishCall,registeredKey} from '../_shared/realtime.ts';
const needRow=z.object({id:uuid,owner_id:uuid,title:z.string(),description:z.string(),status:z.enum(['draft','shared']),revision:z.number().int(),created_at:z.string(),expires_at:z.string()});
const usageRow=z.object({id:uuid,started_at:z.string(),ended_at:z.string().nullable(),reserved_seconds:z.number(),duration_seconds:z.number(),input_tokens:z.number().nullable(),output_tokens:z.number().nullable()});
async function snapshot(ctx:Context) {
  const [members,keys,needs,grants,usage]=await Promise.all([
    ctx.client.from('memberships').select('status').eq('user_id',ctx.userId).single(),
    ctx.service.from('encrypted_api_keys').select('user_id').eq('user_id',ctx.userId).maybeSingle(),
    ctx.client.from('needs').select('id,owner_id,title,description,status,revision,created_at,expires_at').order('created_at',{ascending:false}).limit(100),
    ctx.client.from('care_grants').select('id,owner_id,caregiver_id,label,active').limit(100),
    ctx.client.from('usage_sessions').select('id,started_at,ended_at,reserved_seconds,duration_seconds,input_tokens,output_tokens').eq('user_id',ctx.userId).gte('started_at',new Date(Date.now()-90*86400000).toISOString()).order('started_at',{ascending:false}).limit(3000),
  ]);
  const member=parse(z.object({status:z.string()}),must(members));
  const items=z.array(needRow).parse(must(needs)).map(item=>({id:item.id,ownerId:item.owner_id,title:item.title,description:item.description,status:item.status,revision:item.revision,createdAt:item.created_at,expiresAt:item.expires_at}));
  const activity=z.array(usageRow).parse(must(usage)).map(item=>({id:item.id,startedAt:item.started_at,endedAt:item.ended_at,reservedSeconds:item.reserved_seconds,durationSeconds:item.duration_seconds,inputTokens:item.input_tokens,outputTokens:item.output_tokens}));
  const care=z.array(z.object({id:uuid,owner_id:uuid,caregiver_id:uuid,label:z.string(),active:z.boolean()})).parse(must(grants)).map(item=>({id:item.id,ownerId:item.owner_id,caregiverId:item.caregiver_id,label:item.label,active:item.active}));
  return Snapshot.parse({profile:{id:ctx.userId,name:ctx.profile.display_name,role:ctx.profile.role},subscription:{status:member.status,premium:['active','trialing'].includes(member.status)},keyRegistered:Boolean(must(keys)),dailyLimitSeconds:1800,dailyReservedSeconds:activity.filter(item=>item.startedAt.startsWith(new Date().toISOString().slice(0,10))).reduce((total,item)=>total+item.reservedSeconds,0),needs:items.filter(item=>item.ownerId===ctx.userId),sharedNeeds:items.filter(item=>item.ownerId!==ctx.userId),grants:care,usage:activity});
}
async function ownedNeed(ctx:Context,id:string) {const row=required(await ctx.service.from('needs').select('id').eq('id',id).eq('owner_id',ctx.userId).gt('expires_at',new Date().toISOString()).single());return row;}
export async function handler(request:Request) {
  try {
    allowedOrigin(request);if(request.method==='OPTIONS')return json(request,{ok:true});
    const route=new URL(request.url).pathname.split('/memory-window/')[1]??'';
    const ctx=await context(request);
    if(route==='state' && request.method==='GET')return json(request,await snapshot(ctx));
    const data=await input(request);
    if(route==='accept-invite' && request.method==='POST') {
      const code=parse(z.string().regex(/^[a-f0-9]{48}$/),data.code);
      must(await ctx.service.rpc('accept_care_invite',{p_user:ctx.userId,p_hash:await hashToken(code)}));return json(request,{ok:true});
    }
    if(route==='cleanup' && request.method==='POST') {
      if(ctx.profile.role!=='administrator')throw new HttpError(403,'forbidden');
      if(data.confirm!==true)throw new HttpError(400,'consent_required');
      must(await ctx.service.rpc('cleanup_expired_data'));return json(request,{ok:true});
    }
    requireOwner(ctx);
    if(route==='needs' && request.method==='POST') {
      const value=parse(DraftInput,data);
      const count=required(await ctx.service.from('needs').select('id').eq('owner_id',ctx.userId).gt('expires_at',new Date().toISOString()).limit(50));
      if(count.length>=50)throw new HttpError(429,'limit_reached');
      const row=required(await ctx.service.from('needs').insert({owner_id:ctx.userId,...value}).select('id').single());return json(request,{id:row.id});
    }
    if(route==='needs' && request.method==='PATCH') {
      const id=parse(uuid,data.id);await ownedNeed(ctx,id);const value=parse(DraftInput,{title:data.title,description:data.description});
      must(await ctx.service.from('needs').update({...value,status:'draft',shared_at:null}).eq('id',id).eq('owner_id',ctx.userId));return json(request,{id});
    }
    if((route==='needs' && request.method==='DELETE') || (route==='withdraw' && request.method==='POST')) {
      must(await ctx.service.rpc('withdraw_need',{p_user:ctx.userId,p_need:parse(uuid,data.id),p_delete:request.method==='DELETE'}));return json(request,{ok:true});
    }
    if(route==='share' && request.method==='POST') {
      const value=parse(ShareInput,data);must(await ctx.service.rpc('share_need',{p_user:ctx.userId,p_need:parse(uuid,value.id),p_revision:value.revision,p_consent:value.consent}));return json(request,{ok:true});
    }
    if(route==='invite' && request.method==='POST') {
      const existing=required(await ctx.service.from('care_invites').select('id').eq('owner_id',ctx.userId).is('used_at',null).gt('expires_at',new Date().toISOString()).limit(10));
      if(existing.length>=10)throw new HttpError(429,'limit_reached');
      const code=randomToken();const expiresAt=new Date(Date.now()+86400000).toISOString();
      must(await ctx.service.from('care_invites').insert({owner_id:ctx.userId,token_hash:await hashToken(code),expires_at:expiresAt}));return json(request,{code,expiresAt});
    }
    if(route==='revoke-grant' && request.method==='POST') {must(await ctx.service.rpc('revoke_care_grant',{p_user:ctx.userId,p_grant:parse(uuid,data.id)}));return json(request,{ok:true});}
    if(route==='key' && request.method==='POST') {
      const key=parse(z.string().min(20).max(512).regex(/^sk-[A-Za-z0-9_-]+$/),data.key);
      const version=env('KEY_VERSION');const masters=parse(z.record(z.string(),z.string()),JSON.parse(env('KEYRING_JSON')));if(!masters[version])throw new HttpError(503,'not_configured');
      const encrypted=await encryptKey(key,ctx.userId,masters[version],version);
      must(await ctx.service.rpc('store_encrypted_key',{p_user:ctx.userId,p_ciphertext:encrypted.ciphertext,p_iv:encrypted.iv,p_version:encrypted.key_version,p_delete:false}));return json(request,{ok:true});
    }
    if(route==='key' && request.method==='DELETE') {
      const active=required(await ctx.service.from('usage_sessions').select('id').eq('user_id',ctx.userId).is('ended_at',null).not('call_id','is',null));
      if(active.length){const key=await registeredKey(ctx);for(const session of active)await finishCall(ctx,session.id,key);}
      must(await ctx.service.rpc('store_encrypted_key',{p_user:ctx.userId,p_ciphertext:null,p_iv:null,p_version:null,p_delete:true}));return json(request,{ok:true});
    }
    if(route==='checkout' && request.method==='POST') {if(['capacitor://localhost','https://localhost'].includes(request.headers.get('Origin')??''))throw new HttpError(503,'payment_disabled');if(data.confirm!==true)throw new HttpError(400,'consent_required');return json(request,await createCheckout(ctx));}
    if(route==='portal' && request.method==='POST')return json(request,await createPortal(ctx));
    if(route==='voice' && request.method==='POST')return json(request,await createVoice(ctx,parse(z.string().min(20).max(60000).startsWith('v='),data.sdp)));
    if(route==='voice-end' && request.method==='POST'){await finishCall(ctx,parse(uuid,data.sessionId));return json(request,{ok:true});}
    throw new HttpError(404,'not_found');
  }catch(error){return safeFailure(request,error);}
}
if(import.meta.main)Deno.serve(handler);
