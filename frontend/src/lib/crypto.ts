// frontend/src/lib/crypto.ts

/**
 * Cryptography utility functions for Nostr
 */

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
 * Generate NIP-19 npub from hex pubkey
 */
export function hexToNpub(hexPubkey: string): string {
  // Simplified version - in production use proper bech32 encoding
  return 'npub1' + hexPubkey.substring(0, 58);
}

/**
 * Convert npub to hex pubkey
 */
export function npubToHex(npub: string): string {
  // Simplified version - in production use proper bech32 decoding
  if (!npub.startsWith('npub1')) {
    throw new Error('Invalid npub format');
  }
  return npub.substring(5) + '0'.repeat(64 - npub.length + 5);
}

/**
 * Generate NIP-19 nsec from hex private key
 */
export function hexToNsec(hexPrivkey: string): string {
  // Simplified version - in production use proper bech32 encoding
  return 'nsec1' + hexPrivkey.substring(0, 58);
}

/**
 * Convert nsec to hex private key
 */
export function nsecToHex(nsec: string): string {
  // Simplified version - in production use proper bech32 decoding
  if (!nsec.startsWith('nsec1')) {
    throw new Error('Invalid nsec format');
  }
  return nsec.substring(5) + '0'.repeat(64 - nsec.length + 5);
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
 * Generate random keypair (for demo only)
 */
export function generateKeypair(): { privkey: string; pubkey: string; npub: string; nsec: string } {
  const privkey = generateRandomHex(64);
  const pubkey = generateRandomHex(64); // In production, derive from privkey
  
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
