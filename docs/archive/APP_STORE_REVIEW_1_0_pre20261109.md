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


## Verificações adicionais antes de liberar para produção (19/10/2026)
- [ ] Confirmar conversa e consentimento no WhatsApp de Gabriel, Lucas e Raphael. Gabriel e Lucas passaram em teste manual; Raphael pendente.
- [ ] Confirmar isolamento entre titulares: cada usuário vê apenas o próprio perfil e histórico, inclusive com números brasileiros recebidos sem o nono dígito.
- [ ] Validar que um número não verificado e um número ambíguo não recebem conteúdo privado.
- [ ] Confirmar que o webhook implantado no Supabase corresponde ao código versionado em `supabase/functions/whatsapp-webhook/index.ts`. O commit no GitHub não atualiza automaticamente a função implantada.
- [ ] Testar exclusão da conta com dados de conversas, sugestões, guardiões e importações; verificar cascatas, dados órfãos e retenção. O SQL `delete_my_account.sql` não comprova exclusão integral.
- [ ] Testar fluxo de recuperação de senha, verificação de e-mail, login e logout em iPhone e iPad.
- [ ] Conferir que não há promessa de assinatura paga, importação integral ou número exclusivo como serviço já disponível.
- [ ] Confirmar status da revisão Apple antes de enviar nova compilação.
- [ ] Testar restauração de sessão e erros de rede sem exposição de informações privadas.

## Atenção a importações
`construir-legado.html` e `importar-legado.html` descrevem importação integral de WhatsApp/ChatGPT como futura. Há um protótipo `importar-whatsapp.html` de seleção manual de trechos, que não deve ser apresentado como importação integral pronta nem usado como prova de integração automática à IA.

## Regra de lançamento
Não publicar assinaturas, compartilhamento externo do Legado ou número exclusivo antes de validar pagamento, autorização de acesso, custos e isolamento por titular.

## Correções de autenticação e exclusão preparadas em 19/10/2026
- Cadastro sem WhatsApp agora permitido no `index.html`; validar em iPhone e iPad, inclusive sem consentimento.
- Recuperação de senha e confirmação de e-mail usam `https://legadodigitalapp.com.br/index.html?app=1` como `redirect_to`. **Adicionar esse endereço na lista de Redirect URLs permitidas no Supabase Auth → URL Configuration**, caso ainda não esteja cadastrado. Testar links abertos no Safari e dentro do aplicativo.
- A recuperação de senha é concluída pelo navegador, não por deep link nativo. Não afirmar suporte a retorno automático ao app até implementar e testar Universal Links.
- `supabase/delete_my_account.sql` foi reforçado para falhar fechado diante de FKs públicas não CASCADE ou colunas `owner_id`/`user_id` sem vínculo direto. **Instalar manualmente no SQL Editor**, revisar erros de dependência e testar com conta descartável. Não testar exclusão na conta real de Gabriel, Lucas ou Raphael.
- O SQL não garante exclusão de Storage, backups, logs da Meta, fornecedores externos nem tabelas com vínculo indireto; revisar política de retenção e inventário antes de anunciar exclusão integral.
- Alterações em `index.html` precisam ser incluídas em novo build iOS para valer no aplicativo instalado; alterações no site podem aparecer antes. Evitar enviar nova build enquanto a versão atual estiver em revisão sem necessidade.
