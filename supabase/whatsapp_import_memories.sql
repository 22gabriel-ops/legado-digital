-- Importação manual do WhatsApp: guarda apenas memórias escolhidas pelo titular.
-- Nenhuma conversa integral ou anexo é armazenado.
create table if not exists public.whatsapp_import_memories (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 memory_text text not null check (char_length(trim(memory_text)) between 1 and 2000),
 source_speaker text not null check (char_length(source_speaker) between 1 and 120),
 source_date text,
 source_type text not null default 'whatsapp_export' check (source_type='whatsapp_export'),
 created_at timestamptz not null default now()
);
create index if not exists whatsapp_import_memories_owner_idx on public.whatsapp_import_memories(owner_id,created_at desc);
alter table public.whatsapp_import_memories enable row level security;
revoke all on public.whatsapp_import_memories from anon;
grant select,insert,delete on public.whatsapp_import_memories to authenticated;
drop policy if exists "read own whatsapp memories" on public.whatsapp_import_memories;
create policy "read own whatsapp memories" on public.whatsapp_import_memories for select to authenticated using (owner_id=(select auth.uid()));
drop policy if exists "insert own whatsapp memories" on public.whatsapp_import_memories;
create policy "insert own whatsapp memories" on public.whatsapp_import_memories for insert to authenticated with check (owner_id=(select auth.uid()));
drop policy if exists "delete own whatsapp memories" on public.whatsapp_import_memories;
create policy "delete own whatsapp memories" on public.whatsapp_import_memories for delete to authenticated using (owner_id=(select auth.uid()));
-- Atenção: memória importada não é fato confirmado nem disponível automaticamente ao chatbot.
-- A integração futura com a IA deve respeitar autoria, privacidade e consentimento.
