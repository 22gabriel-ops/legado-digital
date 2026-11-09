# Rascunho local de notas para App Review

Não enviado. Preparado em 9/11/2026. Substituir a nota gratuita antiga somente após resolver e validar as pendências abaixo. Não é uma mensagem enviada à Apple nem um pedido de esclarecimento.

## Texto proposto

Legado Digital offers an ongoing AI conversation service for preserving personal memories. The free plan includes 10 interactions per calendar month. An interaction is one user message and its AI response. Sign-in with a confirmed email address is required. WhatsApp is optional; the core conversation is available inside the app.

Meu Legado Plus is a monthly auto-renewable in-app subscription, product ID `br.com.meulegado.plus.mensal`. It includes 100 interactions per calendar month, shared across the supported channels of the same app account, without rollover. The subscription renews monthly until cancelled through the customer's Apple Account. The iOS paywall displays the localized price returned by StoreKit (Brazilian storefront configured at R$ 19.90/month). Purchases are exclusively through Apple's in-app purchase system. The website and WhatsApp do not process payments.

To locate the subscription: sign in, open “Meu plano”, tap “Ver planos e assinatura”, and use “Assinar Plus”. “Restaurar compras” is available on the same screen, including when the product catalog cannot be loaded. Privacy and Terms of Use links are on this screen. No WhatsApp verification is needed to locate the subscription or converse inside the app.

The future “Completo”/exclusive WhatsApp number offering is not available in this iOS version and has no purchase button. Importing conversation histories and sharing access to memories with guardians are not included features of this release.

## Conditional Sandbox instructions — not yet activated

Use this paragraph only after authorized deployment and a successful device test on the same build:

After completing the Apple Sandbox purchase with the authorized review app account, select “Abrir conversa de teste”. This opens a separate AI conversation with 100 test interactions per calendar month and a visible test usage counter. The test conversation and allowance do not consume or upgrade the normal conversation. Test purchases must be active and are verified server-side. An expired/revoked test subscription or unavailable verification blocks the test conversation. “Voltar à conversa normal” returns explicitly to the normal account experience. The isolated conversation does not duplicate memory management or guardian features; those remain in the normal app experience.

## Must be completed before using these notes

- Identify the exact new build and commit; 26308095636 is the previously rejected build, not this correction.
- Provide a dedicated, confirmed-email review account through the secure App Store Connect review-account fields; no credentials in this document.
- Confirm authorization of the review account for Sandbox validation and verify how the reviewer can actually exercise the 100-interaction benefit. Current production quota intentionally ignores Sandbox. Do not claim this is resolved.
- Validate purchase/restore and the paid benefit on the new build and the selected backend configuration; the successful tests of 4/11 belong to the older build and the owner's allowed test account.
- Confirm country availability. Last confirmed configuration selected Brazil only; do not promise worldwide availability or change countries without the titular's decision.
- Attach the first subscription to the app version, with its actual review screenshot and complete localized metadata. Confirm in the current Apple session.
- Replace any description/screenshots that still state “free-only, no in-app purchases” or advertise the unavailable Completo tier. Do not alter commercial claims without matching actual behavior.
