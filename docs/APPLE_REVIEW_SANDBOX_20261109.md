# Sandbox isolado e compilação local — continuação de 9/11/2026

## Escopo e preservação

O titular autorizou instalar CocoaPods pelo RubyGems e continuar compilação/testes locais, sem assinatura, envio ou publicação. Também autorizou preparar e testar no código uma demonstração isolada das 100 interações. Não autorizou criar contas/chaves, ampliar a lista de acesso ou alterar produção. A candidata anterior permanece no commit `6e406e369fc1d82f299e05b4d34bf11e65e0d15e`, com branch local de backup `backup/pre-sandbox-20261109`.

Nenhuma interface gráfica foi utilizada nesta continuação. Os workflows Codemagic não foram acionados. A compilação usa destino genérico de Simulator: não inicia o aplicativo nem abre a interface do Simulator.

## Solução local preparada

Foi escolhida a alternativa de conversa e franquia Sandbox em tabelas próprias no mesmo modelo Supabase, sem misturar consumo, conteúdo ou benefícios com a conversa normal. Nenhuma tabela/função normal de conversa ou consumo foi alterada. A tabela de transações Apple já separa os ambientes e continua recebendo somente dados verificados pelo serviço Apple existente.

- Nova função `apple-review-conversation`: bloqueada por padrão. Exige `APPLE_IAP_SANDBOX_REVIEW_ENABLED=true`, a allowlist **existente** `APPLE_IAP_SANDBOX_TESTERS`, usuário autenticado com e-mail confirmado e assinatura Apple Sandbox ativa vinculada ao titular. O cliente não escolhe titular ou benefício.
- A disponibilidade é anunciada pela confirmação Apple somente depois de verificar e salvar a transação. Isso não concede franquia: a função de conversa consulta novamente o estado autoritativo no banco.
- Opt-in explícito: após a compra Sandbox validada, a conta autorizada pode tocar “Abrir conversa de teste”. O app exibe a indicação de teste e o contador 100. Não há concessão persistida no cliente; logout/troca de conta limpa o modo.
- Tabelas `legacy_apple_review_months`, `legacy_apple_review_events`, `legacy_apple_review_turns`: contadores e conversa próprios. RLS permite somente leitura do próprio titular; reserva, gravação e estorno são RPCs restritos ao serviço. Não lê memórias, perfis ou conversas normais para gerar a resposta de teste e não grava memórias automaticamente.
- A assinatura inativa, expirada ou revogada resulta em franquia zero e bloqueio. Falha de rede, flag desativada, remoção da allowlist ou banco indisponível não usa silenciosamente o caminho Production.
- Reserva e gravação do par usuário/assistente são atômicas e idempotentes por evento. Estorno é único e só ocorre antes de resposta salva. Se a tentativa de gravação tiver resultado incerto, o handler não repete nem estorna automaticamente: o histórico precisa ser conferido.
- A interface valida o titular/contexto após respostas assíncronas. Quota normal atrasada não sobrescreve Sandbox; falha/expiração Sandbox não deixa a conta seguinte com controles bloqueados.
- O endpoint normal `legacy-conversation`, as tabelas normais e a regra 10/100 Production permanecem como estavam no commit preservado. O Sandbox não é convertido em Production.

A conversa de teste demonstra o benefício de conversa/franquia com IA real quando futuramente ativada. Não equivale a um ambiente completo para testar guardiões, importações ou gestão de memórias: esses recursos não foram duplicados, habilitados nem simulados. Isso deve ficar claro à revisão, sem ocultar funcionalidades ou prometer aprovação da Apple.

## Aprovação exata ainda necessária antes de ativar

Nenhuma das ações abaixo foi executada:

1. Aplicar a nova migração `20261109_apple_review_sandbox.sql` no projeto escolhido, após backup atual. Ela cria três tabelas e quatro RPCs somente para Sandbox, sem substituir as funções normais.
2. Implantar a nova função e a atualização candidata de `apple-subscription`. A configuração local do novo endpoint usa autenticação obrigatória dentro do handler; não é um endpoint de IA anônimo.
3. Ativar a flag no servidor e autorizar o custo de IA dos testes. A Apple não cobra compras Sandbox, mas chamadas reais de IA consomem recursos pagos do serviço. Nenhuma chamada real foi feita nos testes locais.
4. Identificar/autorizar uma conta de revisão dedicada, confirmada e com dados fictícios. A conta de teste do titular já autorizada não foi substituída. Não criar conta, gravar senha, alterar allowlist ou fornecer credenciais à Apple sem escopo específico. As credenciais devem ir nos campos seguros do App Store Connect.
5. Gerar o build autorizado, testar compra/restauração e as 100 interações de teste no aparelho, observar expiração/revogação e reconferir metadados e notas da mesma candidata. O login Apple e a inspeção do binário rejeitado continuam pendentes.

## CocoaPods e compilação

CocoaPods 1.16.2 foi instalado apenas em `work/runtime/cocoapods-gems`, com Ruby 2.6.10 do Mac. O launcher `work/runtime/bin/pod` fixa os diretórios de gems/cache/home ao workspace, carrega logger e desativa estatísticas. Não foi alterado Ruby do sistema, shell profile, permissões ou configuração global.

Dependências compatíveis fixadas para o Ruby do Mac: nap 1.1.1, ffi 1.15.5, minitest 5.15.0, zeitwerk 2.6.18, i18n 1.14.8 e activesupport 6.1.7.10. A instalação inicial recusou versões recentes de dependências que exigem Ruby novo; as versões compatíveis foram instaladas sem ignorar os requisitos de versão. Todas as 37 gems baixadas, incluindo CocoaPods, foram comparadas por SHA-256 com o registro oficial RubyGems, usando nome/versão/**plataforma** correspondentes. Manifesto de integridade fica nos logs externos do chat.

A primeira geração nativa criou o projeto/Pods, mas a limpeza automática do Capacitor foi interrompida pela restrição de acesso aos serviços/cache Xcode. O projeto existente foi inspecionado antes de continuar. Caches/DerivedData foram direcionados ao workspace e a escalada suportada da ferramenta foi usada para a compilação local autorizada. Nenhuma restrição foi contornada.

A compilação seguinte encontrou dependências com deployment target 14, abaixo do mínimo 15 do SDK instalado. `prepare_apple_native.mjs` agora eleva o mínimo dos targets App/Pods para 16, preserva valores superiores e insere um hook idempotente no Podfile gerado. O podspec do plugin também declara16. Após novo pod install, preparo/cópia dos assets e compilação Debug para destino genérico iOS Simulator, o Xcode 27.2 retornou **BUILD SUCCEEDED**.

O artefato foi inspecionado: bundle `com.gabrielcruz.legadodigital`, mínimo iOS 16, plugin `LegacyStoreKitPlugin` incluído, HTML copiado idêntico ao bundle preparado e ausência de `_CodeSignature`. É uma compilação local de Simulator, não um IPA de distribuição nem substituto já enviado do build 26308095636.

## Comandos e resultados

Resultado final: 30 testes Node + 33 Deno/PGlite passaram; compilação nativa passou. Detalhes em [VALIDACAO_SANDBOX_NATIVO_20261109.md](VALIDACAO_SANDBOX_NATIVO_20261109.md).

Os comandos incluem `gem install` pela fonte `https://rubygems.org` em GEM_HOME/GEM_PATH do workspace; `pod install --project-directory=ios/App`; `node scripts/prepare_apple_build.mjs`; `node scripts/prepare_apple_native.mjs`; `npx cap copy ios`; `npm run check`; `npm test`; `npm run test:apple-server`.

A compilação usa:

```
xcodebuild -workspace ios/App/App.xcworkspace -scheme App \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build/local-simulator \
  CLANG_MODULE_CACHE_PATH=<workspace>/build/ModuleCache \
  SDK_STAT_CACHE_DIR=<workspace>/build/SDKStatCaches \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build
```

Resultado final e hashes estão em `outputs/validacao-apple-20261109-continuacao/` no workspace do chat. Não foram executados: instalação/execução no aparelho, UI Simulator/Maestro, nova compra Apple, IA real, notificações reais de renovação/expiração, implantação, publicação ou submissão. O resultado local não declara a rejeição 3.1.1 resolvida, pois a rota externa exata e os metadados atuais não foram reproduzidos.

## Reversão

Nenhuma reversão externa é necessária: produção não foi alterada. Código: voltar à referência 6e406e3 preservada, sem apagar histórico. A instalação CocoaPods é isolada e pode ser desconsiderada removendo seu launcher do PATH de execução; não houve instalação global.

Se futuramente autorizada uma implantação: desativar a flag primeiro, retirar a nova função de acesso e usar `supabase/rollback/20261109_apple_review_sandbox.sql`. O rollback desativa RPCs e revoga acessos às tabelas novas, preservando o histórico; não modifica as funções/tabelas normais. Não apagar transações nem dados para simular reversão.

Fontes oficiais: https://rubygems.org/gems/cocoapods/versions/1.16.2 e https://developer.apple.com/help/app-review/before-submitting-for-review/configure-in-app-purchases.
