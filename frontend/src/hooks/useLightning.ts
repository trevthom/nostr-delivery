// frontend/src/hooks/useLightning.ts
import { useState, useCallback } from 'react';

interface LightningInvoice {
  paymentRequest: string;
  paymentHash: string;
  amount: number;
  memo?: string;
  expiresAt: number;
}

interface LightningPayment {
  paymentHash: string;
  preimage?: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  timestamp: number;
}

interface UseLightningReturn {
  connected: boolean;
  balance: number;
  connect: () => Promise<void>;
  disconnect: () => void;
  createInvoice: (amount: number, memo?: string) => Promise<LightningInvoice | null>;
  payInvoice: (invoice: string) => Promise<LightningPayment | null>;
  checkInvoiceStatus: (paymentHash: string) => Promise<'pending' | 'paid' | 'expired'>;
  getBalance: () => Promise<number>;
}

export function useLightning(): UseLightningReturn {
  const [connected, setConnected] = useState(false);
  const [balance, setBalance] = useState(0);

  // Connect to Lightning wallet (WebLN)
  const connect = useCallback(async () => {
    try {
      // Try WebLN extension
      if (window.webln) {
        await window.webln.enable();
        setConnected(true);
        console.log('✅ Connected to Lightning via WebLN');
        
        // Try to get balance if supported
        try {
          const info = await window.webln.getInfo();
          console.log('⚡ Lightning info:', info);
        } catch (e) {
          console.log('Balance not available from WebLN');
        }
        
        return;
      }

      // Demo mode
      console.log('⚡ Running in Lightning demo mode');
      setConnected(true);
      setBalance(1000000); // Demo: 1M sats
    } catch (error) {
      console.error('Failed to connect to Lightning:', error);
      // Fall back to demo mode
      setConnected(true);
      setBalance(1000000);
    }
  }, []);

  // Disconnect from Lightning
  const disconnect = useCallback(() => {
    setConnected(false);
    setBalance(0);
    console.log('Disconnected from Lightning');
  }, []);

  // Create Lightning invoice
  const createInvoice = useCallback(async (
    amount: number,
    memo?: string
  ): Promise<LightningInvoice | null> => {
    if (!connected) {
      console.error('Not connected to Lightning');
      return null;
    }

    try {
      if (window.webln) {
        // Use WebLN to create invoice
        const invoice = await window.webln.makeInvoice({
          amount,
          defaultMemo: memo
        });

        return {
          paymentRequest: invoice.paymentRequest,
          paymentHash: invoice.paymentHash || generateRandomHash(),
          amount,
          memo,
          expiresAt: Date.now() + 3600000 // 1 hour
        };
      }

      // Demo mode - generate fake invoice
      const paymentHash = generateRandomHash();
      const paymentRequest = `lnbc${amount}n1${generateRandomString(100)}`;

      console.log('💰 Created invoice (demo):', { amount, memo, paymentHash });

      return {
        paymentRequest,
        paymentHash,
        amount,
        memo,
        expiresAt: Date.now() + 3600000
      };
    } catch (error) {
      console.error('Failed to create invoice:', error);
      return null;
    }
  }, [connected]);

  // Pay Lightning invoice
  const payInvoice = useCallback(async (
    invoice: string
  ): Promise<LightningPayment | null> => {
    if (!connected) {
      console.error('Not connected to Lightning');
      return null;
    }

    try {
      if (window.webln) {
        // Use WebLN to pay invoice
        const result = await window.webln.sendPayment(invoice);

        return {
          paymentHash: result.paymentHash || generateRandomHash(),
          preimage: result.preimage,
          amount: 0, // Amount not always returned
          status: 'completed',
          timestamp: Date.now()
        };
      }

      // Demo mode - simulate payment
      const paymentHash = generateRandomHash();
      const preimage = generateRandomHash();

      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('💸 Paid invoice (demo):', { paymentHash });

      // Update demo balance
      setBalance(prev => prev - 25000); // Deduct demo amount

      return {
        paymentHash,
        preimage,
        amount: 25000,
        status: 'completed',
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Failed to pay invoice:', error);
      return {
        paymentHash: generateRandomHash(),
        amount: 0,
        status: 'failed',
        timestamp: Date.now()
      };
    }
  }, [connected]);

  // Check invoice payment status
  const checkInvoiceStatus = useCallback(async (
    paymentHash: string
  ): Promise<'pending' | 'paid' | 'expired'> => {
    // In production, this would query the Lightning node
    console.log('🔍 Checking invoice status:', paymentHash);
    
    // Demo mode - randomly return status
    const statuses: ('pending' | 'paid' | 'expired')[] = ['pending', 'paid', 'expired'];
    return statuses[Math.floor(Math.random() * statuses.length)];
  }, []);

  // Get current balance
  const getBalance = useCallback(async (): Promise<number> => {
    if (!connected) {
      return 0;
    }

    try {
      if (window.webln && window.webln.getBalance) {
        const result = await window.webln.getBalance();
        const balanceValue = result.balance || 0;
        setBalance(balanceValue);
        return balanceValue;
      }

      // Demo mode
      return balance;
    } catch (error) {
      console.error('Failed to get balance:', error);
      return balance;
    }
  }, [connected, balance]);

  return {
    connected,
    balance,
    connect,
    disconnect,
    createInvoice,
    payInvoice,
    checkInvoiceStatus,
    getBalance
  };
}

// Helper functions
function generateRandomHash(): string {
  return Array.from({ length: 64 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => 
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

// Type augmentation for window.webln
declare global {
  interface Window {
    webln?: {
      enable: () => Promise<void>;
      getInfo: () => Promise<{
        node?: { alias?: string; pubkey?: string };
        version?: string;
        [key: string]: any;
      }>;
      makeInvoice: (args: {
        amount: number;
        defaultMemo?: string;
        minimumAmount?: number;
        maximumAmount?: number;
      }) => Promise<{
        paymentRequest: string;
        paymentHash?: string;
      }>;
      sendPayment: (invoice: string) => Promise<{
        preimage?: string;
        paymentHash?: string;
        route?: any;
      }>;
      getBalance?: () => Promise<{ balance: number }>;
      signMessage?: (message: string) => Promise<{ signature: string }>;
      verifyMessage?: (signature: string, message: string) => Promise<void>;
    };
  }
}

export type { LightningInvoice, LightningPayment };
