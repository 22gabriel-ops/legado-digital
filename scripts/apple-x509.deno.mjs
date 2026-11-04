import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { CompatibleX509Certificate } from '../supabase/functions/_shared/apple-x509.ts';
import { rootCertificates } from '../supabase/functions/_shared/apple-roots.ts';

Deno.test('Apple roots preserve exact DER bytes and verify their own signatures', () => {
  for (const root of rootCertificates) {
    const der = Buffer.from(root, 'base64');
    const cert = new CompatibleX509Certificate(der);
    assert.deepEqual(cert.raw, der);
    assert.equal(cert.verify(cert.publicKey), true);
    assert.deepEqual(new CompatibleX509Certificate(cert.toString()).raw, der);
  }
});

Deno.test('certificate signatures reject another root key and modified DER', () => {
  const roots = rootCertificates.map(c => new CompatibleX509Certificate(Buffer.from(c, 'base64')));
  assert.equal(roots[0].verify(roots[1].publicKey), false);
  const modified = roots[0].raw;
  modified[modified.length - 1] ^= 1;
  const changed = new CompatibleX509Certificate(modified);
  assert.equal(changed.verify(roots[0].publicKey), false);
});

Deno.test('curve normalization retains ES256 verification and rejects modified signatures', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const key = crypto.createPublicKey(publicKey.export({ type: 'spki', format: 'pem' }));
  assert.equal(key.asymmetricKeyDetails.namedCurve, 'prime256v1');
  const payload = Buffer.from('Apple runtime compatibility regression');
  const signature = crypto.sign('sha256', payload, privateKey);
  assert.equal(crypto.verify('sha256', payload, key, signature), true);
  signature[signature.length - 1] ^= 1;
  assert.equal(crypto.verify('sha256', payload, key, signature), false);
});
