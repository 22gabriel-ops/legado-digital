# Legado Digital — implantação da conversa humanizada (14/10/2026)

## Já versionado
- `construir-legado.html`: conversa natural e revisão das memórias sugeridas.
- `importar-legado.html`: seleção local de trechos de WhatsApp e conversas do ChatGPT, envio de lotes privados para revisão. Lê .txt e conversations.json extraído do ZIP. Não importa a mídia e não lê backup criptografado do WhatsApp.
- `supabase/functions/legacy-conversation/index.ts`: endpoint autenticado de conversa e revisão, individual por `auth.uid()`.
- `supabase/functions/legacy-import/index.ts`: recebe apenas lotes selecionados com assinatura comprovada no banco; não confia em informações sobre plano enviadas pelo navegador.
- `supabase/migrations/20261014_legacy_conversation.sql`: esquema privado com RLS.
- `index.html`: links para conversa gratuita e importação.

## Ordem para habilitar (uma etapa de cada vez)
1. Rodar `supabase/migrations/20261014_legacy_conversation.sql` no SQL Editor.
2. Publicar a Edge Function `legacy-conversation` copiando seu `index.ts` do GitHub. Desativar a opção antiga 'Verify JWT with legacy secret' APENAS porque o código valida explicitamente `auth.getUser(token)`; confirmar que `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e publishable/anon key estão configuradas.
3. Testar login e conversa no site com conta confirmada; conferir `legacy_chat_turns`, `legacy_profiles` e `legacy_memory_suggestions`. Confirmar memória sugerida e verificar registro em `memories`.
4. Publicar a Edge Function `legacy-import` e testar que usuário gratuito recebe HTTP 403; nunca conceder premium editando metadados do navegador.
5. Integrar provedor de cobrança validando assinatura via webhook assinado antes de inserir/atualizar `legacy_user_entitlements`. Nenhuma liberação comercial antes disso.
6. Testar importação de dados sintéticos sem informação real de terceiros, revisar o que foi enviado e testar descarte/exclusão.

## Restrições e ações ainda necessárias
- **Não executar importação real integral de Gabriel até concluir auditoria de privacidade, revisão dos dados e testes de carga.** O modelo atual oferece prévia e revisão de texto, mas ainda não possui ingestão resiliente de arquivos gigantes, arquivos .zip automáticos, detecção consistente de PII em larga escala, processamento de mídias, deduplicação semântica nem job assíncrono.
- Importação não é ingestão automática de personalidade. Textos ficam pendentes para revisão e aprovação; construir o perfil em lotes revisados é etapa futura.
- O WhatsApp webhook de produção foi editado diretamente no Supabase, e **continua MVP de proprietário único (`LEGACY_OWNER_ID`)**. Não mudar `WHATSAPP_REQUIRE_VERIFICATION` para true nem liberar outros titulares antes de implantar OTP e roteamento seguro.
- Não prometer armazenamento/exclusão integral sem políticas de retenção e mecanismos implementados.
- Meta `legado_digital_verificacao` depende de aprovação para mensagens OTP.
- Boas-vindas permanecem desligadas (`WHATSAPP_WELCOME_ENABLED=false`).
- As interfaces adicionadas à `index.html` são links, não funcionam em iOS já instalado sem nova build, se aplicável.
