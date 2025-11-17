// frontend/src/types/nwc.ts

/**
 * NIP-47 Nostr Wallet Connect Types
 */

/**
 * NWC Connection URI parameters
 * Format: nostr+walletconnect://[wallet-pubkey]?relay=[relay-url]&secret=[client-secret]&lud16=[lightning-address]
 */
export interface NWCConnectionParams {
  walletPubkey: string;
  relay: string;
  secret: string;
  lud16?: string;
}

/**
 * NWC Event Kinds (NIP-47)
 */
export enum NWCEventKind {
  INFO = 13194,        // Wallet service info event (replaceable)
  REQUEST = 23194,     // Request event (client to wallet)
  RESPONSE = 23195,    // Response event (wallet to client)
  NOTIFICATION = 23197 // Notification event (wallet to client)
}

/**
 * NWC Request Methods
 */
export type NWCMethod =
  | 'pay_invoice'
  | 'multi_pay_invoice'
  | 'pay_keysend'
  | 'multi_pay_keysend'
  | 'make_invoice'
  | 'lookup_invoice'
  | 'list_transactions'
  | 'get_balance'
  | 'get_info';

/**
 * NWC Error Codes
 */
export enum NWCErrorCode {
  RATE_LIMITED = 'RATE_LIMITED',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  RESTRICTED = 'RESTRICTED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INTERNAL = 'INTERNAL',
  UNSUPPORTED_ENCRYPTION = 'UNSUPPORTED_ENCRYPTION',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  OTHER = 'OTHER'
}

/**
 * NWC Error
 */
export interface NWCError {
  code: NWCErrorCode | string;
  message: string;
}

/**
 * Base NWC Request
 */
export interface NWCRequest {
  method: NWCMethod;
  params: Record<string, any>;
}

/**
 * Base NWC Response
 */
export interface NWCResponse {
  result_type: NWCMethod;
  error?: NWCError;
  result?: Record<string, any>;
}

/**
 * pay_invoice request params
 */
export interface PayInvoiceParams {
  invoice: string;      // BOLT11 invoice
  amount?: number;      // Amount in millisatoshis (optional)
  metadata?: Record<string, any>;
}

/**
 * pay_invoice response
 */
export interface PayInvoiceResult {
  preimage: string;
  fees_paid?: number;   // Fees in millisatoshis
}

/**
 * make_invoice request params
 */
export interface MakeInvoiceParams {
  amount: number;       // Amount in millisatoshis
  description?: string;
  description_hash?: string;
  expiry?: number;      // Expiry in seconds
  metadata?: Record<string, any>;
}

/**
 * make_invoice response
 */
export interface MakeInvoiceResult {
  type: 'incoming' | 'outgoing';
  state: 'pending' | 'settled' | 'expired';
  invoice: string;      // BOLT11 invoice
  payment_hash: string;
  created_at: number;
  expires_at: number;
  amount?: number;      // Amount in millisatoshis
  description?: string;
}

/**
 * pay_keysend request params
 */
export interface PayKeysendParams {
  amount: number;       // Amount in millisatoshis (required)
  pubkey: string;       // Recipient pubkey (required)
  preimage?: string;    // Optional preimage
  tlv_records?: Array<{ type: number; value: string }>;
  metadata?: Record<string, any>;
}

/**
 * pay_keysend response
 */
export interface PayKeysendResult {
  preimage: string;
  fees_paid?: number;
}

/**
 * multi_pay_invoice request params
 */
export interface MultiPayInvoiceParams {
  invoices: Array<{
    id: string;
    invoice: string;
    amount?: number;
    metadata?: Record<string, any>;
  }>;
}

/**
 * lookup_invoice request params
 */
export interface LookupInvoiceParams {
  payment_hash: string;
  invoice?: string;
}

/**
 * lookup_invoice response
 */
export interface LookupInvoiceResult extends MakeInvoiceResult {}

/**
 * list_transactions request params
 */
export interface ListTransactionsParams {
  from?: number;        // Timestamp in seconds
  until?: number;       // Timestamp in seconds
  limit?: number;
  offset?: number;
  unpaid?: boolean;
  type?: 'incoming' | 'outgoing';
}

/**
 * Transaction object
 */
export interface Transaction {
  type: 'incoming' | 'outgoing';
  state: 'pending' | 'settled' | 'expired';
  invoice?: string;
  payment_hash: string;
  preimage?: string;
  amount: number;       // Amount in millisatoshis
  fees_paid?: number;   // Fees in millisatoshis
  created_at: number;
  expires_at?: number;
  settled_at?: number;
  description?: string;
  metadata?: Record<string, any>;
}

/**
 * list_transactions response
 */
export interface ListTransactionsResult {
  transactions: Transaction[];
}

/**
 * get_balance response
 */
export interface GetBalanceResult {
  balance: number;      // Balance in millisatoshis
}

/**
 * get_info response
 */
export interface GetInfoResult {
  alias?: string;
  color?: string;
  pubkey?: string;
  network?: string;
  block_height?: number;
  block_hash?: string;
  methods: NWCMethod[];
  notifications?: string[];
}

/**
 * NWC Info Event (kind 13194)
 */
export interface NWCInfoEvent {
  kind: 13194;
  pubkey: string;
  created_at: number;
  tags: Array<['encryption', string] | ['notifications', string]>;
  content: string;      // Space-separated list of supported methods
}

/**
 * Notification Types
 */
export type NotificationType = 'payment_received' | 'payment_sent';

/**
 * Payment Received Notification
 */
export interface PaymentReceivedNotification {
  notification_type: 'payment_received';
  notification: {
    type: 'incoming';
    invoice: string;
    payment_hash: string;
    amount: number;
    settled_at: number;
    metadata?: Record<string, any>;
  };
}

/**
 * Payment Sent Notification
 */
export interface PaymentSentNotification {
  notification_type: 'payment_sent';
  notification: {
    type: 'outgoing';
    invoice?: string;
    payment_hash: string;
    preimage: string;
    amount: number;
    fees_paid?: number;
    settled_at: number;
    metadata?: Record<string, any>;
  };
}

/**
 * NWC Notification
 */
export type NWCNotification = PaymentReceivedNotification | PaymentSentNotification;

/**
 * NWC Connection Status
 */
export enum NWCConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

/**
 * NWC Connection State
 */
export interface NWCConnectionState {
  status: NWCConnectionStatus;
  walletPubkey?: string;
  relay?: string;
  capabilities?: NWCMethod[];
  balance?: number;
  error?: string;
}
