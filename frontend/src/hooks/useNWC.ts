// frontend/src/hooks/useNWC.ts

import { useState, useCallback, useEffect, useRef } from 'react';
import { NostrEvent } from '../types/nostr';
import {
  NWCConnectionParams,
  NWCConnectionStatus,
  NWCConnectionState,
  NWCRequest,
  NWCResponse,
  NWCEventKind,
  PayInvoiceParams,
  PayInvoiceResult,
  MakeInvoiceParams,
  MakeInvoiceResult,
  GetBalanceResult,
  GetInfoResult,
  NWCMethod,
  NWCNotification,
} from '../types/nwc';
import { encryptMessage, decryptMessage } from '../lib/nip44';
import { generateEventId, hexToBytes } from '../lib/crypto';
import * as secp256k1 from '@noble/secp256k1';

export interface UseNWCReturn {
  connectionState: NWCConnectionState;
  connect: (connectionUri: string) => Promise<void>;
  disconnect: () => void;
  payInvoice: (params: PayInvoiceParams) => Promise<PayInvoiceResult>;
  makeInvoice: (params: MakeInvoiceParams) => Promise<MakeInvoiceResult>;
  getBalance: () => Promise<GetBalanceResult>;
  getInfo: () => Promise<GetInfoResult>;
  parseConnectionUri: (uri: string) => NWCConnectionParams | null;
}

export function useNWC(): UseNWCReturn {
  const [connectionState, setConnectionState] = useState<NWCConnectionState>({
    status: NWCConnectionStatus.DISCONNECTED,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const connectionParamsRef = useRef<NWCConnectionParams | null>(null);
  const pendingRequestsRef = useRef<Map<string, {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    timeout: number;
  }>>(new Map());
  const subscriptionIdRef = useRef<string | null>(null);

  /**
   * Parse NWC connection URI
   * Format: nostr+walletconnect://[wallet-pubkey]?relay=[relay-url]&secret=[client-secret]&lud16=[lightning-address]
   */
  const parseConnectionUri = useCallback((uri: string): NWCConnectionParams | null => {
    try {
      // Check protocol
      if (!uri.startsWith('nostr+walletconnect://')) {
        console.error('Invalid NWC URI protocol');
        return null;
      }

      // Remove protocol
      const withoutProtocol = uri.replace('nostr+walletconnect://', '');

      // Split pubkey and query params
      const [walletPubkey, queryString] = withoutProtocol.split('?');

      if (!walletPubkey || !queryString) {
        console.error('Invalid NWC URI format');
        return null;
      }

      // Parse query parameters
      const params = new URLSearchParams(queryString);
      const relay = params.get('relay');
      const secret = params.get('secret');
      const lud16 = params.get('lud16') || undefined;

      if (!relay || !secret) {
        console.error('Missing required NWC URI parameters');
        return null;
      }

      return {
        walletPubkey: walletPubkey,
        relay: decodeURIComponent(relay),
        secret: secret,
        lud16: lud16 ? decodeURIComponent(lud16) : undefined,
      };
    } catch (error) {
      console.error('Failed to parse NWC URI:', error);
      return null;
    }
  }, []);

  /**
   * Send NWC request
   */
  const sendRequest = useCallback(
    async <T = any>(method: NWCMethod, params: Record<string, any>): Promise<T> => {
      if (!connectionParamsRef.current || !wsRef.current) {
        throw new Error('Not connected to NWC');
      }

      const { walletPubkey, secret } = connectionParamsRef.current;

      // Create request payload
      const request: NWCRequest = {
        method,
        params,
      };

      // Encrypt request content
      const content = JSON.stringify(request);
      const encryptedContent = await encryptMessage(content, secret, walletPubkey);

      // Get our public key from the secret (private key)
      const clientPubkey = secp256k1.getPublicKey(secret, true);
      const clientPubkeyHex = Array.from(clientPubkey.slice(1))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Create event
      const created_at = Math.floor(Date.now() / 1000);
      const tags: string[][] = [['p', walletPubkey]];
      const kind = NWCEventKind.REQUEST;

      const id = await generateEventId(clientPubkeyHex, created_at, kind, tags, encryptedContent);

      // Sign event
      const sig = await secp256k1.sign(id, secret);
      const sigBytes = typeof sig === 'string' ? hexToBytes(sig) : sig.toCompactRawBytes();
      const sigHex = Array.from(sigBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const event: NostrEvent = {
        id,
        kind,
        pubkey: clientPubkeyHex,
        created_at,
        tags,
        content: encryptedContent,
        sig: sigHex,
      };

      // Send event
      return new Promise((resolve, reject) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket not connected'));
          return;
        }

        // Set timeout for request
        const timeout = setTimeout(() => {
          pendingRequestsRef.current.delete(id);
          reject(new Error('Request timeout'));
        }, 30000); // 30 second timeout

        // Store pending request
        pendingRequestsRef.current.set(id, { resolve, reject, timeout });

        // Send event to relay
        wsRef.current.send(JSON.stringify(['EVENT', event]));
        console.log('📤 Sent NWC request:', method, params);
      });
    },
    []
  );

  /**
   * Handle incoming messages from relay
   */
  const handleMessage = useCallback(async (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      const [type, ...rest] = data;

      if (type === 'EVENT') {
        const [_subscriptionId, nostrEvent] = rest;
        const { kind, content, tags, id: _eventId } = nostrEvent as NostrEvent;

        // Handle response events
        if (kind === NWCEventKind.RESPONSE) {
          if (!connectionParamsRef.current) return;

          const { walletPubkey, secret } = connectionParamsRef.current;

          try {
            // Decrypt content
            const decryptedContent = await decryptMessage(content, secret, walletPubkey);
            const response: NWCResponse = JSON.parse(decryptedContent);

            console.log('📥 Received NWC response:', response);

            // Find the request this is responding to
            const eTag = tags.find(t => t[0] === 'e');
            if (eTag && eTag[1]) {
              const requestId = eTag[1];
              const pending = pendingRequestsRef.current.get(requestId);

              if (pending) {
                clearTimeout(pending.timeout);
                pendingRequestsRef.current.delete(requestId);

                if (response.error) {
                  pending.reject(
                    new Error(`${response.error.code}: ${response.error.message}`)
                  );
                } else {
                  pending.resolve(response.result);
                }
              }
            }
          } catch (error) {
            console.error('Failed to decrypt NWC response:', error);
          }
        }

        // Handle notification events
        if (kind === NWCEventKind.NOTIFICATION) {
          if (!connectionParamsRef.current) return;

          const { walletPubkey, secret } = connectionParamsRef.current;

          try {
            const decryptedContent = await decryptMessage(content, secret, walletPubkey);
            const notification: NWCNotification = JSON.parse(decryptedContent);

            console.log('🔔 Received NWC notification:', notification);

            // Handle notifications (emit custom events, update state, etc.)
            window.dispatchEvent(new CustomEvent('nwc:notification', { detail: notification }));
          } catch (error) {
            console.error('Failed to decrypt NWC notification:', error);
          }
        }

        // Handle info events
        if (kind === NWCEventKind.INFO) {
          console.log('ℹ️ Received NWC info event:', nostrEvent);

          // Parse capabilities from content
          const methods = content.split(' ').filter(Boolean) as NWCMethod[];

          setConnectionState(prev => ({
            ...prev,
            capabilities: methods,
          }));
        }
      } else if (type === 'EOSE') {
        console.log('✅ End of stored events');
      } else if (type === 'OK') {
        const [eventId, success, message] = rest;
        console.log(`${success ? '✅' : '❌'} Event ${eventId}: ${message}`);
      } else if (type === 'NOTICE') {
        console.log('📢 Relay notice:', rest[0]);
      }
    } catch (error) {
      console.error('Failed to handle relay message:', error);
    }
  }, []);

  /**
   * Connect to NWC wallet
   */
  const connect = useCallback(
    async (connectionUri: string) => {
      // Parse connection URI
      const params = parseConnectionUri(connectionUri);
      if (!params) {
        throw new Error('Invalid NWC connection URI');
      }

      setConnectionState({
        status: NWCConnectionStatus.CONNECTING,
        walletPubkey: params.walletPubkey,
        relay: params.relay,
      });

      try {
        // Connect to relay
        const ws = new WebSocket(params.relay);

        ws.onopen = () => {
          console.log('✅ Connected to NWC relay:', params.relay);

          // Subscribe to response and notification events from wallet
          const subscriptionId = 'nwc_' + Math.random().toString(36).substring(7);
          subscriptionIdRef.current = subscriptionId;

          const filter = {
            kinds: [NWCEventKind.RESPONSE, NWCEventKind.NOTIFICATION, NWCEventKind.INFO],
            authors: [params.walletPubkey],
            '#p': [secp256k1.getPublicKey(params.secret, true).slice(1).reduce(
              (hex, byte) => hex + byte.toString(16).padStart(2, '0'),
              ''
            )],
          };

          ws.send(JSON.stringify(['REQ', subscriptionId, filter]));

          connectionParamsRef.current = params;
          setConnectionState({
            status: NWCConnectionStatus.CONNECTED,
            walletPubkey: params.walletPubkey,
            relay: params.relay,
          });
        };

        ws.onmessage = handleMessage;

        ws.onerror = (error) => {
          console.error('❌ NWC WebSocket error:', error);
          setConnectionState({
            status: NWCConnectionStatus.ERROR,
            error: 'WebSocket connection error',
          });
        };

        ws.onclose = () => {
          console.log('🔌 Disconnected from NWC relay');
          setConnectionState({
            status: NWCConnectionStatus.DISCONNECTED,
          });
        };

        wsRef.current = ws;
      } catch (error) {
        console.error('Failed to connect to NWC:', error);
        setConnectionState({
          status: NWCConnectionStatus.ERROR,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }
    },
    [parseConnectionUri, handleMessage]
  );

  /**
   * Disconnect from NWC
   */
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      // Close subscription
      if (subscriptionIdRef.current) {
        wsRef.current.send(JSON.stringify(['CLOSE', subscriptionIdRef.current]));
      }

      wsRef.current.close();
      wsRef.current = null;
    }

    // Clear pending requests
    pendingRequestsRef.current.forEach(({ timeout, reject }) => {
      clearTimeout(timeout);
      reject(new Error('Disconnected'));
    });
    pendingRequestsRef.current.clear();

    connectionParamsRef.current = null;
    subscriptionIdRef.current = null;

    setConnectionState({
      status: NWCConnectionStatus.DISCONNECTED,
    });
  }, []);

  /**
   * Pay a Lightning invoice
   */
  const payInvoice = useCallback(
    async (params: PayInvoiceParams): Promise<PayInvoiceResult> => {
      return sendRequest<PayInvoiceResult>('pay_invoice', params);
    },
    [sendRequest]
  );

  /**
   * Create a Lightning invoice
   */
  const makeInvoice = useCallback(
    async (params: MakeInvoiceParams): Promise<MakeInvoiceResult> => {
      return sendRequest<MakeInvoiceResult>('make_invoice', params);
    },
    [sendRequest]
  );

  /**
   * Get wallet balance
   */
  const getBalance = useCallback(async (): Promise<GetBalanceResult> => {
    const result = await sendRequest<GetBalanceResult>('get_balance', {});

    // Update connection state with balance
    setConnectionState(prev => ({
      ...prev,
      balance: result.balance,
    }));

    return result;
  }, [sendRequest]);

  /**
   * Get wallet info
   */
  const getInfo = useCallback(async (): Promise<GetInfoResult> => {
    const result = await sendRequest<GetInfoResult>('get_info', {});

    // Update connection state with capabilities
    setConnectionState(prev => ({
      ...prev,
      capabilities: result.methods,
    }));

    return result;
  }, [sendRequest]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connectionState,
    connect,
    disconnect,
    payInvoice,
    makeInvoice,
    getBalance,
    getInfo,
    parseConnectionUri,
  };
}
