# Validação local — 9/11/2026

## Resultado

| Verificação | Resultado |
| --- | --- |
| Arquivos essenciais (`npm run check`) | Passou |
| Node: login, sessão, compra/restauração, preço, bloqueio de cliques e conta, pacote e workflows | 21 passaram; 0 falhas |
| Deno: handlers de autenticação/assinatura e bloqueio Sandbox | 5 passaram |
| Deno: certificados Apple, assinatura e adulteração | 3 passaram |
| PostgreSQL local PGlite: franquia 10/100, Sandbox, titularidade, RLS, duplicidade, eventos antigos e rollback | 1 cenário integrado passou; após acrescentar a leitura RLS, passou novamente |
| Controle dos testes contra o HTML anterior `9fb632d` | 18 casos; 9 passaram e 9 falharam como esperado, reproduzindo os defeitos corrigidos |
| Bundle Apple local | Gerado; preparação idempotente e grafo de links locais verificados pelos testes |
| Dependências Node | Instalação por lockfile passou; auditoria npm informou 0 vulnerabilidades |
| Diff Git | Sem marcadores de conflito ou erros de espaços; resolução do merge registrada no commit local |
| `npx cap add ios` | Não concluiu: CocoaPods ausente; nenhum projeto iOS gerado |
| Compilação Xcode, assinatura, IPA, teste Maestro iPhone/iPad | Não executados, pois a preparação nativa foi interrompida antes |
| Compra/restauração da nova candidata no aparelho | Não executadas; nenhum novo gasto ou transação nesta rodada |
| Renovação/expiração remotas e estado ativo do Supabase | Não consultados nesta rodada; não inferir sucesso pelos testes locais |
| Metadados/rejeição/anexos atuais no App Store Connect | Não relidos; sessão expirou e o navegador foi reservado a outra tarefa |
| Publicação GitHub, implantação Supabase, envio TestFlight/revisão | Não executados, conforme escopo autorizado |

O conjunto total é de 30 testes locais na candidata. Os nove testes que falham sobre o HTML anterior são um controle de regressão, não falhas pendentes da candidata. Durante o desenvolvimento, um erro de sintaxe de teste e temporizadores do cliente administrativo foram corrigidos antes do resultado final.

## Comandos reproduzíveis

Requer Node 22, Deno e Python 3. O teste SQL usa PGlite em memória, com usuários/roles fictícios, e não conecta ao Supabase real.

```
npm ci --ignore-scripts
npm run check
npm test
npm run test:apple-server
node scripts/prepare_apple_build.mjs
git diff --check
```

Os testes de servidor usam somente respostas simuladas, certificados públicos e PostgreSQL local; não leem chave Apple privada. O cache npm deste Mac foi direcionado para o workspace após a primeira instalação falhar ao tentar criar o cache padrão; não foram alteradas permissões do sistema.

A instalação local verificada usa Node v22.23.4 obtido de nodejs.org, com SHA-256 conferido contra o arquivo oficial. Xcode instalado: 27.2. CocoaPods não foi instalado, conforme a orientação recebida. Os workflows atuais possuem publicação TestFlight configurada e não devem ser disparados como um mero teste local sem autorização de envio.

## Logs e artefatos

No workspace do chat: `outputs/validacao-apple-20261109/node-tests.txt` e `outputs/validacao-apple-20261109/regressoes-antes.txt`. O primeiro contém o resultado Node final; o segundo registra o controle negativo contra a candidata antiga. Os resultados Deno/PGlite acima foram observados diretamente nas saídas dos comandos deste chat; não são logs de produção.

O patch, o pacote de fontes e o relatório externo deste chat identificam o commit local final. As notas para a Apple estão em rascunho em `APP_REVIEW_NOTES_DRAFT_20261109.md`, com pendências explícitas; não foram enviadas.
