# Permissões dos guardiões — decisão atualizada

O Legado Digital possui três papéis administrativos: um único Titular, múltiplos Guardiões Principais e múltiplos Guardiões Leitores. Não há limite de um único Guardião Principal.

| Ação | Titular | Guardião Principal | Guardião Leitor |
| --- | --- | --- | --- |
| Ler todas as conversas, antigas e futuras | Sim | Sim | Sim |
| Ver os contatos | Sim | Sim | Sim |
| Adicionar e remover contatos | Sim | Sim | Não |
| Adicionar guardiões Principais ou Leitores | Sim | Sim | Não |
| Remover guardiões e alterar seus papéis | Sim | Sim | Não |
| Excluir o legado | Sim | Não | Não |

## Regras obrigatórias

- O titular e qualquer Guardião Principal ativo podem convidar novos Guardiões Principais e Guardiões Leitores, sem limite de quantidade de Principais definido pelo produto. Também podem remover guardiões e alterar seus papéis, mas nunca retirar o titular nem excluir o legado.
- Guardiões Leitores não podem convidar, promover, rebaixar nem remover guardiões.
- Um guardião Leitor pode apenas ler todas as conversas e consultar os contatos. Não pode enviar mensagens, alterar contatos, autorizações ou guardiões.
- Todo guardião ativo pode ler todas as conversas anteriores e posteriores à sua entrada.
- A entrada de um guardião requer convite, autenticação e aceite explícito.
- A remoção de um guardião deve revogar o acesso pelo servidor imediatamente; não é possível revogar cópias já exportadas.
- O titular mantém acesso e autoridade total. Auditoria deve registrar concessões, alterações e remoções de permissões.
- Pessoas que conversam com a IA devem saber, antes da conversa, que estão falando com uma representação por IA e que o histórico poderá ser consultado pelo titular e guardiões.
- A autorização deve ser aplicada por políticas de banco de dados e funções no servidor, jamais apenas ocultando botões na interface.
- O histórico importado do ChatGPT do titular permanece privado e separado do histórico de mensagens no WhatsApp.

## Situação

Especificação de produto registrada. Interface, convites, banco, políticas de permissão e testes de segurança ainda precisam ser implementados e publicados.
