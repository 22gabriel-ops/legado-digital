# Legado Digital — fluxo simples de ativação

1. Criar conta no Legado Digital com e-mail e senha.
2. Clicar em **Importar meu ChatGPT**, solicitar exportação pelos meios oficiais do ChatGPT e selecionar o ZIP quando estiver disponível. O importador analisa mensagens atribuídas ao titular e deve excluir dados sensíveis e conteúdo de terceiros antes de gerar um perfil.
3. Clicar em **Ativar meu legado** quando o backend de WhatsApp multiusuário, os números e as autorizações da Meta estiverem configurados. No estágio atual, o botão permanece desabilitado e explica o motivo.

## Credenciais

Nenhum cliente final deve cadastrar chaves OpenAI, Meta ou Supabase. A empresa Legado Digital administra as integrações e os segredos no servidor. Jamais incorporar esses segredos ao app iOS, ao site ou ao repositório público.

## Limites importantes

- Não existe importação automática irrestrita do histórico privado de uma conta pessoal ChatGPT via API; a exportação exige ação do titular.
- A integração com o WhatsApp depende de cadastro e aprovação Meta, opt-in dos destinatários e fluxo de mensagens adequado.
- O nome de exibição e a foto do WhatsApp correspondem ao número comercial; múltiplas personalidades com nome/foto específicos exigem estratégia de números por legado ou transparência em um contato compartilhado.
- As importações, mensagens e guardiões precisam de testes de segurança e conformidade antes de ativação pública.

## Estado atual

Fluxo da interface atualizado na branch de desenvolvimento. Não implantado em produção. A ativação continua indisponível até implantação, configuração e testes do backend. A revisão Apple 1.0 permanece independente.
