# Correção local da candidata Apple — 9/11/2026

> Este arquivo registra a primeira entrega (6e406e3). A continuação autorizada, com CocoaPods instalado, compilação local e Sandbox isolado preparado, está em [APPLE_REVIEW_SANDBOX_20261109.md](APPLE_REVIEW_SANDBOX_20261109.md).

## Escopo e autorização

Corrigir a candidata e preparar notas locais, preservando compras exclusivamente pela Apple e reversão. Não publicar, implantar, comprar, criar credenciais, alterar permissões, enviar mensagens à Apple ou reenviar submissão. O navegador ficou reservado a outra tarefa após uma tentativa de leitura; nenhuma alteração foi realizada em App Store Connect.

## Referências preservadas

- Main recebida: `b1498f25f7b8ce0b1ebdd1ed30a8b5fcaaed978c`.
- Candidata StoreKit recebida: `9fb632dc3d0365429012eb396179a9048e164172`.
- Build rejeitado informado: `26308095636`, gerado do commit `18dbe6dd309427701f3adf0e10f4d57fd50ffd6f`.
- Branch de trabalho apenas local: `fix/apple-review-20261109`, baseada na candidata e reconciliada com a main. Os dois pais permitem identificar exatamente o estado anterior; nada foi enviado a remoto.
- Evidência histórica de 4/11: compra e restauração Sandbox validadas pelo app e registro no servidor para a conta autorizada do titular. Não equivalem a teste da presente correção nem da conta do revisor.

## Causas confirmadas e hipóteses

Confirmado por código/histórico:

1. Os workflows `ios-simulator` e `ios-appstore` ainda executavam o preparador gratuito, incompatível com a candidata que contém compra/restauração; `ios-apple-sandbox` habilitava a compra. O teste Maestro também exigia uma edição sem Plus. As notas de outubro não descreviam o build StoreKit.
2. O HTML nativo mostrava preço BRL fixo mesmo antes de consultar StoreKit, uma oferta Completo/número exclusivo indisponível e mensagens de planos em preparação. A restauração só era habilitada após o catálogo retornar um produto.
3. O plano exibido vinha da tabela legada de entitlements, enquanto a franquia real exige assinatura Apple Production ativa. Essa divergência podia anunciar benefício não aplicado pelo contador. A compra e a restauração também usavam a sessão global depois de aguardarem a Apple; uma troca de conta podia tentar validar a transação na sessão nova. A verificação de titularidade no servidor continua sendo a barreira final, mas o cliente agora interrompe esse caminho antes da validação/finalização indevida.
4. `apple-subscription` devolve 403 a uma conta confirmada fora de `APPLE_IAP_SANDBOX_TESTERS`. O teste de regressão reproduz isso sem rede ou credenciais reais. A migração ignora Sandbox ao liberar a franquia 100; uma compra do revisor pode falhar ou não demonstrar o benefício.

Não confirmado: a rota exata que motivou “acesso a compras externas” na rejeição 3.1.1. A sessão Apple mostrou login expirado, portanto não foi possível reler a rejeição completa, anexos ou notas atuais. Não foi obtido/inspecionado o IPA assinado rejeitado. O vínculo build/commit usa o histórico registrado e a informação recebida. Não foi encontrado checkout externo nas rotas estáticas auditadas da candidata; isto não prova comportamento de conteúdo remoto/WhatsApp nem permite declarar a rejeição resolvida.

## Correções locais

- `codemagic.yaml`: todos os workflows iOS usam o mesmo preparador Apple. Nenhum workflow foi executado remotamente.
- `scripts/prepare_apple_build.mjs`: monta uma lista explícita de arquivos, remove artefatos antigos do diretório gerado, preserva as fontes do site, exclui HTML comercial e ofertas futuras do bundle e exige marcadores únicos. O preço nativo começa em consulta e é fornecido por StoreKit. Execuções repetidas geram o mesmo HTML.
- `scripts/prepare_ios_free.py`: aposentado com erro explicativo para evitar uma compilação silenciosa do produto antigo.
- `index.html`: preço/assinatura do produto correto retornado por StoreKit, consulta repetível após erro e restauração independente da disponibilidade do catálogo. Login continua isolado de falhas da ponte opcional. A operação de compra/restauração fica vinculada à conta que a iniciou; uma troca de conta impede confirmar/finalizar a transação na nova sessão. A renovação atrasada de sessão também não pode sobrescrever um login novo. O plano/contador lê assinaturas Apple Production, como a regra SQL. Sandbox continua sem benefício de produção.
- `.maestro/ipad-post-login.yaml`: verifica a edição Apple, restauração e ausência da oferta Completo, sem simular compra.
- Clientes administrativos das duas funções Apple: desabilitam renovação automática de sessão e detecção de URL, desnecessárias no servidor. A alteração local elimina temporizadores do SDK; não muda autenticação, allowlist, assinatura digital ou concessão de benefício. Não implantada.
- Testes de regressão de interface, pacote/workflows, bloqueio Sandbox, SQL e rollback. Lockfiles e `npm ci` preservam as dependências usadas localmente; arquivos gerados e segredos não entram no Git. Nenhum AGENTS.md ou SKILL.md próprio foi encontrado na candidata ou nos diretórios ancestrais verificados.
- Notas antigas arquivadas; guia atual e rascunho descrevem a assinatura Apple e deixam os bloqueios explícitos.

## Decisão pendente: revisão Sandbox e benefício

A Apple revisa compras em Sandbox. O comportamento atual deliberadamente não concede a franquia paga de produção a compras de teste. Nenhuma destas opções foi aplicada:

A. Autorizar uma conta de revisão dedicada na allowlist existente, preservando o acesso restrito. Isso permite validar a compra/restauração, mas sozinho NÃO resolve demonstrar as 100 interações.

B. Criar um ambiente de revisão separado, com dados, credenciais e contadores próprios, em que transações Sandbox verificadas e vinculadas ao titular liberem a franquia de teste. Exige autorização para ambiente, operação/custos e conta de revisão; não deve usar nem misturar memórias de produção. A experiência da revisão deve representar a funcionalidade comercial, sem falsificar benefícios.

C. Projetar uma franquia Sandbox isolada para contas explicitamente autorizadas, com verificação Apple, contadores separados, expiração/revogação e proibição de contaminar produção ou ampliar acesso a outras contas. Exige aprovação dessa mudança de acesso/modelo e implementação/testes próprios antes de qualquer implantação.

Não aprovar “abrir Sandbox para todos” nem gravar Sandbox como Production. Não remover as compras Apple para corresponder à nota gratuita antiga. Não ampliar países ou habilitar Compartilhamento Familiar nesta rodada.

## Validação e limites

O resultado final dos comandos e os bloqueios de ambiente são registrados em `VALIDACAO_APPLE_20261109.md`. As verificações locais não substituem compra no aparelho, benefícios da conta de revisão e inspeção da mesma compilação assinada.

## Reversão

Como nada foi publicado/implantado, a reversão externa não é necessária. Para descartar a candidata, continuar usando as referências preservadas acima. Não forçar push nem apagar histórico. As fontes antigas continuam nos pais do commit local e nos backups de 3/4 de novembro. Se futuramente aprovada uma implantação, gerar backup novo do código e configurações ativas antes dela; rollback antigo não desfaz cobranças já realizadas. Não apagar o registro Sandbox do titular.

## Referências oficiais consultadas

- https://developer.apple.com/app-store/review/guidelines/ — 3.1.1, 3.1.2 e completude dos IAPs.
- https://developer.apple.com/help/app-review/before-submitting-for-review/configure-in-app-purchases — revisão em Sandbox, produto/preço via StoreKit e restrições de storefront nas notas.
