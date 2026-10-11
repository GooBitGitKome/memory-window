import Stripe from 'stripe';
import {handler as api} from '../memory-window/index.ts';
import {handler as webhook} from '../stripe-webhook/index.ts';
function equal(actual:unknown,expected:unknown){if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`Assertion failed: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);}
Deno.test('API rejects unauthenticated forged ownership and disallowed origins',async()=>{
  Deno.env.set('APP_ORIGINS','http://localhost:5173');
  const response=await api(new Request('http://localhost/functions/v1/memory-window/share',{method:'POST',headers:{Origin:'http://localhost:5173','Content-Type':'application/json'},body:JSON.stringify({userId:'someone-else',consent:true})}));
  equal(response.status,401);equal(await response.json(),{error:'unauthorized'});
  const cross=await api(new Request('http://localhost/functions/v1/memory-window/state',{headers:{Origin:'https://untrusted.invalid'}}));equal(cross.status,403);
});
Deno.test('API verifies supplied bearer token with Auth server',async()=>{
  Deno.env.set('APP_ORIGINS','http://localhost:5173');Deno.env.set('SUPABASE_URL','http://localhost:54321');Deno.env.set('SUPABASE_ANON_KEY','synthetic-public-key');
  const original=globalThis.fetch;let requests=0;
  globalThis.fetch=async()=>{requests++;return Response.json({message:'invalid token'},{status:401});};
  try{const response=await api(new Request('http://localhost/functions/v1/memory-window/state',{headers:{Origin:'http://localhost:5173',Authorization:'Bearer synthetic-invalid-token'}}));equal(response.status,401);equal(requests,1);}finally{globalThis.fetch=original;}
});
Deno.test('Stripe webhook rejects missing, forged and stale signatures without network',async()=>{
  Deno.env.set('STRIPE_SECRET_KEY','sk_test_synthetic_not_a_real_key');Deno.env.set('STRIPE_WEBHOOK_SECRET','synthetic_webhook_secret');
  const stripe=new Stripe('sk_test_synthetic_not_a_real_key',{httpClient:Stripe.createFetchHttpClient()});
  const payload=JSON.stringify({id:'evt_synthetic',object:'event',type:'ignored.test',created:Math.floor(Date.now()/1000),livemode:false,data:{object:{}}});
  equal((await webhook(new Request('http://localhost/webhook',{method:'POST',body:payload}))).status,400);
  const bad=await webhook(new Request('http://localhost/webhook',{method:'POST',headers:{'stripe-signature':'t=1,v1=bad'},body:payload}));equal(bad.status,400);
  const stale=await stripe.webhooks.generateTestHeaderStringAsync({payload,secret:'synthetic_webhook_secret',timestamp:Math.floor(Date.now()/1000)-600,cryptoProvider:Stripe.createSubtleCryptoProvider()});
  equal((await webhook(new Request('http://localhost/webhook',{method:'POST',headers:{'stripe-signature':stale},body:payload}))).status,400);
  const signature=await stripe.webhooks.generateTestHeaderStringAsync({payload,secret:'synthetic_webhook_secret',cryptoProvider:Stripe.createSubtleCryptoProvider()});
  const response=await webhook(new Request('http://localhost/webhook',{method:'POST',headers:{'stripe-signature':signature},body:payload}));equal(response.status,200);equal(await response.json(),{received:true});
});
