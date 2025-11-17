// frontend/src/lib/payments.ts

/**
 * Payment utilities for nostr-delivery
 * Integrates NWC (Nostr Wallet Connect) for Bitcoin Lightning payments
 */

import type { UseNWCReturn } from '../hooks/useNWC';
import { NWCConnectionStatus } from '../types/nwc';

/**
 * Create escrow invoice for a delivery
 * The sender creates an invoice to lock funds in escrow
 */
export async function createEscrowInvoice(
  nwc: UseNWCReturn,
  amount: number, // in sats
  deliveryId: string,
  description: string
): Promise<{ invoice: string; paymentHash: string } | null> {
  if (nwc.connectionState.status !== NWCConnectionStatus.CONNECTED) {
    throw new Error('NWC wallet not connected');
  }

  try {
    const result = await nwc.makeInvoice({
      amount: amount * 1000, // Convert sats to millisats
      description: `Escrow for delivery ${deliveryId}: ${description}`,
      expiry: 3600, // 1 hour expiry
      metadata: {
        delivery_id: deliveryId,
        type: 'escrow',
      },
    });

    return {
      invoice: result.invoice,
      paymentHash: result.payment_hash,
    };
  } catch (error) {
    console.error('Failed to create escrow invoice:', error);
    throw error;
  }
}

/**
 * Pay an invoice
 * Used by sender to pay escrow or by courier to receive payment
 */
export async function payInvoice(
  nwc: UseNWCReturn,
  invoice: string,
  deliveryId?: string
): Promise<{ preimage: string; feesPaid?: number }> {
  if (nwc.connectionState.status !== NWCConnectionStatus.CONNECTED) {
    throw new Error('NWC wallet not connected');
  }

  try {
    const result = await nwc.payInvoice({
      invoice,
      metadata: deliveryId ? { delivery_id: deliveryId } : undefined,
    });

    return {
      preimage: result.preimage,
      feesPaid: result.fees_paid ? result.fees_paid / 1000 : undefined, // Convert to sats
    };
  } catch (error) {
    console.error('Failed to pay invoice:', error);
    throw error;
  }
}

/**
 * Create payment invoice for courier
 * Courier creates invoice to receive payment after delivery completion
 */
export async function createCourierPaymentInvoice(
  nwc: UseNWCReturn,
  amount: number, // in sats
  deliveryId: string,
  courierName?: string
): Promise<{ invoice: string; paymentHash: string } | null> {
  if (nwc.connectionState.status !== NWCConnectionStatus.CONNECTED) {
    throw new Error('NWC wallet not connected');
  }

  try {
    const result = await nwc.makeInvoice({
      amount: amount * 1000, // Convert sats to millisats
      description: `Payment for delivery ${deliveryId}${courierName ? ` by ${courierName}` : ''}`,
      expiry: 3600, // 1 hour expiry
      metadata: {
        delivery_id: deliveryId,
        type: 'courier_payment',
      },
    });

    return {
      invoice: result.invoice,
      paymentHash: result.payment_hash,
    };
  } catch (error) {
    console.error('Failed to create courier payment invoice:', error);
    throw error;
  }
}

/**
 * Send keysend payment directly to a pubkey
 * Alternative to invoice-based payments
 */
export async function sendKeysendPayment(
  nwc: UseNWCReturn,
  _recipientPubkey: string,
  amount: number, // in sats
  deliveryId?: string
): Promise<{ preimage: string; feesPaid?: number }> {
  if (nwc.connectionState.status !== NWCConnectionStatus.CONNECTED) {
    throw new Error('NWC wallet not connected');
  }

  try {
    // Check if wallet supports pay_keysend
    if (
      !nwc.connectionState.capabilities?.includes('pay_keysend')
    ) {
      throw new Error('Wallet does not support keysend payments');
    }

    const result = await nwc.payInvoice({
      invoice: '', // Keysend doesn't use invoice
      amount: amount * 1000, // Convert sats to millisats
      metadata: deliveryId ? { delivery_id: deliveryId } : undefined,
    });

    return {
      preimage: result.preimage,
      feesPaid: result.fees_paid ? result.fees_paid / 1000 : undefined,
    };
  } catch (error) {
    console.error('Failed to send keysend payment:', error);
    throw error;
  }
}

/**
 * Get wallet balance in sats
 */
export async function getWalletBalance(nwc: UseNWCReturn): Promise<number> {
  if (nwc.connectionState.status !== NWCConnectionStatus.CONNECTED) {
    throw new Error('NWC wallet not connected');
  }

  try {
    const result = await nwc.getBalance();
    return Math.floor(result.balance / 1000); // Convert millisats to sats
  } catch (error) {
    console.error('Failed to get wallet balance:', error);
    throw error;
  }
}

/**
 * Check if wallet has sufficient balance
 */
export async function hasSufficientBalance(
  nwc: UseNWCReturn,
  requiredAmount: number // in sats
): Promise<boolean> {
  try {
    const balance = await getWalletBalance(nwc);
    return balance >= requiredAmount;
  } catch (error) {
    console.error('Failed to check balance:', error);
    return false;
  }
}

/**
 * Format amount in sats for display
 */
export function formatSats(amount: number): string {
  return `${amount.toLocaleString()} sats`;
}

/**
 * Format amount in BTC for display
 */
export function formatBTC(sats: number): string {
  const btc = sats / 100000000;
  return `${btc.toFixed(8)} BTC`;
}

/**
 * Estimate total cost including fees
 * Assumes ~1% Lightning network fees
 */
export function estimateTotalCost(amount: number): number {
  return Math.ceil(amount * 1.01);
}
