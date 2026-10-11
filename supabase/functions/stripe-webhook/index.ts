import Stripe from 'stripe';
import {eligibleSubscription,stripeClient} from '../_shared/billing.ts';
import {env,HttpError,limitedText,must,serviceClient} from '../_shared/http.ts';
export async function handler(request:Request) {
  try {
    if(request.method!=='POST')throw new HttpError(405,'method_not_allowed');
    const signature=request.headers.get('stripe-signature');if(!signature)throw new HttpError(400,'invalid_signature');
    const stripe=stripeClient();const raw=await limitedText(request,262144);
    let event:Stripe.Event;
    try{event=await stripe.webhooks.constructEventAsync(raw,signature,env('STRIPE_WEBHOOK_SECRET'),300,Stripe.createSubtleCryptoProvider());}catch{throw new HttpError(400,'invalid_signature');}
    if(event.livemode)throw new HttpError(400,'test_mode_required');
    if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type)) {
      const service=serviceClient();
      const payload=event.data.object as Stripe.Subscription;
      // Retrieve authoritative provider state instead of applying a potentially stale event payload.
      const subscription=await stripe.subscriptions.retrieve(payload.id);
      const customer=typeof subscription.customer==='string'?subscription.customer:subscription.customer.id;
      const status=eligibleSubscription(subscription)?subscription.status:subscription.status==='active'||subscription.status==='trialing'?'free':subscription.status;
      must(await service.rpc('apply_subscription_event',{p_event:event.id,p_created:event.created,p_customer:customer,p_subscription:subscription.id,p_status:status}));
    }
    return Response.json({received:true},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const status=error instanceof HttpError?error.status:500;const code=error instanceof HttpError?error.code:'webhook_failed';
    if(status>=500)console.error('stripe_webhook_error',{requestId:crypto.randomUUID(),code});
    return Response.json({error:code},{status,headers:{'Cache-Control':'no-store'}});
  }
}
if(import.meta.main)Deno.serve(handler);
