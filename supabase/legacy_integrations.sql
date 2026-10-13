-- Execute após whatsapp_import_memories.sql.
create table if not exists public.legacy_memory_candidates (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 source_type text not null check (source_type in ('whatsapp','chatgpt')),
 source_label text not null default '',
 statement text not null check (length(statement) between 5 and 2000),
 evidence text not null default '',
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz
);
create index if not exists legacy_memory_candidates_owner on public.legacy_memory_candidates(owner_id,created_at desc);
alter table public.legacy_memory_candidates enable row level security;
revoke all on public.legacy_memory_candidates from anon;
grant select,insert,update,delete on public.legacy_memory_candidates to authenticated;
drop policy if exists "memory candidates select own" on public.legacy_memory_candidates;
create policy "memory candidates select own" on public.legacy_memory_candidates for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists "memory candidates insert own" on public.legacy_memory_candidates;
create policy "memory candidates insert own" on public.legacy_memory_candidates for insert to authenticated with check(owner_id=(select auth.uid()) and status='pending');
drop policy if exists "memory candidates review own" on public.legacy_memory_candidates;
create policy "memory candidates review own" on public.legacy_memory_candidates for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and status in ('pending','approved','rejected'));
drop policy if exists "memory candidates remove own" on public.legacy_memory_candidates;
create policy "memory candidates remove own" on public.legacy_memory_candidates for delete to authenticated using(owner_id=(select auth.uid()));
-- As memórias aprovadas permanecem com evidência e origem. Nunca afirmar que são fatos sem validação.
create table if not exists public.legacy_phone_verifications (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 phone text not null check(phone ~ '^\+[1-9][0-9]{6,14}$'),
 verified_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.legacy_phone_verifications enable row level security;
revoke all on public.legacy_phone_verifications from anon,authenticated;
-- Verificação acessível apenas por Edge Functions com service_role. Não criar políticas públicas.
-- Conferir a rotina de exclusão de conta para incluir tabelas de dados sem cascata.
