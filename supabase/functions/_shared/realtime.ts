// @deno-types="npm:@types/ws@8.18.2"
import WebSocket from 'npm:ws@8.22.0';
import { z } from 'zod';
import { decryptKey,hashToken } from './crypto.ts';
import { env,HttpError,must,required,type Context } from './http.ts';
import { verifyPremium } from './billing.ts';
declare const EdgeRuntime:{waitUntil:(promise:Promise<unknown>)=>void};
const keyRecord=z.object({ciphertext:z.string(),iv:z.string(),key_version:z.string()});
export async function registeredKey(ctx:Context) {
  const row=keyRecord.parse(must(await ctx.service.from('encrypted_api_keys').select('ciphertext,iv,key_version').eq('user_id',ctx.userId).single()));
  const masters=z.record(z.string(),z.string()).parse(JSON.parse(env('KEYRING_JSON')));
  return decryptKey(row,ctx.userId,masters);
}
export async function hangup(key:string,callId:string) {
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(callId))throw new HttpError(502,'provider_unavailable');
  for(let attempt=0;attempt<2;attempt++) {
    const response=await fetch(`https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/hangup`,{method:'POST',headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(8000)});
    if(response.ok || response.status===404)return;
    if(attempt===0 && (response.status===429 || response.status>=500)){await new Promise(resolve=>setTimeout(resolve,500));continue;}
    throw new HttpError(502,'provider_unavailable');
  }
}
export async function finishCall(ctx:Context,id:string,key?:string) {
  const row=required(await ctx.service.from('usage_sessions').select('id,call_id,started_at,ended_at,reserved_seconds').eq('id',id).eq('user_id',ctx.userId).single());
  if(row.ended_at)return;
  if(row.call_id) {
    try {await hangup(key??await registeredKey(ctx),row.call_id);}
    catch(error) {must(await ctx.service.from('usage_sessions').update({error_code:'hangup_unconfirmed'}).eq('id',id).eq('user_id',ctx.userId));throw error;}
  }
  must(await ctx.service.from('usage_sessions').update({ended_at:new Date().toISOString(),duration_seconds:Math.max(0,Math.min(row.reserved_seconds,Math.ceil((Date.now()-Date.parse(row.started_at))/1000)))}).eq('id',id).eq('user_id',ctx.userId).is('ended_at',null));
}
const usageSchema=z.object({id:z.string(),usage:z.object({input_tokens:z.number().int().nonnegative(),output_tokens:z.number().int().nonnegative()})});
async function monitor(ctx:Context,key:string,callId:string,id:string,remainingMs:number) {
  const socket=new WebSocket(`wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`,{headers:{Authorization:`Bearer ${key}`},handshakeTimeout:5000,maxPayload:128*1024});
  let finish!:()=>void;const lifetime=new Promise<void>(resolve=>{finish=resolve;});
  let closed=false;let input=0;let output=0;const seen=new Set<string>();
  let queue:Promise<void>=Promise.resolve();
  const close=async()=>{
    if(closed)return;closed=true;clearTimeout(timer);socket.close();
    try {await queue;}catch{console.error('realtime_usage_failed',{sessionId:id,code:'database_unavailable'});}
    try {await finishCall(ctx,id,key);}catch{console.error('realtime_finalization_failed',{sessionId:id,code:'provider_or_database_unavailable'});}finally{finish();}
  };
  const timer=setTimeout(()=>void close(),Math.max(1000,remainingMs));
  socket.on('message',raw=>{
    try {
      const event:unknown=JSON.parse(raw.toString());
      if(!event || typeof event!=='object' || !('type' in event))return;
      if(event.type==='response.done' && 'response' in event) {
        const parsed=usageSchema.safeParse(event.response);if(!parsed.success || seen.has(parsed.data.id))return;
        seen.add(parsed.data.id);input+=parsed.data.usage.input_tokens;output+=parsed.data.usage.output_tokens;
        queue=queue.then(async()=>{must(await ctx.service.from('usage_sessions').update({input_tokens:input,output_tokens:output}).eq('id',id).eq('user_id',ctx.userId));});
        void queue.catch(()=>{void close();});
      }
    }catch{void close();}
  });
  socket.on('error',()=>void close());socket.on('close',()=>void close());
  await new Promise<void>((resolve,reject)=>{socket.once('open',resolve);socket.once('error',()=>reject(new HttpError(502,'provider_unavailable')));socket.once('close',()=>reject(new HttpError(502,'provider_unavailable')));});
  EdgeRuntime.waitUntil(lifetime);return lifetime;
}
export async function createVoice(ctx:Context,sdp:string) {
  if(Deno.env.get('REALTIME_ENABLED')!=='true' || Deno.env.get('PROVIDER_BUDGET_CONFIRMED')!=='true' || typeof EdgeRuntime==='undefined')throw new HttpError(503,'voice_disabled');
  await verifyPremium(ctx);
  let key:string|undefined;const maxSeconds=60;const started=Date.now();
  const id=must(await ctx.service.rpc('reserve_voice',{p_user:ctx.userId,p_seconds:maxSeconds,p_daily_limit:1800}));
  try {
    key=await registeredKey(ctx);
    const config={type:'realtime',model:Deno.env.get('REALTIME_MODEL')??'gpt-realtime',max_output_tokens:256,
      instructions:'あなたは「思い出の窓」のAIです。人間を装わず、穏やかな日本語で短く話してください。発話を急かさず、同じ質問にも落ち着いて答えてください。医療判断や緊急対応を保証しないでください。家族への共有や重要操作を自動実行しないでください。',
      audio:{input:{transcription:{model:'gpt-4o-mini-transcribe'},turn_detection:{type:'server_vad',interrupt_response:true,create_response:true}},output:{voice:'marin'}},tools:[],tracing:null};
    const form=new FormData();form.set('sdp',sdp);form.set('session',JSON.stringify(config));
    // A create-call retry could create another billed session. User-triggered retry only.
    const response=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:`Bearer ${key}`,'OpenAI-Safety-Identifier':await hashToken(ctx.userId)},body:form,signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new HttpError(response.status===429?429:502,'provider_unavailable');
    const answer=await response.text();
    const location=response.headers.get('location');const callId=location?.split('/').at(-1);
    if(!callId || !/^[A-Za-z0-9_-]{1,160}$/.test(callId))throw new HttpError(502,'provider_unavailable');
    must(await ctx.service.from('usage_sessions').update({call_id:callId}).eq('id',id).eq('user_id',ctx.userId));
    if(answer.length>65536 || !answer.startsWith('v='))throw new HttpError(502,'provider_unavailable');
    // Background lifetime must be registered without awaiting the session's full duration.
    const activeKey=key;
    EdgeRuntime.waitUntil(monitor(ctx,activeKey,callId,id,maxSeconds*1000-(Date.now()-started)).catch(async()=>{await finishCall(ctx,id,activeKey).catch(()=>console.error('realtime_finalization_failed',{sessionId:id,code:'monitor_unavailable'}));}));
    return {sessionId:id,sdp:answer,maxSeconds,demo:false};
  }catch(error){
    const row=required(await ctx.service.from('usage_sessions').select('call_id').eq('id',id).eq('user_id',ctx.userId).single());
    if(row.call_id) await finishCall(ctx,id,key).catch(()=>console.error('realtime_finalization_failed',{sessionId:id,code:'creation_cleanup_failed'}));
    else must(await ctx.service.from('usage_sessions').update({ended_at:new Date().toISOString(),error_code:'connection_failed'}).eq('id',id).eq('user_id',ctx.userId));
    throw error;
  }
}
