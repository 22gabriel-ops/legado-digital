-- Código de uso exclusivo das funções server-side com service_role.
create table if not exists public.legacy_phone_otp (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 phone text not null,
 code_hash text not null,
 sent_at timestamptz not null,
 expires_at timestamptz not null,
 attempts integer not null default 0
);
alter table public.legacy_phone_otp enable row level security;
revoke all on public.legacy_phone_otp from anon,authenticated;
