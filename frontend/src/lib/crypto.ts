// frontend/src/lib/crypto.ts
import * as secp256k1 from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';

/**
 * Cryptography utility functions for Nostr
 */

// Configure secp256k1 to use @noble/hashes for HMAC-SHA256
// This is required for signing operations in @noble/secp256k1 v2.x
(secp256k1.utils as any).hmacSha256Sync = (key: Uint8Array, ...messages: Uint8Array[]): Uint8Array => {
  const h = hmac.create(nobleSha256, key);
  messages.forEach(msg => h.update(msg));
  return h.digest();
};

// Export the configured secp256k1 instance for use throughout the application
// This ensures all modules use the same configured instance with HMAC-SHA256 support
export { secp256k1 };

/**
 * Generate random hex string
 */
export function generateRandomHex(length: number = 64): string {
  const array = new Uint8Array(length / 2);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash string using SHA-256
 */
export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Bech32 character set
 */
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/**
 * Decode bech32 string (simplified for Nostr keys)
 */
function bech32Decode(str: string): { prefix: string; data: Uint8Array } {
  const pos = str.lastIndexOf('1');
  if (pos < 1 || pos + 7 > str.length || str.length > 90) {
    throw new Error('Invalid bech32 string');
  }

  const prefix = str.substring(0, pos).toLowerCase();
  const data: number[] = [];
  
  for (let i = pos + 1; i < str.length; i++) {
    const char = str.charAt(i);
    const value = BECH32_CHARSET.indexOf(char);
    if (value === -1) {
      throw new Error('Invalid bech32 character');
    }
    data.push(value);
  }

  // Convert from 5-bit to 8-bit
  const bytes = convertBits(data.slice(0, -6), 5, 8, false);
  if (!bytes) {
    throw new Error('Invalid bech32 data');
  }

  return { prefix, data: new Uint8Array(bytes) };
}

/**
 * Convert between bit groups
 */
function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): number[] | null {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;

  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    if (value < 0 || value >> fromBits !== 0) {
      return null;
    }
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }

  if (pad) {
    if (bits > 0) {
      result.push((acc << (toBits - bits)) & maxv);
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    return null;
  }

  return result;
}

/**
 * Encode to base64
 */
export function encodeBase64(data: string): string {
  return btoa(data);
}

/**
 * Decode from base64
 */
export function decodeBase64(encoded: string): string {
  return atob(encoded);
}

/**
 * Generate event ID from event data
 */
export async function generateEventId(
  pubkey: string,
  created_at: number,
  kind: number,
  tags: string[][],
  content: string
): Promise<string> {
  const eventData = JSON.stringify([
    0,
    pubkey,
    created_at,
    kind,
    tags,
    content
  ]);
  return sha256(eventData);
}

/**
 * Verify event ID
 */
export async function verifyEventId(
  id: string,
  pubkey: string,
  created_at: number,
  kind: number,
  tags: string[][],
  content: string
): Promise<boolean> {
  const calculatedId = await generateEventId(pubkey, created_at, kind, tags, content);
  return id === calculatedId;
}

/**
 * Simple XOR encryption (for demo purposes only)
 * In production, use proper NIP-04 encryption
 */
export function xorEncrypt(message: string, key: string): string {
  let result = '';
  for (let i = 0; i < message.length; i++) {
    result += String.fromCharCode(
      message.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return encodeBase64(result);
}

/**
 * Simple XOR decryption (for demo purposes only)
 */
export function xorDecrypt(encrypted: string, key: string): string {
  const decoded = decodeBase64(encrypted);
  let result = '';
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(
      decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return result;
}

/**
 * Encode bech32 string
 */
function bech32Encode(prefix: string, data: Uint8Array): string {
  const words = convertBits(Array.from(data), 8, 5, true);
  if (!words) {
    throw new Error('Failed to convert bits');
  }

  // Create checksum
  const checksumWords = createChecksum(prefix, words);
  const combined = words.concat(checksumWords);

  let result = prefix + '1';
  for (let i = 0; i < combined.length; i++) {
    result += BECH32_CHARSET.charAt(combined[i]);
  }

  return result;
}

/**
 * Create bech32 checksum
 */
function createChecksum(prefix: string, data: number[]): number[] {
  const values = prefixChk(prefix).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const polymod = bech32Polymod(values) ^ 1;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) {
    checksum.push((polymod >> (5 * (5 - i))) & 31);
  }
  return checksum;
}

/**
 * Bech32 polymod
 */
function bech32Polymod(values: number[]): number {
  const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (let i = 0; i < values.length; i++) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ values[i];
    for (let j = 0; j < 5; j++) {
      if ((b >> j) & 1) {
        chk ^= GENERATOR[j];
      }
    }
  }
  return chk;
}

/**
 * Prefix to checksum values
 */
function prefixChk(prefix: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < prefix.length; i++) {
    result.push(prefix.charCodeAt(i) >> 5);
  }
  result.push(0);
  for (let i = 0; i < prefix.length; i++) {
    result.push(prefix.charCodeAt(i) & 31);
  }
  return result;
}

/**
 * Generate NIP-19 npub from hex pubkey using proper bech32 encoding
 */
export function hexToNpub(hexPubkey: string): string {
  if (!isValidHex(hexPubkey) || hexPubkey.length !== 64) {
    throw new Error('Invalid hex pubkey');
  }
  
  const bytes = hexToBytes(hexPubkey);
  return bech32Encode('npub', bytes);
}

/**
 * Convert npub to hex pubkey using proper bech32 decoding
 */
export function npubToHex(npub: string): string {
  if (!npub.startsWith('npub1')) {
    throw new Error('Invalid npub format');
  }
  
  try {
    const decoded = bech32Decode(npub);
    if (decoded.prefix !== 'npub') {
      throw new Error('Invalid npub prefix');
    }
    
    const hex = bytesToHex(decoded.data);
    if (hex.length !== 64) {
      throw new Error('Invalid npub length');
    }
    
    return hex;
  } catch (error) {
    throw new Error('Failed to decode npub: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Generate NIP-19 nsec from hex private key using proper bech32 encoding
 */
export function hexToNsec(hexPrivkey: string): string {
  if (!isValidHex(hexPrivkey) || hexPrivkey.length !== 64) {
    throw new Error('Invalid hex private key');
  }
  
  const bytes = hexToBytes(hexPrivkey);
  return bech32Encode('nsec', bytes);
}

/**
 * Convert nsec to hex private key using proper bech32 decoding
 */
export function nsecToHex(nsec: string): string {
  if (!nsec.startsWith('nsec1')) {
    throw new Error('Invalid nsec format');
  }
  
  try {
    const decoded = bech32Decode(nsec);
    if (decoded.prefix !== 'nsec') {
      throw new Error('Invalid nsec prefix');
    }
    
    const hex = bytesToHex(decoded.data);
    if (hex.length !== 64) {
      throw new Error('Invalid nsec length');
    }
    
    return hex;
  } catch (error) {
    throw new Error('Failed to decode nsec: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Derive public key from private key using secp256k1
 */
export async function derivePublicKey(privkeyHex: string): Promise<string> {
  try {
    // Ensure the private key is valid hex
    if (!isValidHex(privkeyHex) || privkeyHex.length !== 64) {
      throw new Error('Invalid private key format');
    }
    
    // Use noble/secp256k1 to derive the public key
    const publicKeyBytes = secp256k1.getPublicKey(privkeyHex, false); // uncompressed
    
    // Ensure it's a Uint8Array
    const pubKeyArray = publicKeyBytes instanceof Uint8Array ? publicKeyBytes : new Uint8Array(publicKeyBytes);
    
    // Convert to hex and remove the '04' prefix (uncompressed marker)
    const publicKeyHex = bytesToHex(pubKeyArray);
    
    // For Nostr, we use the X coordinate only (first 32 bytes after the prefix)
    // The uncompressed public key is 65 bytes: 04 + X (32 bytes) + Y (32 bytes)
    // We skip the first byte (04) and take the next 32 bytes (X coordinate)
    return publicKeyHex.substring(2, 66);
  } catch (error) {
    console.error('Error deriving public key:', error);
    throw new Error('Failed to derive public key from private key');
  }
}

/**
 * Convert nsec to npub
 */
export async function nsecToNpub(nsec: string): Promise<string> {
  if (!isValidNsec(nsec)) {
    throw new Error('Invalid nsec format');
  }
  
  const privkeyHex = nsecToHex(nsec);
  const pubkeyHex = await derivePublicKey(privkeyHex);
  return hexToNpub(pubkeyHex);
}

/**
 * Format npub for display (first 4 + ... + last 4 after "npub1")
 */
export function formatNpubForDisplay(npub: string): string {
  if (!npub.startsWith('npub1')) {
    return npub;
  }
  // Remove "npub1" prefix, take first 4 and last 4 characters
  const withoutPrefix = npub.substring(5);
  if (withoutPrefix.length <= 8) {
    return npub;
  }
  return `npub1${withoutPrefix.substring(0, 4)}...${withoutPrefix.substring(withoutPrefix.length - 4)}`;
}

/**
 * Validate hex string
 */
export function isValidHex(hex: string): boolean {
  return /^[0-9a-f]*$/i.test(hex) && hex.length % 2 === 0;
}

/**
 * Validate npub
 */
export function isValidNpub(npub: string): boolean {
  return npub.startsWith('npub1') && npub.length >= 63 && npub.length <= 65;
}

/**
 * Validate nsec
 */
export function isValidNsec(nsec: string): boolean {
  return nsec.startsWith('nsec1') && nsec.length >= 63 && nsec.length <= 65;
}

/**
 * Generate random keypair using proper secp256k1
 */
export async function generateKeypair(): Promise<{ privkey: string; pubkey: string; npub: string; nsec: string }> {
  const privkey = generateRandomHex(64);
  const pubkey = await derivePublicKey(privkey);
  
  return {
    privkey,
    pubkey,
    npub: hexToNpub(pubkey),
    nsec: hexToNsec(privkey)
  };
}

/**
 * Truncate hex/npub for display
 */
export function truncateKey(key: string, length: number = 8): string {
  if (key.length <= length * 2) {
    return key;
  }
  return `${key.substring(0, length)}...${key.substring(key.length - length)}`;
}

/**
 * Generate Lightning invoice hash
 */
export async function generateInvoiceHash(amount: number, memo: string): Promise<string> {
  const data = `${amount}:${memo}:${Date.now()}`;
  return sha256(data);
}

/**
 * Validate Lightning invoice format
 */
export function isValidLightningInvoice(invoice: string): boolean {
  return invoice.startsWith('lnbc') && invoice.length > 20;
}

/**
 * Generate payment preimage
 */
export function generatePreimage(): string {
  return generateRandomHex(64);
}

/**
 * Hash preimage to get payment hash
 */
export async function hashPreimage(preimage: string): Promise<string> {
  return sha256(preimage);
}
