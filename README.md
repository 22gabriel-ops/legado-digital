# Legado Digital — Web 0.2
Protótipo PWA para GitHub Pages; sem backend e sem IA real.

## Atualizar o GitHub pelo iPhone
1. Abra github.com/22gabriel-ops/legado-digital no Safari e entre em Code.
2. Use Add file > Upload files. Envie os cinco arquivos desta pasta para a **raiz** do repositório (sem enviar o ZIP ou uma pasta dentro de outra).
3. Confirme a substituição dos arquivos existentes e finalize em Commit changes na branch main.
4. Aguarde a publicação em Actions/Pages e reabra https://22gabriel-ops.github.io/legado-digital/ .
5. No iPhone, feche e reabra o ícone; se a versão antiga persistir, remova o atalho e adicione novamente pelo Safari.

## Avisos
- Perfil e controles de acesso são apenas ilustrativos, não protegem dados contra outros usuários.
- Dados digitados ficam no localStorage do navegador/app e não são sincronizados nem criptografados ponta a ponta.
- Não use dados pessoais ou mensagens reais; apenas exemplos fictícios.
- O ícone é uma arte gerada com formas geométricas, incluída no pacote.
- A Apple App Store requer projeto nativo, testes, pagamento Apple Developer e aprovação. Esta versão é uma PWA pública.
- Memórias da versão 0.1 não são importadas automaticamente para a 0.2.

<!-- Reexecução de publicação GitHub Pages em 2026-11-04; nenhuma alteração funcional no site ou aplicativo. -->

## Candidata iOS com assinaturas Apple (9/11/2026)

A edição atual usa Grátis (10 interações) e Meu Legado Plus (100 interações), com compra/restauração exclusivamente pelo StoreKit. A edição gratuita de outubro é histórica. Todos os workflows iOS montam o mesmo pacote com `node scripts/prepare_apple_build.mjs`; não executar o preparador gratuito antigo.

Validação local: `npm ci`, `npm run check`, `npm test` e `npm run test:apple-server` (este último requer Deno). Preparar o bundle não publica nem submete nada. A publicação remota continua dependendo de autorização e dos bloqueios descritos no relatório.

- [Revisão e limites de acesso Sandbox](docs/APP_STORE_REVIEW_20261109.md)
- [Guia da revisão atual](docs/APP_STORE_REVIEW_1_0.md)
- [Notas locais em rascunho](docs/APP_REVIEW_NOTES_DRAFT_20261109.md)

Continuação autorizada: [CocoaPods, compilação local sem assinatura e Sandbox isolado](docs/APPLE_REVIEW_SANDBOX_20261109.md). Solução preparada e testada localmente; ativação/conta de revisão/custos de IA ainda exigem autorização específica.
