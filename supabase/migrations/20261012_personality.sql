-- Personalidade gerada somente a partir de material importado e autorizado pelo titular.
create table if not exists public.legacy_personalities (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 profile text not null default '',
 source text not null default 'chatgpt_export',
 segments_processed integer not null default 0,
 updated_at timestamptz not null default now(),
 check (source='chatgpt_export')
);
alter table public.legacy_personalities enable row level security;
grant select on public.legacy_personalities to authenticated;
drop policy if exists personality_owner_read on public.legacy_personalities;
create policy personality_owner_read on public.legacy_personalities
 for select to authenticated using (owner_id=auth.uid());
-- Alterações somente na Edge Function com chave service role.
