import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encryptKey,decryptKey} from '../supabase/functions/_shared/crypto.ts';
import {conversationTransition,detectNeeds,hasPremium} from '../packages/core/src/index.ts';
import {ShareInput,DraftInput} from '../packages/api-contracts/src/index.ts';
import {DemoStore,DemoError} from '../scripts/demo-store.ts';

test('AES-GCM isolates users, authenticates ciphertext, and supports key versions',async()=>{
  const master=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
  const nextMaster=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
  const record=await encryptKey('synthetic-secret-for-tests','user-a',master,'v1');
  assert.notEqual(record.ciphertext,'synthetic-secret-for-tests');
  assert.equal(await decryptKey(record,'user-a',{v1:master}),'synthetic-secret-for-tests');
  await assert.rejects(decryptKey(record,'user-b',{v1:master}));
  await assert.rejects(decryptKey({...record,ciphertext:record.ciphertext.slice(0,-4)+'AAAA'},'user-a',{v1:master}));
  await assert.rejects(decryptKey(record,'user-a',{v2:nextMaster}),/unknown_key_version/);
  const rotated=await encryptKey(await decryptKey(record,'user-a',{v1:master}),'user-a',nextMaster,'v2');
  assert.equal(await decryptKey(rotated,'user-a',{v2:nextMaster}),'synthetic-secret-for-tests');
});
test('conversation ignores illegal events, supports interruption, and exits any state',()=>{
  assert.equal(conversationTransition('IDLE','speaking'),'IDLE');
  assert.equal(conversationTransition('IDLE','greet'),'GREETING');
  assert.equal(conversationTransition('GREETING','connect'),'CONNECTING');
  assert.equal(conversationTransition('CONNECTING','ready'),'LISTENING');
  assert.equal(conversationTransition('LISTENING','speaking'),'SPEAKING');
  assert.equal(conversationTransition('SPEAKING','listening'),'LISTENING');
  for(const state of ['GREETING','CONNECTING','LISTENING','SPEAKING','DISCONNECTING'] as const){assert.equal(conversationTransition(state,'stop'),'DISCONNECTING');assert.equal(conversationTransition(state,'closed'),'IDLE');}
  assert.equal(hasPremium('active'),true);for(const value of ['free','past_due','canceled','incomplete'])assert.equal(hasPremium(value),false);
});
test('need detection produces candidates without transcripts and requires explicit versioned consent',()=>{
  const text='内緒の長い会話です。電球が切れたので困っています。';
  const candidates=detectNeeds(text);assert.equal(candidates.length,1);assert.equal(candidates[0].title,'電球の交換');assert.ok(!JSON.stringify(candidates).includes('内緒'));
  assert.equal(ShareInput.safeParse({id:'id',consent:false,revision:1}).success,false);
  assert.equal(ShareInput.safeParse({id:'id',consent:true}).success,false);
  assert.equal(DraftInput.safeParse({title:'お願い',description:'内容',status:'shared'}).success,false);
});
test('demo isolates people, enforces premium and refuses real keys',()=>{
  const store=new DemoStore();const owner=store.login('owner').token;const care=store.login('caregiver').token;const stranger=store.login('stranger').token;const free=store.login('free').token;
  assert.throws(()=>store.snapshot('forged'),(error:unknown)=>error instanceof DemoError && error.status===401);
  assert.throws(()=>store.startVoice(free),/premium_required/);
  assert.throws(()=>store.setKey(owner,'sk-real-looking-value'),/demo_keys_only/);
  const {id}=store.saveDraft(owner,{title:'電球',description:'電球の交換をお願いしたい'});
  assert.equal(store.snapshot(care).sharedNeeds.length,0);
  const invite=store.invite(owner);store.acceptInvite(care,invite.code);
  assert.throws(()=>store.acceptInvite(stranger,invite.code),/invalid_invite/);
  assert.throws(()=>store.share(owner,{id,consent:false,revision:1}),/consent_required/);
  store.share(owner,{id,consent:true,revision:1});assert.equal(store.snapshot(care).sharedNeeds.length,1);assert.equal(store.snapshot(stranger).sharedNeeds.length,0);
  assert.throws(()=>store.deleteNeed(care,id),/owner_required/);
  store.saveDraft(owner,{title:'電球',description:'訂正した内容'},id);assert.equal(store.snapshot(care).sharedNeeds.length,0);
  assert.throws(()=>store.share(owner,{id,consent:true,revision:1}),/revision_mismatch/);
  store.share(owner,{id,consent:true,revision:2});store.withdraw(owner,id);assert.equal(store.snapshot(care).sharedNeeds.length,0);
  store.deleteNeed(owner,id);assert.equal(store.snapshot(owner).needs.length,0);
  store.purchase(free);store.setKey(free,'demo-key-placeholder');const session=store.startVoice(free);assert.throws(()=>store.startVoice(free),/session_active/);store.endVoice(free,session.sessionId);
  assert.equal(store.snapshot(free).dailyReservedSeconds,300);assert.equal(store.snapshot(owner).dailyReservedSeconds,0);
  store.cancelSubscription(free);assert.throws(()=>store.startVoice(free),/premium_required/);
});
