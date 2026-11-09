# Resultado final da continuação — 9/11/2026

Referência anterior preservada: `6e406e369fc1d82f299e05b4d34bf11e65e0d15e`.

| Verificação | Resultado final |
| --- | --- |
| CocoaPods | 1.16.2 instalado somente no workspace; 37 gems com SHA-256 conferido no RubyGems oficial para a plataforma correta |
| Pod install | Passou; Capacitor, CapacitorCordova e LegadoAppleBilling |
| Arquivos essenciais | npm run check passou |
| Node | 30 testes passaram; zero falhas |
| Deno / PostgreSQL local | 33 testes passaram; zero falhas |
| Compilação Xcode 27.2 | BUILD SUCCEEDED, Debug-iphonesimulator, sem assinatura |
| Artefato inspecionado | bundle correto, mínimo iOS 16, LegacyStoreKitPlugin incluído, HTML idêntico ao pacote preparado, sem _CodeSignature |
| Publicação / implantação / nova compra / IA real | Não executadas |
| Teste visual Simulator / Maestro / iPhone | Não executado: nenhuma interação gráfica autorizada nesta janela de trabalho |
| Apple/rejeição/rotas externas atuais | Não relidos/reproduzidos; dependem de acesso e teste posterior |

Os 33 testes de servidor/banco incluem 14 do endpoint isolado, 6 de SQL Sandbox, 4 integrados HTTP+PostgreSQL, 5 de autenticação/validação Apple, 3 de certificados e 1 cenário SQL anterior. Os 30 Node incluem páginas reais com DOM restrito aos IDs existentes, opt-in, troca de conta/contexto, expiração, falhas de rede, preço, compra/restauração, preparação do pacote/workflows e mínimos nativos.

O teste integrado percorre 100 respostas completas, verifica bloqueio da 101ª, preserva snapshots de consumo/eventos/entitlements/conversa/definição da função Production, e verifica revogação/expiração, autenticidade de conta e estorno. Só autenticação e IA são simuladas; as RPCs e as migrações rodam em PostgreSQL local. Nenhum dado real ou chave privada é usado.

## Falhas intermediárias e resolução

- Instalação RubyGems com dependências atuais não compatíveis com Ruby 2.6: resolvida com versões compatíveis explícitas, sem ignorar os requisitos de Ruby.
- Verificação de hashes inicialmente selecionou a variante Java de nkf pelo endpoint de metadados: resolvida selecionando nome/versão/plataforma; todos os hashes das gems instaladas coincidiram. Não havia adulteração no arquivo Ruby.
- A preparação Capacitor criou projeto/Pods, mas sua limpeza automática usou diretórios Xcode fora do workspace e falhou nas restrições iniciais. O resultado foi inspecionado antes de continuar, sem repetir cegamente a criação.
- Build inicial identificou deployment target 14 nos Pods, incompatível com o SDK instalado. O preparador nativo agora aplica mínimo16 a todos os targets gerados sem reduzir mínimos superiores; teste de idempotência e compilação final passaram.
- Duas falhas de interface foram encontradas na revisão independente: controles bloqueados após troca de conta e quota normal atrasada sobrescrevendo Sandbox. Corrigidas e cobertas por testes de página completa.

## Logs externos deste chat

Diretório `outputs/validacao-apple-20261109-continuacao/`:

- `cocoapods-integridade.json`: versões/plataformas/checksums oficiais das 37 gems.
- `cocoapods-final-install.txt` e `pod-install-final.txt`.
- `cap-add-ios.txt`: tentativa inicial parcialmente concluída e falha de limpeza.
- `cap-copy-final.txt`: cópia final dos assets.
- `node-tests.txt` e `deno-tests-final.txt`: suítes finais completas.
- `xcodebuild-simulator-final.txt`: BUILD SUCCEEDED.
- `native-artifact.json`: inspeção do artefato e hash do HTML.
- Logs das tentativas anteriores mantidos para rastreabilidade.

Comandos e requisitos da futura ativação estão em [APPLE_REVIEW_SANDBOX_20261109.md](APPLE_REVIEW_SANDBOX_20261109.md). As aprovações pendentes são implantação/migração, flag, conta de revisão e custo de IA. Isso não está autorizado por uma simples aprovação de instalação do CocoaPods.
