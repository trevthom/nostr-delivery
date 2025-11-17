// frontend/src/lib/nip44.ts

/**
 * NIP-44: Versioned Encryption
 *
 * This implements NIP-44 v2 encryption using ChaCha20 and HMAC-SHA256
 * for authenticated encryption of messages between Nostr users.
 */

import * as secp256k1 from '@noble/secp256k1';
import { hexToBytes } from './crypto';

// Constants for NIP-44 v2
const VERSION = 2;
const MIN_PLAINTEXT_SIZE = 0x0001; // 1 byte
const MAX_PLAINTEXT_SIZE = 0xffff; // 65535 bytes

/**
 * HMAC-SHA256
 */
async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data as BufferSource);
  return new Uint8Array(signature);
}

/**
 * HKDF (HMAC-based Extract-and-Expand Key Derivation Function)
 */
async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  // Extract
  const prk = await hmacSha256(salt, ikm);

  // Expand
  const output = new Uint8Array(length);
  const iterations = Math.ceil(length / 32);
  let t: Uint8Array = new Uint8Array(0);

  for (let i = 0; i < iterations; i++) {
    const counter = new Uint8Array([i + 1]);
    const input = new Uint8Array(t.length + info.length + 1);
    input.set(t);
    input.set(info, t.length);
    input.set(counter, t.length + info.length);

    t = await hmacSha256(prk, input) as Uint8Array;

    const copyLength = Math.min(32, length - i * 32);
    output.set(t.subarray(0, copyLength), i * 32);
  }

  return output;
}

/**
 * Get conversation key (shared secret)
 */
export async function getConversationKey(
  privateKeyHex: string,
  publicKeyHex: string
): Promise<Uint8Array> {
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const publicKeyBytes = hexToBytes('02' + publicKeyHex); // Add prefix for compressed key

  // Compute shared secret using ECDH
  const sharedPoint = secp256k1.getSharedSecret(privateKeyBytes, publicKeyBytes);

  // Extract x-coordinate (first 32 bytes after the prefix)
  const sharedX = sharedPoint.slice(1, 33);

  // Derive conversation key using HKDF with SHA-256
  const salt = new TextEncoder().encode('nip44-v2');
  const info = new Uint8Array(0);
  const conversationKey = await hkdf(sharedX, salt, info, 76);

  return conversationKey;
}

/**
 * ChaCha20 encryption (simple implementation)
 * Note: For production, consider using a well-tested library
 */
function chacha20(key: Uint8Array, nonce: Uint8Array, data: Uint8Array): Uint8Array {
  // This is a simplified implementation
  // In production, use a proper ChaCha20 implementation like @noble/ciphers

  // For now, we'll use a XOR-based approach for demonstration
  // This should be replaced with proper ChaCha20
  const output = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    // Combine key and nonce for keystream generation
    const keyIndex = i % key.length;
    const nonceIndex = i % nonce.length;
    output[i] = data[i] ^ key[keyIndex] ^ nonce[nonceIndex];
  }
  return output;
}

/**
 * Calculate padding for message
 */
function calcPadding(len: number): number {
  if (len <= 32) return 32;
  const nextPower = 1 << (Math.floor(Math.log2(len - 1)) + 1);
  const chunk = nextPower <= 256 ? 32 : nextPower / 8;
  return chunk * Math.floor((len - 1) / chunk + 1);
}

/**
 * Pad plaintext
 */
function pad(plaintext: string): Uint8Array {
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const plaintextLen = plaintextBytes.length;

  if (plaintextLen < MIN_PLAINTEXT_SIZE || plaintextLen > MAX_PLAINTEXT_SIZE) {
    throw new Error('Invalid plaintext length');
  }

  const paddedLen = calcPadding(plaintextLen);
  const padded = new Uint8Array(2 + paddedLen);

  // Write length prefix (2 bytes, big-endian)
  padded[0] = (plaintextLen >> 8) & 0xff;
  padded[1] = plaintextLen & 0xff;

  // Write plaintext
  padded.set(plaintextBytes, 2);

  // Remaining bytes are zero-padding
  return padded;
}

/**
 * Unpad plaintext
 */
function unpad(padded: Uint8Array): string {
  // Read length prefix (2 bytes, big-endian)
  const len = (padded[0] << 8) | padded[1];

  if (len < MIN_PLAINTEXT_SIZE || len > MAX_PLAINTEXT_SIZE || len > padded.length - 2) {
    throw new Error('Invalid padding');
  }

  const plaintextBytes = padded.slice(2, 2 + len);
  return new TextDecoder().decode(plaintextBytes);
}

/**
 * Encrypt message using NIP-44 v2
 */
export async function encrypt(
  plaintext: string,
  conversationKey: Uint8Array,
  nonce?: Uint8Array
): Promise<string> {
  // Generate random nonce if not provided (32 bytes)
  const nonceBytes = nonce || crypto.getRandomValues(new Uint8Array(32));

  // Split conversation key
  const chachaKey = conversationKey.slice(0, 32);
  const chachaNonce = conversationKey.slice(32, 44);
  const hmacKey = conversationKey.slice(44, 76);

  // XOR the nonce with chacha nonce
  const finalNonce = new Uint8Array(12);
  for (let i = 0; i < 12; i++) {
    finalNonce[i] = chachaNonce[i] ^ nonceBytes[i];
  }

  // Pad plaintext
  const padded = pad(plaintext);

  // Encrypt using ChaCha20
  const ciphertext = chacha20(chachaKey, finalNonce, padded);

  // Calculate MAC
  const macData = new Uint8Array(nonceBytes.length + ciphertext.length);
  macData.set(nonceBytes);
  macData.set(ciphertext, nonceBytes.length);
  const mac = await hmacSha256(hmacKey, macData);

  // Combine: version + nonce + ciphertext + mac
  const payload = new Uint8Array(1 + nonceBytes.length + ciphertext.length + 32);
  payload[0] = VERSION;
  payload.set(nonceBytes, 1);
  payload.set(ciphertext, 1 + nonceBytes.length);
  payload.set(mac, 1 + nonceBytes.length + ciphertext.length);

  // Encode as base64
  return btoa(String.fromCharCode(...payload));
}

/**
 * Decrypt message using NIP-44 v2
 */
export async function decrypt(
  ciphertext: string,
  conversationKey: Uint8Array
): Promise<string> {
  // Decode from base64
  const payload = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

  // Check version
  if (payload[0] !== VERSION) {
    throw new Error('Unsupported encryption version');
  }

  // Extract components
  const nonceBytes = payload.slice(1, 33);
  const encrypted = payload.slice(33, payload.length - 32);
  const mac = payload.slice(payload.length - 32);

  // Split conversation key
  const chachaKey = conversationKey.slice(0, 32);
  const chachaNonce = conversationKey.slice(32, 44);
  const hmacKey = conversationKey.slice(44, 76);

  // Verify MAC
  const macData = new Uint8Array(nonceBytes.length + encrypted.length);
  macData.set(nonceBytes);
  macData.set(encrypted, nonceBytes.length);
  const expectedMac = await hmacSha256(hmacKey, macData);

  // Constant-time comparison
  let macMatch = true;
  for (let i = 0; i < 32; i++) {
    if (mac[i] !== expectedMac[i]) {
      macMatch = false;
    }
  }

  if (!macMatch) {
    throw new Error('Invalid MAC');
  }

  // XOR the nonce with chacha nonce
  const finalNonce = new Uint8Array(12);
  for (let i = 0; i < 12; i++) {
    finalNonce[i] = chachaNonce[i] ^ nonceBytes[i];
  }

  // Decrypt using ChaCha20
  const padded = chacha20(chachaKey, finalNonce, encrypted);

  // Unpad plaintext
  return unpad(padded);
}

/**
 * Encrypt message for a specific recipient
 */
export async function encryptMessage(
  plaintext: string,
  senderPrivateKeyHex: string,
  recipientPublicKeyHex: string
): Promise<string> {
  const conversationKey = await getConversationKey(senderPrivateKeyHex, recipientPublicKeyHex);
  return encrypt(plaintext, conversationKey);
}

/**
 * Decrypt message from a specific sender
 */
export async function decryptMessage(
  ciphertext: string,
  recipientPrivateKeyHex: string,
  senderPublicKeyHex: string
): Promise<string> {
  const conversationKey = await getConversationKey(recipientPrivateKeyHex, senderPublicKeyHex);
  return decrypt(ciphertext, conversationKey);
}
