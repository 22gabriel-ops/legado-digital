import crypto, { X509Certificate, type KeyObject } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { ASN1HEX, X509 } from 'npm:jsrsasign@11.1.5';
import { rootCertificates } from './apple-roots.ts';

// Supabase's older Deno runtime implements certificate identity/public keys,
// but not raw, toString, verify or infoAccess. Supply only those missing APIs.
// Apple's library still enforces the pinned roots, chain signatures, marker
// OIDs, dates, bundle/environment, JWS signature and online OCSP checks.
export class CompatibleX509Certificate extends X509Certificate {
  private readonly parsed: X509;
  private readonly der: Buffer;
  declare readonly raw: X509Certificate['raw'];
  declare readonly infoAccess: string | undefined;

  constructor(input: ConstructorParameters<typeof X509Certificate>[0]) {
    super(input);
    this.parsed = new X509();
    if (typeof input === 'string' && input.includes('-----BEGIN CERTIFICATE-----')) {
      this.parsed.readCertPEM(input);
    } else {
      const bytes = ArrayBuffer.isView(input)
        ? Buffer.from(input.buffer, input.byteOffset, input.byteLength)
        : Buffer.from(input as string);
      this.parsed.readCertHex(bytes.toString('hex'));
    }
    this.der = Buffer.from(this.parsed.hex, 'hex');
    Object.defineProperties(this, {
      raw: { get: () => Buffer.from(this.der) },
      infoAccess: { get: () => this.authorityInfoAccess() },
    });
  }

  override toString(): string {
    const lines = this.der.toString('base64').match(/.{1,64}/g);
    if (!lines) throw Error('Empty certificate');
    return '-----BEGIN CERTIFICATE-----\n' + lines.join('\n') + '\n-----END CERTIFICATE-----\n';
  }

  private authorityInfoAccess(): string | undefined {
    const aia = this.parsed.getExtAIAInfo();
    if (!aia) return undefined;
    return [...(aia.ocsp || []).map((uri: string) => 'OCSP - URI:' + uri),
      ...(aia.caissuer || []).map((uri: string) => 'CA Issuers - URI:' + uri)].join('\n');
  }

  override verify(key: KeyObject): boolean {
    const algorithm = this.parsed.getSignatureAlgorithmField();
    // Accept only the certificate signature algorithms used by Apple's chain.
    const digest: Record<string, string> = {
      SHA256withECDSA: 'sha256', SHA384withECDSA: 'sha384', SHA512withECDSA: 'sha512',
      SHA256withRSA: 'sha256', SHA384withRSA: 'sha384', SHA512withRSA: 'sha512',
    };
    if (!digest[algorithm] || algorithm !== this.parsed.getSignatureAlgorithmName()) return false;
    return crypto.verify(digest[algorithm],
      Buffer.from(ASN1HEX.getTLVbyList(this.parsed.hex, 0, [0]) as string, 'hex'),
      key, Buffer.from(this.parsed.getSignatureValueHex(), 'hex'));
  }
}

const probe = new X509Certificate(Buffer.from(rootCertificates[0], 'base64'));
// Deno calls the same NIST curves p256/p384/p521; jsonwebtoken expects
// OpenSSL's names. Normalize names without changing the underlying keys.
const curveAliases: Record<string, string> = { p256: 'prime256v1', p384: 'secp384r1', p521: 'secp521r1' };
if (curveAliases[probe.publicKey.asymmetricKeyDetails?.namedCurve || '']) {
  const createPublicKey = crypto.createPublicKey;
  crypto.createPublicKey = ((...args: Parameters<typeof createPublicKey>) => {
    const key = createPublicKey(...args);
    const details = key.asymmetricKeyDetails;
    const curve = details?.namedCurve;
    if (curve && curveAliases[curve]) Object.defineProperty(key, 'asymmetricKeyDetails', {
      value: { ...details, namedCurve: curveAliases[curve] },
    });
    return key;
  }) as typeof createPublicKey;
}
try {
  probe.toString();
  probe.raw;
  probe.infoAccess;
  probe.verify(probe.publicKey);
} catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ERR_NOT_IMPLEMENTED') throw error;
  // Apple's CommonJS module reads this same mutable Node crypto export.
  // Do not modify a runtime where the native implementation is complete.
  crypto.X509Certificate = CompatibleX509Certificate;
}
