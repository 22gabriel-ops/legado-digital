-- Guardian invitations: accept only after verified authenticated sign-in.
create table if not exists public.legacy_guardian_invites (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 email text not null,
 role text not null check(role in ('principal','reader')),
 token_hash text not null unique,
 expires_at timestamptz not null default now()+interval '7 days',
 accepted_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.legacy_guardian_invites enable row level security;
create extension if not exists pgcrypto;

create or replace function public.invite_legacy_guardian(p_owner uuid,p_email text,p_role text)
returns text language plpgsql security definer set search_path = public,extensions
as $$
declare secret text;
begin
 if public.legacy_role(p_owner) not in ('owner','principal') then raise exception 'Not authorized'; end if;
 if p_role not in ('principal','reader') then raise exception 'Invalid role'; end if;
 if p_email is null or length(trim(p_email))<3 or length(p_email)>320 then raise exception 'Invalid email'; end if;
 secret:=encode(gen_random_bytes(24),'hex');
 insert into public.legacy_guardian_invites(owner_id,email,role,token_hash)
 values(p_owner,lower(trim(p_email)),p_role,encode(digest(secret,'sha256'),'hex'));
 return secret;
end $$;
revoke all on function public.invite_legacy_guardian(uuid,text,text) from public;
grant execute on function public.invite_legacy_guardian(uuid,text,text) to authenticated;

create or replace function public.accept_legacy_guardian(p_token text)
returns void language plpgsql security definer set search_path = public,extensions
as $$
declare inv public.legacy_guardian_invites%rowtype; account_email text;
begin
 select email into account_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if account_email is null then raise exception 'Verified account required'; end if;
 select * into inv from public.legacy_guardian_invites
 where token_hash=encode(digest(p_token,'sha256'),'hex')
 and accepted_at is null and expires_at>now() for update;
 if not found or lower(account_email)<>inv.email then raise exception 'Invalid invitation'; end if;
 if inv.owner_id=auth.uid() then raise exception 'Owner cannot be guardian'; end if;
 insert into public.legacy_guardians(owner_id,guardian_id,role)
 values(inv.owner_id,auth.uid(),inv.role)
 on conflict(owner_id,guardian_id) do update set role=excluded.role;
 update public.legacy_guardian_invites set accepted_at=now() where id=inv.id;
end $$;
revoke all on function public.accept_legacy_guardian(text) from public;
grant execute on function public.accept_legacy_guardian(text) to authenticated;

create or replace function public.change_legacy_guardian(p_owner uuid,p_guardian uuid,p_role text)
returns void language plpgsql security definer set search_path = public
as $$
begin
 if public.legacy_role(p_owner) not in ('owner','principal') then raise exception 'Not authorized'; end if;
 if p_role is null then
   delete from public.legacy_guardians where owner_id=p_owner and guardian_id=p_guardian;
 elsif p_role in ('principal','reader') then
   update public.legacy_guardians set role=p_role where owner_id=p_owner and guardian_id=p_guardian;
 else raise exception 'Invalid role';
 end if;
end $$;
revoke all on function public.change_legacy_guardian(uuid,uuid,text) from public;
grant execute on function public.change_legacy_guardian(uuid,uuid,text) to authenticated;
