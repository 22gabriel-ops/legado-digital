-- Contatos privados por titular: nenhum disparo automático.
create table if not exists public.legacy_contacts (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 1 and 80),
 phone_e164 text not null check (phone_e164 ~ '^[1-9][0-9]{9,14}$'),
 created_at timestamptz not null default now(),
 unique(owner_id,phone_e164)
);
create index if not exists legacy_contacts_owner_idx on public.legacy_contacts(owner_id);
alter table public.legacy_contacts enable row level security;
revoke all on public.legacy_contacts from anon;
grant select,insert,delete on public.legacy_contacts to authenticated;
drop policy if exists legacy_contacts_owner_select on public.legacy_contacts;
create policy legacy_contacts_owner_select on public.legacy_contacts for select to authenticated using ((select auth.uid())=owner_id);
drop policy if exists legacy_contacts_owner_insert on public.legacy_contacts;
create policy legacy_contacts_owner_insert on public.legacy_contacts for insert to authenticated with check ((select auth.uid())=owner_id);
drop policy if exists legacy_contacts_owner_delete on public.legacy_contacts;
create policy legacy_contacts_owner_delete on public.legacy_contacts for delete to authenticated using ((select auth.uid())=owner_id);
