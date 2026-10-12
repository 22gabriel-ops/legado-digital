# WhatsApp + IA — Legado Digital (protótipo)

Este trabalho está na branch `feature/whatsapp-legado-mvp` e **não altera o app iOS nem o site em produção**.

## Escopo

- Um único número de WhatsApp Business Cloud API e **um único titular de legado**, definido por `LEGACY_OWNER_ID`.
- Mensagens de texto recebidas via webhook assinado pela Meta.
- Consentimento explícito do visitante com `ACEITO` e exclusão da conversa com `APAGAR`.
- Memórias privadas já existentes na tabela `memories`; histórico por remetente no Supabase.
- Resposta da OpenAI com aviso de que é uma representação digital.
- **Não disponível ainda:** criação automática de número por usuário, grupos, pagamento, áudio, visualização de histórico no painel, autorização por guardião, ativação póstuma, controle de acesso fino por memória, relatórios de custo, ou produção em larga escala.

## Configuração necessária (pelo proprietário)

1. No Supabase projeto `rwzksewulqpzsdbuirrq`, executar `supabase/migrations/20261012_whatsapp_mvp.sql` no SQL Editor, após conferir o esquema.
2. Criar uma aplicação na [Meta for Developers](https://developers.facebook.com/), adicionar WhatsApp e obter número de teste ou novo número próprio, `phone_number_id`, token de acesso e App Secret.
3. No Supabase → Edge Functions → Secrets, cadastrar:
   - `META_APP_SECRET` — App Secret da Meta.
   - `WHATSAPP_VERIFY_TOKEN` — valor aleatório inventado por você para validação GET.
   - `WHATSAPP_ACCESS_TOKEN` — token da Meta (para produção, token de longa duração de usuário do sistema).
   - `WHATSAPP_PHONE_NUMBER_ID` — ID do número da Meta (não é o telefone formatado).
   - `LEGACY_OWNER_ID` — UUID do titular que cadastrou as memórias no Supabase Auth.
   - `OPENAI_API_KEY` — chave da OpenAI, com saldo e limites.
   - `OPENAI_MODEL` — opcional; por padrão `gpt-4.1-mini`.
   - `META_GRAPH_VERSION` — opcional, por padrão `v23.0`; atualizar conforme a versão suportada pela Meta.
4. Implantar `whatsapp-webhook` como Supabase Edge Function **pública**, com verificação JWT desativada somente para esta função. O POST exige assinatura HMAC `X-Hub-Signature-256`; o GET exige verify token.
5. Configurar na Meta o webhook `https://rwzksewulqpzsdbuirrq.supabase.co/functions/v1/whatsapp-webhook` e o mesmo verify token, assinando o campo `messages`.
6. Testar com um telefone autorizado pela Meta: mensagem inicial → aviso → `ACEITO` → pergunta sobre memória cadastrada → `APAGAR`.

## Cuidados antes de clientes reais

Verificar política de privacidade, LGPD e base legal para memórias e contatos de terceiros; consentimento, limites de retenção, gestão de remoção, bloqueio de abuso, segregação de múltiplos titulares e transparência de IA. O MVP permite exclusivamente teste controlado e precisa de revisão adicional (idempotência transacional, fila/retry, rate limits, observabilidade, controle de custos, apagamento de cópias/backups e auditoria) antes de produção.

Nunca publicar secrets no GitHub, prints ou frontend. Mensagens são enviadas aos serviços Meta e OpenAI; não há criptografia ponta a ponta dos dados processados no servidor.
