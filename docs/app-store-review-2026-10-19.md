# Auditoria de publicação iOS — 19/10/2026

## Motivo da revisão
A Apple apontou Guideline 2.3.3 (capturas do iPad não representam o app atual) e Guideline 2.2 (interface e recursos com aparência de teste).

## Constatações no código
- `index.html`: apresenta "VERSÃO 1.0 · TESTE", "Em testes", assinaturas e contador em preparação.
- A conversa autenticada usa a Edge Function `legacy-conversation` com ações `list` e `message`. É necessário validar a função implantada, isolamento entre usuários, tratamento de falhas e persistência.
- Cadastro e sessão usam Supabase Auth; tokens de sessão são mantidos em localStorage. Revisar segurança e comportamento no iOS.
- Exclusão de conta chama a RPC `delete_my_account`; validar que a função existe, exige identidade autenticada e remove dados associados conforme a política.
- `guardioes.html` possui consulta e operações no Supabase; revisar RLS e autorizações antes da publicação.
- `codemagic.yaml` modifica o HTML do simulador para gerar conversas e guardiões demonstrativos. Capturas para App Store devem vir do aplicativo real, sem substituir funcionalidades por conteúdo artificial.
- `ios-appstore` publica no TestFlight, não envia automaticamente à App Store.

## Correções planejadas
1. Auditar e testar backend: autenticação, conversa, guardiões, exclusão, RLS e privacidade.
2. Escolher um conjunto completo e seguro de funcionalidades da versão 1.0; ocultar recursos indisponíveis, sem fazer promessas enganosas.
3. Retirar textos de teste **somente após** validar o produto para distribuição.
4. Ajustar o fluxo de screenshots para usar telas reais no simulador de iPad 13 polegadas.
5. Executar testes e build de validação, revisar capturas e reenviar à Apple.

## Não fazer
- Não remover avisos de segurança enquanto riscos permanecerem.
- Não usar telas de marketing ou dados fictícios que representem funções inexistentes.
- Não publicar a branch sem testes e aprovação.

Esta auditoria é estática: não comprova que as Edge Functions e RPCs estejam operacionais no Supabase implantado.
