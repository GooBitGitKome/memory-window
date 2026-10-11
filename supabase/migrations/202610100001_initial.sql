-- New project baseline only. No production migration has been applied.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '窓の利用者' check (char_length(display_name) between 1 and 80),
  role text not null default 'end_user' check (role in ('end_user','caregiver','administrator')),
  created_at timestamptz not null default now()
);
create table public.memberships (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'free',
  subscription_id text unique,
  last_event_created bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table public.encrypted_api_keys (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  key_version text not null,
  updated_at timestamptz not null default now()
);
create table public.stripe_customers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  customer_id text not null unique
);
create table public.care_invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null default now()+interval '24 hours',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.care_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  caregiver_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(owner_id,caregiver_id), check(owner_id<>caregiver_id)
);
create table public.needs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  description text not null check (char_length(trim(description)) between 1 and 300),
  status text not null default 'draft' check(status in ('draft','shared')),
  revision integer not null default 1 check(revision>0),
  shared_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 days',
  check((status='shared' and shared_at is not null) or (status='draft' and shared_at is null))
);
create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  need_id uuid references public.needs(id) on delete set null,
  action text not null check(action in ('shared','withdrawn','deleted','grant_revoked')),
  revision integer,
  created_at timestamptz not null default now()
);
create table public.usage_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  reserved_seconds integer not null check(reserved_seconds between 1 and 600),
  duration_seconds integer not null default 0 check(duration_seconds>=0),
  input_tokens bigint check(input_tokens>=0),
  output_tokens bigint check(output_tokens>=0),
  call_id text,
  error_code text,
  check(duration_seconds<=reserved_seconds)
);
create table public.stripe_events (id text primary key,created_at timestamptz not null default now());
create index on public.needs(owner_id,status,expires_at);
create index on public.care_grants(caregiver_id,owner_id) where active;
create index on public.usage_sessions(user_id,started_at);
create index on public.care_invites(owner_id,expires_at);

create function public.initialize_profile() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.profiles(id,display_name,role) values(new.id,
    case when new.raw_user_meta_data->>'role'='caregiver' then '支援者' else '窓の利用者' end,
    case when new.raw_user_meta_data->>'role'='caregiver' then 'caregiver' else 'end_user' end);
  insert into public.memberships(user_id) values(new.id);
  return new;
end;
$$;
create trigger on_new_user after insert on auth.users for each row execute function public.initialize_profile();

create function public.edit_need_withdraws_consent() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.title is distinct from old.title or new.description is distinct from old.description then
    new.revision:=old.revision+1; new.status:='draft';new.shared_at:=null;
  end if;
  return new;
end;
$$;
create trigger on_need_edit before update on public.needs for each row execute function public.edit_need_withdraws_consent();

alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.encrypted_api_keys enable row level security;
alter table public.stripe_customers enable row level security;
alter table public.care_invites enable row level security;
alter table public.care_grants enable row level security;
alter table public.needs enable row level security;
alter table public.consent_events enable row level security;
alter table public.usage_sessions enable row level security;
alter table public.stripe_events enable row level security;

create policy profiles_self on public.profiles for select to authenticated using (id=(select auth.uid()));
create policy memberships_self on public.memberships for select to authenticated using (user_id=(select auth.uid()));
create policy grants_participants on public.care_grants for select to authenticated using (owner_id=(select auth.uid()) or caregiver_id=(select auth.uid()));
create policy needs_owner_or_consented on public.needs for select to authenticated using (
  expires_at>now() and (owner_id=(select auth.uid()) or (status='shared' and exists (
    select 1 from public.care_grants g where g.owner_id=needs.owner_id and g.caregiver_id=(select auth.uid()) and g.active
  )))
);
create policy consent_owner on public.consent_events for select to authenticated using(owner_id=(select auth.uid()));
create policy usage_self on public.usage_sessions for select to authenticated using(user_id=(select auth.uid()));
-- No client policy on encrypted keys, customer mappings, invites or webhook receipts.
revoke all on public.profiles,public.memberships,public.encrypted_api_keys,public.stripe_customers,public.care_invites,public.care_grants,public.needs,public.consent_events,public.usage_sessions,public.stripe_events from anon,authenticated;
grant select on public.profiles,public.memberships,public.care_grants,public.needs,public.consent_events to authenticated;
grant select(id,user_id,started_at,ended_at,reserved_seconds,duration_seconds,input_tokens,output_tokens,error_code) on public.usage_sessions to authenticated;
grant all on public.profiles,public.memberships,public.encrypted_api_keys,public.stripe_customers,public.care_invites,public.care_grants,public.needs,public.consent_events,public.usage_sessions,public.stripe_events to service_role;

create function public.accept_care_invite(p_user uuid,p_hash text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare invitation public.care_invites;grant_id uuid;care_name text;
begin
  select display_name into care_name from public.profiles where id=p_user and role='caregiver';
  if care_name is null then raise exception 'invalid_invite';end if;
  select * into invitation from public.care_invites where token_hash=p_hash and used_at is null and expires_at>now() for update;
  if not found or invitation.owner_id=p_user then raise exception 'invalid_invite';end if;
  insert into public.care_grants(owner_id,caregiver_id,label,active) values(invitation.owner_id,p_user,care_name,true)
    on conflict(owner_id,caregiver_id) do update set active=true,label=excluded.label returning id into grant_id;
  update public.care_invites set used_at=now() where id=invitation.id;
  return grant_id;
end;
$$;
create function public.share_need(p_user uuid,p_need uuid,p_revision integer,p_consent boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.needs;
begin
  if p_consent is not true then raise exception 'consent_required';end if;
  perform 1 from public.profiles where id=p_user for update;
  select * into item from public.needs where id=p_need and owner_id=p_user and expires_at>now() for update;
  if not found then raise exception 'not_found';end if;
  if item.revision<>p_revision then raise exception 'revision_mismatch';end if;
  if not exists(select 1 from public.care_grants where owner_id=p_user and active) then raise exception 'caregiver_required';end if;
  update public.needs set status='shared',shared_at=now() where id=p_need;
  insert into public.consent_events(owner_id,need_id,action,revision) values(p_user,p_need,'shared',p_revision);
end;
$$;
create function public.withdraw_need(p_user uuid,p_need uuid,p_delete boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.needs where id=p_need and owner_id=p_user for update;
  if not found then raise exception 'not_found';end if;
  insert into public.consent_events(owner_id,need_id,action) values(p_user,p_need,case when p_delete then 'deleted' else 'withdrawn' end);
  if p_delete then delete from public.needs where id=p_need;else update public.needs set status='draft',shared_at=null where id=p_need;end if;
end;
$$;
create function public.revoke_care_grant(p_user uuid,p_grant uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.profiles where id=p_user for update;
  update public.care_grants set active=false where id=p_grant and owner_id=p_user;
  if not found then raise exception 'not_found';end if;
  update public.needs set status='draft',shared_at=null where owner_id=p_user;
  insert into public.consent_events(owner_id,action) values(p_user,'grant_revoked');
end;
$$;
create function public.reserve_voice(p_user uuid,p_seconds integer,p_daily_limit integer) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare used integer;session_id uuid;
begin
  if p_seconds<1 or p_seconds>60 or p_daily_limit<1 or p_daily_limit>1800 then raise exception 'invalid_input';end if;
  perform 1 from public.profiles where id=p_user and role='end_user' for update;
  if not found then raise exception 'owner_required';end if;
  if not exists(select 1 from public.memberships where user_id=p_user and status in ('active','trialing')) then raise exception 'premium_required';end if;
  if not exists(select 1 from public.encrypted_api_keys where user_id=p_user) then raise exception 'key_required';end if;
  if exists(select 1 from public.usage_sessions where user_id=p_user and ended_at is null and started_at+reserved_seconds*interval '1 second'>now()) then raise exception 'session_active';end if;
  select coalesce(sum(reserved_seconds),0) into used from public.usage_sessions where user_id=p_user and started_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  if used+p_seconds>p_daily_limit then raise exception 'limit_reached';end if;
  insert into public.usage_sessions(user_id,reserved_seconds) values(p_user,p_seconds) returning id into session_id;
  return session_id;
end;
$$;
create function public.apply_subscription_event(p_event text,p_created bigint,p_customer text,p_subscription text,p_status text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid;
begin
  select user_id into target from public.stripe_customers where customer_id=p_customer;
  if target is null then raise exception 'unknown_customer';end if;
  perform 1 from public.memberships where user_id=target for update;
  if exists(select 1 from public.stripe_events where id=p_event) then return;end if;
  insert into public.stripe_events(id) values(p_event);
  update public.memberships set status=p_status,subscription_id=p_subscription,last_event_created=p_created,updated_at=now() where user_id=target and last_event_created<=p_created;
end;
$$;
create function public.cleanup_expired_data() returns void language sql security definer set search_path=public,pg_temp as $$
  delete from public.needs where expires_at<=now();
  delete from public.care_invites where expires_at<=now();
  delete from public.consent_events where created_at<now()-interval '90 days';
  delete from public.usage_sessions where started_at<now()-interval '90 days';
  delete from public.stripe_events where created_at<now()-interval '90 days';
$$;
revoke execute on function public.initialize_profile(),public.edit_need_withdraws_consent(),public.accept_care_invite(uuid,text),public.share_need(uuid,uuid,integer,boolean),public.withdraw_need(uuid,uuid,boolean),public.revoke_care_grant(uuid,uuid),public.reserve_voice(uuid,integer,integer),public.apply_subscription_event(text,bigint,text,text,text),public.cleanup_expired_data() from public,anon,authenticated;
grant execute on function public.accept_care_invite(uuid,text),public.share_need(uuid,uuid,integer,boolean),public.withdraw_need(uuid,uuid,boolean),public.revoke_care_grant(uuid,uuid),public.reserve_voice(uuid,integer,integer),public.apply_subscription_event(text,bigint,text,text,text),public.cleanup_expired_data() to service_role;

create function public.store_encrypted_key(p_user uuid,p_ciphertext text,p_iv text,p_version text,p_delete boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.profiles where id=p_user and role='end_user' for update;
  if not found then raise exception 'owner_required';end if;
  if exists(select 1 from public.usage_sessions where user_id=p_user and ended_at is null and (call_id is not null or started_at+reserved_seconds*interval '1 second'>now())) then raise exception 'session_active';end if;
  if p_delete then delete from public.encrypted_api_keys where user_id=p_user;
  else
    if p_ciphertext is null or p_iv is null or p_version is null then raise exception 'invalid_input';end if;
    insert into public.encrypted_api_keys(user_id,ciphertext,iv,key_version) values(p_user,p_ciphertext,p_iv,p_version)
      on conflict(user_id) do update set ciphertext=excluded.ciphertext,iv=excluded.iv,key_version=excluded.key_version,updated_at=now();
  end if;
end;
$$;
revoke execute on function public.store_encrypted_key(uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.store_encrypted_key(uuid,text,text,text,boolean) to service_role;
