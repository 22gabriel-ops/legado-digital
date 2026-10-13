# Fluxo de integração do Legado Digital (pré-produção)

## Sequência de implantação
1. No SQL Editor do projeto Supabase, execute `supabase/legacy_integrations.sql` e `supabase/whatsapp_import_memories.sql` (caso ainda não tenha aplicado o segundo).
2. Configure secrets das Edge Functions: `OPENAI_API_KEY`, `META_WA_ACCESS_TOKEN`, `META_WA_PHONE_NUMBER_ID`, `META_WA_OTP_TEMPLATE`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Configure o template de autenticação WhatsApp no Meta Business e obtenha sua aprovação. O nome deve corresponder a `META_WA_OTP_TEMPLATE`. A função exige `META_WA_OTP_TEMPLATE_LANGUAGE` (padrão pt_BR) se usar outro idioma.
4. Implante `phone-verification-start`, `phone-verification-check` e `legacy-analyze` como Edge Functions do Supabase com validação JWT habilitada onde suportado. Toda função também valida o usuário com `auth.getUser()`.
5. Abra `onboarding-legado.html` autenticado, teste confirmação de WhatsApp, importação de .txt e `conversations.json` da exportação ChatGPT, análise e aprovação.
6. Teste login, logout, telefone errado, código expirado, rate limiting, arquivo grande, mensagens de terceiros e exclusão de conta antes de publicar nova build no Codemagic.

## Limites reais
- Não é possível acessar todas as conversas privadas do WhatsApp por API. O usuário precisa exportar e selecionar os arquivos. Importar "todas" refere-se a todos os arquivos que ele fornecer e autorizar.
- O histórico do ChatGPT é importado a partir da exportação oficial `conversations.json`, **sem OAuth ou sincronização contínua**.
- Arquivos permanecem no dispositivo. Apenas trechos selecionados são enviados à função de IA; apenas sugestões explicitamente salvas entram no banco.
- Para processar um volume grande, implemente lotes, retenção e consentimento granular antes de produção. O processamento atual é limitado a 12 mil caracteres por solicitação.
- Todas as fontes são tratadas como dados não confiáveis, não como instruções. A IA sugere memórias para revisão e não deve imitar pessoas de forma enganosa.
- As credenciais de Meta e OpenAI ficam SOMENTE em secrets do Supabase, nunca no GitHub ou HTML.
- O acesso dos guardiões é separado e depende de verificação e aceite posterior.
