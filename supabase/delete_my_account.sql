-- Legado Digital: exclusão da própria conta.
-- Execute uma vez no Supabase SQL Editor com privilégios de administrador.
-- A função usa auth.uid() para identificar o titular: NÃO aceita ID de usuário do cliente.
-- public.memories.user_id possui ON DELETE CASCADE para auth.users(id).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  delete from auth.users
  where id = current_user_id;

  if not found then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;

-- Nota: a exclusão aqui envolve auth.users e tabelas vinculadas por CASCADE.
-- Outros serviços, anexos, backups e logs exigem análise de retenção e
-- eventual exclusão específica antes do lançamento comercial.
