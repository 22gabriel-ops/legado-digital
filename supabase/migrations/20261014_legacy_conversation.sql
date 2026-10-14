-- Legado Digital: onboarding conversacional e importações privadas
create table if not exists public.legacy_profiles (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 stage text not null default 'discovering' check(stage in ('discovering','ready')),
 summary text not null default '',
 speaking_style text not null default '',
 exchanges integer not null default 0,
 ready_at timestamptz,
 updated_at timestamptz not null default now()
);
create table if not exists public.legacy_chat_turns (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('user','assistant')),
 content text not null check(char_length(content) between 1 and 8000),
 created_at timestamptz not null default now()
);
create index if not exists legacy_chat_turns_owner_idx on public.legacy_chat_turns(owner_id, created_at desc);
create table if not exists public.legacy_memory_suggestions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 content text not null,
 status text not null default 'pending' check(status in ('pending','approved','discarded')),
 source text not null default 'chat' check(source in ('chat','whatsapp_import','chatgpt_import')),
 created_at timestamptz not null default now()
);
create index if not exists legacy_memory_suggestions_owner_idx on public.legacy_memory_suggestions(owner_id,status,created_at desc);
create table if not exists public.legacy_user_entitlements (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 plan text not null default 'essential' check(plan in ('essential','complete')),
 active_until timestamptz,
 updated_at timestamptz not null default now()
);
create table if not exists public.legacy_import_batches (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 source text not null check(source in ('whatsapp','chatgpt')),
 filename text not null,
 selected_count integer not null default 0,
 created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['legacy_profiles','legacy_chat_turns','legacy_memory_suggestions','legacy_user_entitlements','legacy_import_batches'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;
drop policy if exists legacy_profile_own_select on public.legacy_profiles;
create policy legacy_profile_own_select on public.legacy_profiles for select to authenticated using(owner_id=auth.uid());
drop policy if exists legacy_turns_own_select on public.legacy_chat_turns;
create policy legacy_turns_own_select on public.legacy_chat_turns for select to authenticated using(owner_id=auth.uid());
drop policy if exists legacy_suggestions_own_select on public.legacy_memory_suggestions;
create policy legacy_suggestions_own_select on public.legacy_memory_suggestions for select to authenticated using(owner_id=auth.uid());
drop policy if exists legacy_entitlements_own_select on public.legacy_user_entitlements;
create policy legacy_entitlements_own_select on public.legacy_user_entitlements for select to authenticated using(owner_id=auth.uid());
drop policy if exists legacy_import_batches_own_select on public.legacy_import_batches;
create policy legacy_import_batches_own_select on public.legacy_import_batches for select to authenticated using(owner_id=auth.uid());
-- service-role-only write paths; never trust user-provided owner ids or plans
