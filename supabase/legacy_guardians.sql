-- Execute no SQL Editor do Supabase antes de disponibilizar o cadastro.
create table if not exists public.legacy_guardians (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  email text not null check (char_length(trim(email)) <= 254),
  phone text,
  role text not null check (role in ('primary', 'alternate')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guardian_email_format check (position('@' in email) > 1),
  constraint guardian_phone_length check (phone is null or char_length(phone) <= 20)
);
create unique index if not exists legacy_guardians_one_role
  on public.legacy_guardians (owner_id,role);
create unique index if not exists legacy_guardians_owner_email
  on public.legacy_guardians (owner_id,lower(email));
alter table public.legacy_guardians enable row level security;
revoke all on public.legacy_guardians from anon;
grant select,insert,update,delete on public.legacy_guardians to authenticated;
drop policy if exists "owner can read guardians" on public.legacy_guardians;
create policy "owner can read guardians" on public.legacy_guardians
 for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "owner can create pending guardians" on public.legacy_guardians;
create policy "owner can create pending guardians" on public.legacy_guardians
 for insert to authenticated with check (owner_id = (select auth.uid()) and status = 'pending');
drop policy if exists "owner can edit pending guardians" on public.legacy_guardians;
create policy "owner can edit pending guardians" on public.legacy_guardians
 for update to authenticated using (owner_id = (select auth.uid()))
 with check (owner_id = (select auth.uid()) and status = 'pending');
drop policy if exists "owner can remove guardians" on public.legacy_guardians;
create policy "owner can remove guardians" on public.legacy_guardians
 for delete to authenticated using (owner_id = (select auth.uid()));
-- O status 'accepted' somente poderá ser definido por fluxo futuro verificado
-- de convite/aceite; o proprietário não pode marcar aceite manualmente.
-- Guardiões não recebem permissões de leitura das memórias neste cadastro.
