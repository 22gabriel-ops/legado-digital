-- Execute após as migrations WhatsApp e legacy_contacts.
create table if not exists public.legacy_guardians (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 guardian_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('principal','reader')),
 created_at timestamptz not null default now(),
 unique(owner_id,guardian_id),
 check(owner_id <> guardian_id)
);
create index if not exists legacy_guardians_guardian_idx on public.legacy_guardians(guardian_id);
alter table public.legacy_guardians enable row level security;
grant select on public.legacy_guardians to authenticated;

create or replace function public.legacy_role(p_owner uuid)
returns text language sql stable security definer set search_path = public
as $$
 select case when p_owner=auth.uid() then 'owner'
 else (select role from public.legacy_guardians
       where owner_id=p_owner and guardian_id=auth.uid() limit 1) end
$$;
revoke all on function public.legacy_role(uuid) from public;
grant execute on function public.legacy_role(uuid) to authenticated;
drop policy if exists guardian_select on public.legacy_guardians;
create policy guardian_select on public.legacy_guardians for select to authenticated
 using (public.legacy_role(owner_id) is not null);

grant select on public.whatsapp_conversations, public.whatsapp_messages to authenticated;
drop policy if exists guardian_conversations on public.whatsapp_conversations;
create policy guardian_conversations on public.whatsapp_conversations for select to authenticated
 using (public.legacy_role(legacy_user_id) is not null);
drop policy if exists guardian_messages on public.whatsapp_messages;
create policy guardian_messages on public.whatsapp_messages for select to authenticated
 using (exists (select 1 from public.whatsapp_conversations c
 where c.id=conversation_id and public.legacy_role(c.legacy_user_id) is not null));

drop policy if exists guardian_contacts_select on public.legacy_contacts;
create policy guardian_contacts_select on public.legacy_contacts for select to authenticated
 using (public.legacy_role(owner_id) is not null);
drop policy if exists guardian_contacts_insert on public.legacy_contacts;
create policy guardian_contacts_insert on public.legacy_contacts for insert to authenticated
 with check (public.legacy_role(owner_id) in ('owner','principal'));
drop policy if exists guardian_contacts_delete on public.legacy_contacts;
create policy guardian_contacts_delete on public.legacy_contacts for delete to authenticated
 using (public.legacy_role(owner_id) in ('owner','principal'));
