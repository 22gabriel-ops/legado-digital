# Revisão App Store — versão 1.0

## Funcionalidades disponíveis para a revisão
- Cadastro por e-mail, confirmação e login no Supabase.
- Conversa autenticada no aplicativo via função `legacy-conversation` (necessita backend acessível e configurado).
- Indicação e gestão de guardiões pela página real `guardioes.html` (necessita tabelas e políticas RLS configuradas).

## Recursos opcionais ou ainda limitados
- WhatsApp: verificação e mensagens dependem da configuração Meta/Supabase e autorização do número; não é necessário para conversar no app.
- Importações de conversas: não disponíveis nesta versão.
- Assinaturas e contador de interações: interface apresenta limites previstos, mas o controle de consumo não está implementado no cliente; não anunciar cobrança ou franquia ativa sem validar backend.

## Teste obrigatório antes de reenviar
1. Usar conta de revisão com e-mail confirmado, dados não sensíveis e credenciais inseridas de modo seguro em App Store Connect.
2. Confirmar login e logout em instalação limpa no iPhone e iPad.
3. Enviar uma mensagem e confirmar resposta real; sair, entrar novamente e verificar persistência.
4. Abrir Guardiões; salvar indicação fictícia autorizada e verificar atualização e exclusão, quando disponíveis.
5. Verificar recuperação de senha, erros de rede e fluxos de confirmação de e-mail.
6. Capturar telas reais da MESMA compilação que será enviada à Apple.
7. Não usar screenshots de simulador que ocultem dados alterando o HTML, nem mockar o chat/guardiões.

**Importante:** alterações de interface não comprovam funcionamento dos serviços externos. Não declarar a pendência 2.2 resolvida até passar nos testes ponta a ponta.
