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


-- =====================================================================
-- ETAPA 2: execute SOMENTE este bloco após adaptar a tabela existente.
-- Convite por link compartilhado pelo titular. Não envia mensagens.
-- O convite só pode ser respondido por uma conta com e-mail CONFIRMADO
-- que corresponda ao e-mail cadastrado na indicação.
-- NÃO cria guardian_id nem libera leitura de memórias.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.respond_guardian_invitation(
  p_guardian_id uuid,
  p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_verified timestamptz;
  v_guardian public.legacy_guardians%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Faça login para responder ao convite' USING ERRCODE = '28000';
  END IF;
  IF p_decision NOT IN ('accepted','declined') OR p_decision IS NULL THEN
    RAISE EXCEPTION 'Resposta inválida';
  END IF;

  SELECT u.email, u.email_confirmed_at INTO v_email, v_verified
  FROM auth.users u WHERE u.id = v_user_id;
  IF v_verified IS NULL OR v_email IS NULL THEN
    RAISE EXCEPTION 'Confirme seu e-mail antes de responder';
  END IF;

  SELECT * INTO v_guardian
  FROM public.legacy_guardians g
  WHERE g.id = p_guardian_id
  FOR UPDATE;

  -- Same generic message avoids disclosing whether an invitation exists.
  IF NOT FOUND
     OR lower(trim(coalesce(v_guardian.email, ''))) <> lower(trim(v_email))
     OR v_guardian.status <> 'pending'
     OR v_guardian.guardian_id IS NOT NULL THEN
    RAISE EXCEPTION 'Convite não disponível para esta conta';
  END IF;

  UPDATE public.legacy_guardians
  SET status = p_decision, updated_at = now()
  WHERE id = p_guardian_id;

  -- Intentionally never set guardian_id: legacy_role() cannot grant access.
  RETURN jsonb_build_object('ok', true, 'status', p_decision);
END;
$$;
REVOKE ALL ON FUNCTION public.respond_guardian_invitation(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_guardian_invitation(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.respond_guardian_invitation(uuid,text) TO authenticated;
