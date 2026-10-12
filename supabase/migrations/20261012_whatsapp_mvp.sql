-- Legado Digital: mensagens WhatsApp do protótipo.
-- Execute no SQL Editor do projeto Supabase após revisar os dados existentes.
create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  legacy_user_id uuid not null references auth.users(id) on delete cascade,
  sender_wa_id text not null,
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (legacy_user_id, sender_wa_id)
);
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  meta_message_id text unique,
  direction text not null check (direction in ('in', 'out')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_messages_history_idx
  on public.whatsapp_messages (conversation_id, created_at desc);
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
-- Nenhuma política para anon/authenticated: acesso somente pela Edge Function com service role.
revoke all on public.whatsapp_conversations from anon, authenticated;
revoke all on public.whatsapp_messages from anon, authenticated;
