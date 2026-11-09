# Revisão App Store — versão 1.0

Atualizado localmente em 9/11/2026. Esta candidata não foi publicada, compilada com assinatura nem reenviada à Apple.

## Produto desta candidata

- Grátis: 10 interações mensais.
- Meu Legado Plus: assinatura mensal pelo StoreKit 2, produto `br.com.meulegado.plus.mensal`, 100 interações mensais. O preço mostrado no iOS vem da Apple (cadastro brasileiro anteriormente conferido: R$ 19,90).
- Compra e restauração são feitas pelo aplicativo iOS. Não há checkout no site ou no WhatsApp.
- O plano Completo/número exclusivo ainda não é um produto disponível; suas ofertas não entram na edição iOS.
- Todos os workflows iOS usam `scripts/prepare_apple_build.mjs`. O preparador gratuito antigo foi aposentado; não usar instruções de outubro para a candidata StoreKit.
- Cadastro, login, conversa e guardiões continuam reais. Não há modo fictício para revisão.

## Limite conhecido que impede declarar a revisão pronta

A continuação local implementou e testou uma solução separada, ainda desativada e não implantada: [Sandbox e compilação](APPLE_REVIEW_SANDBOX_20261109.md). CocoaPods foi instalado com autorização e a compilação local sem assinatura passou. Isso não substitui a ativação autorizada e o teste no aparelho.

O servidor exige que a conta autenticada esteja em `APPLE_IAP_SANDBOX_TESTERS` para validar Sandbox. Apenas a conta de teste do titular foi autorizada em 4/11. Além disso, Sandbox não libera 100 interações na franquia de produção. A Apple usa Sandbox na revisão: as condições atuais não demonstram o benefício pago para uma conta arbitrária do revisor.

Não remover a proteção nem promover transações Sandbox para Production. As opções de acesso e de ambiente separado estão em [APP_STORE_REVIEW_20261109.md](APP_STORE_REVIEW_20261109.md); dependem de decisão do titular. Nenhuma configuração ativa foi alterada nesta rodada.

## Antes de qualquer reenvio

1. Resolver e testar a política de acesso da conta de revisão e a demonstração real dos benefícios Sandbox.
2. Gerar a candidata a partir de um commit identificado, com a mesma edição Apple em simulador e distribuição.
3. Testar login, conversa, limite 10/100, compra, restauração, cancelamento, renovação e expiração no backend correspondente. Registrar evidências da mesma candidata.
4. Confirmar primeiro IAP junto da versão, preço/território/localização, acordo ativo, captura da assinatura e credenciais de revisão em App Store Connect. Não inserir senhas em documentação Git.
5. Conferir todos os links reais do binário, incluindo autenticação, privacidade, suporte e WhatsApp; registrar a rota indicada na rejeição, se ela puder ser reproduzida. A sessão Apple expirou em 9/11 e os metadados atuais não foram relidos.
6. Substituir a nota gratuita antiga por uma nota da edição Apple. O [rascunho local](APP_REVIEW_NOTES_DRAFT_20261109.md) ainda contém pendências deliberadas; não o enviar como se fossem resolvidas.
7. Capturar telas reais de iPhone/iPad da mesma compilação. Não editar HTML para ocultar dados reais em imagens de revisão.
8. Revalidar recuperação de senha, confirmação de e-mail, logout e exclusão com conta descartável. Não excluir contas reais para testar.

## Histórico preservado

[Notas anteriores](archive/APP_STORE_REVIEW_1_0_pre20261109.md) mantêm os limites e verificações de autenticação, privacidade, exclusão e WhatsApp investigados em outubro. São histórico, não descrição da candidata atual.
