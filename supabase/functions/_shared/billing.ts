import Stripe from 'stripe';
import { env, HttpError, must, required, type Context } from './http.ts';
export function stripeClient() {
  const key=env('STRIPE_SECRET_KEY');
  if(!key.startsWith('sk_test_'))throw new HttpError(503,'payment_disabled');
  return new Stripe(key,{httpClient:Stripe.createFetchHttpClient(),timeout:10000,maxNetworkRetries:2});
}
export function eligibleSubscription(subscription:Stripe.Subscription) {
  return (subscription.status==='active' || subscription.status==='trialing') && subscription.items.data.some(item=>item.price.id===env('STRIPE_PREMIUM_PRICE_ID'));
}
export async function verifyPremium(ctx:Context) {
  const member=required(await ctx.service.from('memberships').select('subscription_id,status').eq('user_id',ctx.userId).single());
  if(!member?.subscription_id || !['active','trialing'].includes(member.status))throw new HttpError(403,'premium_required');
  const subscription=await stripeClient().subscriptions.retrieve(member.subscription_id);
  const customer=required(await ctx.service.from('stripe_customers').select('customer_id').eq('user_id',ctx.userId).single());
  if(!eligibleSubscription(subscription) || subscription.customer!==customer.customer_id)throw new HttpError(403,'premium_required');
}
export async function createCheckout(ctx:Context) {
  const stripe=stripeClient();const existing=must(await ctx.service.from('stripe_customers').select('customer_id').eq('user_id',ctx.userId).maybeSingle());
  let customerId:string=existing?.customer_id;
  if(!customerId){
    const customer=await stripe.customers.create({metadata:{memory_window_user:ctx.userId}},{idempotencyKey:`memory-window-customer-${ctx.userId}`});
    must(await ctx.service.from('stripe_customers').upsert({user_id:ctx.userId,customer_id:customer.id},{onConflict:'user_id'}));customerId=customer.id;
  }
  const member=required(await ctx.service.from('memberships').select('status').eq('user_id',ctx.userId).single());
  if(['active','trialing'].includes(member.status))throw new HttpError(409,'already_subscribed');
  const origin=env('WEB_ORIGIN');if(!origin.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))throw new HttpError(503,'payment_disabled');
  const session=await stripe.checkout.sessions.create({mode:'subscription',customer:customerId,line_items:[{price:env('STRIPE_PREMIUM_PRICE_ID'),quantity:1}],success_url:`${origin}/settings?payment=returned`,cancel_url:`${origin}/settings?payment=canceled`,client_reference_id:ctx.userId,subscription_data:{metadata:{memory_window_user:ctx.userId}}});
  if(!session.url)throw new HttpError(502,'provider_unavailable');return {url:session.url};
}
export async function createPortal(ctx:Context) {
  const row=required(await ctx.service.from('stripe_customers').select('customer_id').eq('user_id',ctx.userId).single());
  const result=await stripeClient().billingPortal.sessions.create({customer:row.customer_id,return_url:`${env('WEB_ORIGIN')}/settings`});return {url:result.url};
}
