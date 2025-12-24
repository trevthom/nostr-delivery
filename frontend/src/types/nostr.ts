// frontend/src/types/nostr.ts

/**
 * Nostr Event Kinds
 * Custom event kinds for delivery system (35000-35008)
 */
export enum NostrEventKind {
  // Standard Nostr kinds
  SET_METADATA = 0,
  TEXT_NOTE = 1,
  RECOMMEND_RELAY = 2,
  CONTACTS = 3,
  ENCRYPTED_DIRECT_MESSAGE = 4,
  EVENT_DELETION = 5,
  REPOST = 6,
  REACTION = 7,
  BADGE_AWARD = 8,
  
  // Custom delivery event kinds
  DELIVERY_REQUEST = 35000,
  DELIVERY_BID = 35001,
  DELIVERY_ACCEPTED = 35002,
  DELIVERY_STARTED = 35003,
  DELIVERY_IN_TRANSIT = 35004,
  DELIVERY_COMPLETED = 35005,
  DELIVERY_CONFIRMED = 35006,
  REPUTATION_UPDATE = 35007,
  DISPUTE = 35008,
  USER_PROFILE = 35009
}

/**
 * Nostr Event structure
 */
export interface NostrEvent {
  id?: string;
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
  sig?: string;
}

/**
 * Nostr Event Filter
 */
export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  [key: string]: any;
}

/**
 * Nostr Relay
 */
export interface NostrRelay {
  url: string;
  read: boolean;
  write: boolean;
}

/**
 * Nostr Profile (NIP-01)
 */
export interface NostrProfile {
  name?: string;
  about?: string;
  picture?: string;
  nip05?: string;
  lud16?: string; // Lightning address
  banner?: string;
  website?: string;
  [key: string]: any;
}

/**
 * Nostr Subscription
 */
export interface NostrSubscription {
  id: string;
  filters: NostrFilter[];
  callback: (event: NostrEvent) => void;
  unsubscribe: () => void;
}

/**
 * NIP-19 Encoded Identifiers
 */
export type NIP19Prefix = 'npub' | 'nsec' | 'note' | 'nprofile' | 'nevent' | 'nrelay' | 'naddr';

export interface NIP19Decoded {
  type: NIP19Prefix;
  data: string | object;
}

/**
 * NIP-04 Encrypted Direct Message
 */
export interface EncryptedMessage {
  ciphertext: string;
  sender: string;
  recipient: string;
  created_at: number;
}

/**
 * NIP-05 Verification
 */
export interface NIP05Verification {
  names: { [name: string]: string };
  relays?: { [pubkey: string]: string[] };
}

/**
 * Delivery-specific event content structures
 */
export interface DeliveryRequestContent {
  id: string;
  sender: string;
  pickup: {
    address: string;
    coordinates?: { lat: number; lng: number };
    instructions?: string;
  };
  dropoff: {
    address: string;
    coordinates?: { lat: number; lng: number };
    instructions?: string;
  };
  packages: Array<{
    size: string;
    weight?: number;
    description: string;
    fragile: boolean;
    requires_signature: boolean;
  }>;
  offer_amount: number;
  insurance_amount?: number;
  time_window: string;
  expires_at?: number;
}

export interface DeliveryBidContent {
  delivery_id: string;
  courier: string;
  amount: number;
  estimated_time: string;
  message?: string;
  reputation: number;
  completed_deliveries: number;
}

export interface DeliveryAcceptedContent {
  delivery_id: string;
  bid_id: string;
  courier: string;
  amount: number;
  escrow_invoice?: string;
}

export interface DeliveryStatusContent {
  delivery_id: string;
  status: 'started' | 'in_transit' | 'completed';
  location?: { lat: number; lng: number };
  timestamp: number;
  note?: string;
}

export interface DeliveryConfirmedContent {
  delivery_id: string;
  rating: number;
  feedback?: string;
  tip_amount?: number;
}

export interface ReputationUpdateContent {
  user: string;
  old_reputation: number;
  new_reputation: number;
  completed_deliveries: number;
  reason: string;
}

export interface DisputeContent {
  delivery_id: string;
  raised_by: string;
  reason: string;
  description: string;
  evidence: Array<{
    type: 'photo' | 'message' | 'gps' | 'other';
    content: string;
  }>;
}

/**
 * Nostr Tag types
 */
export type NostrTag = 
  | ['e', string, string?, string?] // Event reference
  | ['p', string, string?] // Pubkey reference
  | ['a', string, string?] // Address reference
  | ['t', string] // Topic/hashtag
  | ['g', string] // Geohash
  | ['amount', string] // Amount in sats
  | ['invoice', string] // Lightning invoice
  | ['preimage', string] // Payment preimage
  | [string, ...string[]]; // Generic tag

/**
 * Nostr Relay Message types
 */
export type RelayMessage =
  | ['EVENT', string, NostrEvent]
  | ['OK', string, boolean, string]
  | ['EOSE', string]
  | ['NOTICE', string]
  | ['CLOSED', string, string];

/**
 * Client-to-Relay Message types
 */
export type ClientMessage =
  | ['EVENT', NostrEvent]
  | ['REQ', string, ...NostrFilter[]]
  | ['CLOSE', string];

/**
 * Nostr Connection Status
 */
export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

/**
 * Nostr Error types
 */
export class NostrError extends Error {
  code: string;
  
  constructor(message: string, code: string) {
    super(message);
    this.name = 'NostrError';
    this.code = code;
  }
}

export class NostrConnectionError extends NostrError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'NostrConnectionError';
  }
}

export class NostrSigningError extends NostrError {
  constructor(message: string) {
    super(message, 'SIGNING_ERROR');
    this.name = 'NostrSigningError';
  }
}

export class NostrPublishError extends NostrError {
  constructor(message: string) {
    super(message, 'PUBLISH_ERROR');
    this.name = 'NostrPublishError';
  }
}
