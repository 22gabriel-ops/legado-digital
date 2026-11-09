# Preparação da publicação Apple — 9/11/2026

Publicação de código/build e envio à revisão autorizados pelo titular após a candidata local 96a915e. Preservar preços, países, credenciais e lançamento manual; não enviar perguntas ao revisor.

## Estado reconferido

- Main remota: b1498f25f7b8ce0b1ebdd1ed30a8b5fcaaed978c. Candidata remota anterior: 9fb632dc3d0365429012eb396179a9048e164172.
- A versão Apple 1.0 rejeitada contém o build 26308095636. A mensagem atual de 3.1.1 aponta conteúdo/assinatura sem compra integrada disponível. As notas descrevem a edição gratuita sem compras, incompatível com o build StoreKit. A descrição pública corresponde à edição antiga de memórias manuais e precisa representar o app atual.
- O Plus permanece em preparação para envio, com 100 interações, período mensal e um país selecionado. Captura/notas de revisão do produto estão vazias. O primeiro IAP deve ser enviado com a versão. Nenhum país/preço/Compartilhamento Familiar foi alterado.
- A conta de revisão existente foi localizada e está confirmada. O titular confirmou dados fictícios e autorizou acrescentar somente essa conta ao Sandbox, preservando a conta de teste já autorizada. Identificadores e credenciais não são publicados aqui.
- O titular autorizou migração/serviço isolado e até 3 respostas reais da IA configurada, limitadas a 600 tokens de saída cada. Isso não autoriza compra real Apple nem IA sem limite.
- O servidor tem 8 funções, incluindo as duas Apple. O serviço isolado ainda precisa de implantação e validação. A conversa normal foi atualizada por terceiros depois do snapshot inicial: não substituí-la pela cópia antiga.

## Geração limpa e identidade

CocoaPods real comprovou que `cap add ios` faz sync implícito antes de voltar ao workflow: o Podfile iOS 14 falhava para o plugin que exige 16, antes de executar o preparador antigo. Reutilizar um projeto gerado não comprovava esse caminho.

O hook oficial `capacitor:sync:before` agora chama `scripts/prepare_native_sync.mjs`, que prepara somente iOS antes do primeiro pod install. A reprodução limpa com CocoaPods e limpeza Xcode reais terminou com saída 0 e plataforma criada. Os testes automatizados usam Pod/Xcode controlados para confirmar ordem e repetição, sem assinatura ou interface gráfica.

`verify_apple_bundle.mjs` compara assets preparados/copiados, exige StoreKit e bundle ID corretos, rejeita HTML comercial/ofertas futuras/preço pago fixo e grava `build/verification/apple-bundle.json` com commit/hashes. Exige checkout limpo; todos os workflows guardam o manifesto antes de compilar. O IPA ainda deverá ser extraído para conferir o mesmo conteúdo, Info.plist, build, assinatura e perfil. Isso não substitui o teste no aparelho.

## Continuação operacional

1. Guardar estado atual do servidor/configurações; conferir ausência das tabelas/RPCs novas e preservar funções normais.
2. Publicar candidata rastreável e comparar arquivos/hashes. O Git do terminal não está autenticado; usar a sessão GitHub autorizada sem criar token permanente.
3. Implantar apenas a migração/serviços necessários, com autenticação/allowlist/assinaturas preservadas; ativar a flag no escopo autorizado e testar negativas.
4. Gerar distribuição do mesmo commit, conferir IPA/manifesto e disponibilizar TestFlight. Testar compra/restauração Sandbox e até 3 respostas autorizadas.
5. Atualizar descrição/notas/screenshots da mesma candidata, anexar o primeiro IAP e enviar à Apple mantendo lançamento manual.

Registrar cada ação como concluída somente após verificar IDs/status. Evidências privadas e autorizações ficam nos artefatos locais, sem senhas/chaves.

## Autenticação reconferida antes da implantação

A função apple-subscription ativa está com verificação JWT legada ligada. Essa proteção será preservada, além do auth.getUser obrigatório no código; o novo serviço de conversa terá o mesmo gateway. O config.toml candidato foi alinhado a esse estado, sem desabilitar a verificação existente. apple-notifications continua sem gateway de usuário, pois verifica a assinatura Apple. Se um token legítimo da nova distribuição for incompatível, investigar o teste positivo antes de qualquer mudança de segurança.
