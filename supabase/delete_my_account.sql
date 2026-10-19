-- Meu Legado: exclusão da própria conta com checagem prévia de vínculos.
-- Execute no Supabase SQL Editor, após revisar o relatório de dependências.
-- Não executa exclusão ao instalar esta função.
-- A exclusão é transacional: uma falha reverte a operação no banco.
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_unsafe text;
  v_unlinked text;
BEGIN
  IF v_uid IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  -- Falhar fechado se houver FKs para auth.users sem ON DELETE CASCADE.
  SELECT string_agg(format('%I.%I (%s)', n.nspname, t.relname, c.conname), ', ')
    INTO v_unsafe
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE c.contype = 'f' AND c.confrelid = 'auth.users'::regclass
    AND c.confdeltype <> 'c'
    AND n.nspname = 'public';
  IF v_unsafe IS NOT NULL THEN
    RAISE EXCEPTION 'Exclusão não habilitada: vínculos sem CASCADE: %', v_unsafe;
  END IF;

  -- Tabelas públicas que identificam um titular devem ter FK para auth.users.
  -- Não apague tabelas desconhecidas por inferência: peça revisão da migração.
  SELECT string_agg(format('%I.%I.%I', ns.nspname, cl.relname, a.attname), ', ')
    INTO v_unlinked
  FROM pg_attribute a
  JOIN pg_class cl ON cl.oid = a.attrelid
  JOIN pg_namespace ns ON ns.oid = cl.relnamespace
  WHERE ns.nspname = 'public' AND cl.relkind IN ('r', 'p')
    AND a.attname IN ('owner_id', 'user_id') AND a.attnum > 0 AND NOT a.attisdropped
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint fk
      WHERE fk.conrelid = cl.oid AND fk.contype = 'f'
        AND fk.confrelid = 'auth.users'::regclass
        AND a.attnum = ANY(fk.conkey)
    );
  IF v_unlinked IS NOT NULL THEN
    RAISE EXCEPTION 'Exclusão não habilitada: colunas de titular sem FK: %', v_unlinked;
  END IF;

  DELETE FROM auth.users WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- Limites: esta função cobre somente linhas ligadas ao usuário por FKs
-- ON DELETE CASCADE no banco ativo. NÃO elimina automaticamente arquivos
-- Storage, backups, logs externos, dados da Meta ou serviços de terceiros.
-- Antes de afirmar "exclusão completa", audite essas retenções separadamente.
