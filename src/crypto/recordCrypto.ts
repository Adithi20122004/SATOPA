/**
 * Cryptographic Engine: WebCrypto ECDSA P-256, SHA-256, Canonical JSON, and Hash Chaining
 */

import type { SignedRecord } from '../types';

export const GENESIS_HASH = '0'.repeat(64);

/**
 * Deterministically sorts object keys recursively for canonical RFC 8785 style JSON serialization
 */
export function canonicalizeJson(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalizeJson(item)).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((key) => {
    return JSON.stringify(key) + ':' + canonicalizeJson(obj[key]);
  });

  return '{' + pairs.join(',') + '}';
}

/**
 * Computes SHA-256 hex digest using browser WebCrypto
 */
export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  let buffer: ArrayBuffer;
  if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data).buffer;
  } else if (data instanceof Uint8Array) {
    buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  } else {
    buffer = data;
  }

  const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Converts ArrayBuffer to lowercase Hex string
 */
export function bufferToHex(buf: ArrayBuffer | Uint8Array): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts Hex string back to Uint8Array
 */
export function hexToBuffer(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Generates an ECDSA P-256 key pair.
 * In production/browser, private key is non-extractable.
 */
export async function generateDeviceKeyPair(extractable: boolean = false): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    extractable,
    ['sign', 'verify']
  );
}

/**
 * Exports Public Key as SPKI Hex format
 */
export async function exportPublicKeyHex(publicKey: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  return bufferToHex(spki);
}

/**
 * Imports Public Key from SPKI Hex format
 */
export async function importPublicKeyHex(spkiHex: string): Promise<CryptoKey> {
  const spkiBuf = hexToBuffer(spkiHex);
  return await crypto.subtle.importKey(
    'spki',
    spkiBuf,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    ['verify']
  );
}

/**
 * Extracts payload fields for canonical signing (excluding signature and public key)
 */
export function extractSignablePayload(record: SignedRecord): any {
  const { signature_der_hex: _sig, public_key_spki_hex: _pk, ...signable } = record;
  return signable;
}

/**
 * Digitally signs a record with ECDSA P-256 (SHA-256)
 */
export async function signRecord(
  recordWithoutSig: SignedRecord,
  privateKey: CryptoKey,
  publicKeyHex: string
): Promise<SignedRecord> {
  const signable = extractSignablePayload(recordWithoutSig);
  const canonical = canonicalizeJson(signable);
  const enc = new TextEncoder().encode(canonical);

  const sigBuf = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    privateKey,
    enc
  );

  const signature_der_hex = bufferToHex(sigBuf);

  return {
    ...recordWithoutSig,
    signature_der_hex,
    public_key_spki_hex: publicKeyHex,
  };
}

/**
 * Verifies the ECDSA P-256 digital signature of a record
 */
export async function verifyRecordSignature(record: SignedRecord): Promise<boolean> {
  if (!record.signature_der_hex || !record.public_key_spki_hex) {
    return false;
  }

  try {
    const publicKey = await importPublicKeyHex(record.public_key_spki_hex);
    const signable = extractSignablePayload(record);
    const canonical = canonicalizeJson(signable);
    const dataBytes = new TextEncoder().encode(canonical);
    const sigBytes = hexToBuffer(record.signature_der_hex);

    return await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' },
      },
      publicKey,
      sigBytes,
      dataBytes
    );
  } catch (e) {
    console.error('Signature verification error:', e);
    return false;
  }
}

/**
 * Computes hash of a complete record for sequential hash chain linkage
 */
export async function computeRecordChainHash(record: SignedRecord): Promise<string> {
  const canonical = canonicalizeJson(record);
  return await sha256Hex(canonical);
}
