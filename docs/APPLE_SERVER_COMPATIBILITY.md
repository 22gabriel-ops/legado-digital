# Apple server verification on Supabase

The hosted Deno runtime lacks several `node:crypto.X509Certificate` APIs used by
Apple's server library 3.1.0. A constructor-only or malformed-JWS test does not
detect this: genuine Apple notifications were also rejected with HTTP 400.

`_shared/apple-x509.ts` supplies the missing DER/PEM, AIA and certificate signature
operations, retaining the native certificate identity, dates, public keys and CA
flag. It uses the existing jsrsasign ASN.1 parser and native crypto signature
verification. It also normalizes Deno's NIST curve aliases to the equivalent
OpenSSL names expected by jsonwebtoken. Complete native implementations are
preserved. The adapter is loaded before Apple/jsonwebtoken captures crypto APIs.

Apple's SignedDataVerifier still performs pinned-root chain validation, Apple
marker OIDs, date validation, online OCSP, JWS signature and bundle/environment
checks. No unverified claims can activate an entitlement.

## Validation on 4 November 2026

- Authentic Apple Sandbox TEST notification verified locally with online OCSP.
- Official Apple delivery status after notification deployment: SUCCESS.
- Replaying the authentic TEST to the hosted function returned HTTP 200.
- Modifying signed claims returned HTTP 400.
- A verifier configured for another bundle identifier rejected the original.
- Adapter regression tests check exact DER round trips, root signatures,
  wrong keys, altered certificate signatures and altered ES256 signatures.
- Both functions and dashboard-generated files passed Deno type checking.

The TEST notification is not a StoreKit purchase. Purchase/restore and renewal
tests still require the TestFlight build and an explicitly allowed app account.
Sandbox never changes the production message allowance.

## Native login regression

The first device test showed that tapping Sign In did nothing. The complete
page reproduced the failure: the plain-HTML iOS app receives the native proxy at
`Capacitor.Plugins.LegacyStoreKit`, but does not load core's JS `registerPlugin`
function. Calling that missing function at startup prevented login handlers
from being installed. The app now prefers the injected proxy and isolates any
optional billing initialization failure from authentication. The complete-page
regression test covers login with the actual injected-bridge shape and startup
with a broken optional purchase bridge. Both failed before and pass after the
correction. Device validation requires the replacement TestFlight build.

## Rollback

The code state before this compatibility correction is commit
`99d67f70d20afe1319b441c2c2ef1e3a2c9767c8` on the candidate branch. Revert the
compatibility commits to restore it. The original main branch remains at
`e4e831bc35d1059b19dee8f789597537676e9221`.

Before updating each hosted function, its actual source was downloaded and
SHA-256 matched against the retained previous deployment:

- apple-notifications: f64d4ca1633682c0f501d6e3a8643e81f943370726b021348aed3488de557650
- apple-subscription: f26e9c222480081c1e3c922043e550e684f629037bf293efe6791fbfe223e171

Re-deploy those backups to reverse this correction without changing the database
or deleting subscription history. Removing a tester from the Sandbox allowlist
reverses that test authorization. No private keys belong in this repository.

## Production API before the first release

The current key authenticates Sandbox requests. Production returns HTTP 401.
An Apple Commerce Engineer states that production API access is unavailable
until the first production release:
https://developer.apple.com/forums/thread/806452

This is consistent with this unreleased app. Validate Sandbox before review,
then recheck production after launch; do not infer that a successful Sandbox
request proves production authorization or a paid purchase.
