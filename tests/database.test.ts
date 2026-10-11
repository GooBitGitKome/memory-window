import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const owner='00000000-0000-4000-8000-000000000001';
const care='00000000-0000-4000-8000-000000000002';
const stranger='00000000-0000-4000-8000-000000000003';
async function database() {
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,service_role,anon;grant execute on function auth.uid() to authenticated,service_role,anon;`);
  await db.exec(await readFile('supabase/migrations/202610100001_initial.sql','utf8'));
  await db.query('insert into auth.users(id,raw_user_meta_data) values ($1,$4::jsonb),($2,$5::jsonb),($3,$5::jsonb)',[owner,care,stranger,'{"role":"administrator"}','{"role":"caregiver"}']);
  return db;
}
async function asUser<T>(db:PGlite,id:string,fn:()=>Promise<T>) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');
  try{return await fn();}finally{await db.exec('reset role');}
}
test('migration enforces isolation, secrets denial and explicit consent with revocation',async()=>{
  const db=await database();
  try {
    const profile=await db.query<{role:string}>('select role from profiles where id=$1',[owner]);assert.equal(profile.rows[0].role,'end_user','sign-up metadata cannot grant administrator');
    const {rows:[need]}=await db.query<{id:string}>("insert into needs(owner_id,title,description) values($1,'電球','電球の交換をお願いしたい') returning id",[owner]);
    await db.query("insert into care_grants(owner_id,caregiver_id,label) values($1,$2,'支援者')",[owner,care]);
    assert.equal((await asUser(db,care,()=>db.query('select * from needs'))).rows.length,0);
    await assert.rejects(asUser(db,owner,()=>db.query("update needs set status='shared',shared_at=now() where id=$1",[need.id])),/permission denied/);
    await assert.rejects(asUser(db,owner,()=>db.query('select * from encrypted_api_keys')),/permission denied/);
    await assert.rejects(asUser(db,care,()=>db.query('select share_need($1,$2,1,true)',[owner,need.id])),/permission denied/);
    await assert.rejects(db.query('select share_need($1,$2,1,false)',[owner,need.id]),/consent_required/);
    await db.query('select share_need($1,$2,1,true)',[owner,need.id]);
    assert.equal((await asUser(db,care,()=>db.query('select * from needs'))).rows.length,1);
    assert.equal((await asUser(db,stranger,()=>db.query('select * from needs'))).rows.length,0);
    await db.query("update needs set description='訂正したお願い' where id=$1",[need.id]);
    assert.equal((await asUser(db,care,()=>db.query('select * from needs'))).rows.length,0);
    await assert.rejects(db.query('select share_need($1,$2,1,true)',[owner,need.id]),/revision_mismatch/);
    await db.query('select share_need($1,$2,2,true)',[owner,need.id]);
    const grant=(await db.query<{id:string}>('select id from care_grants where owner_id=$1',[owner])).rows[0];
    await db.query('select revoke_care_grant($1,$2)',[owner,grant.id]);
    assert.equal((await asUser(db,care,()=>db.query('select * from needs'))).rows.length,0);
    assert.equal((await db.query<{status:string}>('select status from needs where id=$1',[need.id])).rows[0].status,'draft');
  } finally{await db.close();}
});
test('quota reserves atomically, private invite is single-use, webhook is idempotent and ordered',async()=>{
  const db=await database();
  try {
    await assert.rejects(db.query('select reserve_voice($1,60,120)',[owner]),/premium_required/);
    await db.query("update memberships set status='active' where user_id=$1",[owner]);
    await db.query("insert into encrypted_api_keys(user_id,ciphertext,iv,key_version) values($1,'cipher','iv','v1')",[owner]);
    const first=(await db.query<{id:string}>('select reserve_voice($1,60,120) as id',[owner])).rows[0].id;
    await assert.rejects(db.query('select reserve_voice($1,60,120)',[owner]),/session_active/);
    await assert.rejects(db.query("select store_encrypted_key($1,'changed','iv','v1')",[owner]),/session_active/);
    await db.query('update usage_sessions set ended_at=now() where id=$1',[first]);
    const second=(await db.query<{id:string}>('select reserve_voice($1,60,120) as id',[owner])).rows[0].id;
    await db.query('update usage_sessions set ended_at=now() where id=$1',[second]);
    await assert.rejects(db.query('select reserve_voice($1,60,120)',[owner]),/limit_reached/);
    await db.query("insert into care_invites(owner_id,token_hash) values($1,'one-time-hash')",[owner]);
    await db.query("select accept_care_invite($1,'one-time-hash')",[care]);
    await assert.rejects(db.query("select accept_care_invite($1,'one-time-hash')",[stranger]),/invalid_invite/);
    await db.query("insert into stripe_customers(user_id,customer_id) values($1,'cus_test')",[owner]);
    await db.query("select apply_subscription_event('evt_new',200,'cus_test','sub_test','canceled')");
    await db.query("select apply_subscription_event('evt_old',100,'cus_test','sub_test','active')");
    await db.query("select apply_subscription_event('evt_new',200,'cus_test','sub_test','active')");
    assert.equal((await db.query<{status:string}>('select status from memberships where user_id=$1',[owner])).rows[0].status,'canceled');
    await db.query("insert into needs(owner_id,title,description,expires_at) values($1,'期限切れ','保存期限のテスト',now()-interval '1 day')",[owner]);
    assert.equal((await asUser(db,owner,()=>db.query('select * from needs'))).rows.length,0);
    await db.query('select cleanup_expired_data()');assert.equal((await db.query('select * from needs')).rows.length,0);
  } finally{await db.close();}
});
