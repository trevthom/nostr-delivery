// frontend/src/hooks/useNostr.ts
import { useState, useEffect, useCallback } from 'react';

interface NostrEvent {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
  pubkey: string;
  id?: string;
  sig?: string;
}

interface NostrFilter {
  kinds?: number[];
  authors?: string[];
  since?: number;
  until?: number;
  limit?: number;
  [key: string]: any;
}

interface UseNostrReturn {
  connected: boolean;
  publicKey: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  publishEvent: (kind: number, content: string, tags?: string[][]) => Promise<string | null>;
  subscribeToEvents: (filters: NostrFilter, onEvent: (event: NostrEvent) => void) => () => void;
  signEvent: (event: NostrEvent) => Promise<NostrEvent | null>;
}

export function useNostr(): UseNostrReturn {
  const [connected, setConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [sockets, setSockets] = useState<Map<string, WebSocket>>(new Map());

  // Connect to Nostr extension or create demo connection
  const connect = useCallback(async () => {
    try {
      // Try browser extension first
      if (window.nostr) {
        const pubkey = await window.nostr.getPublicKey();
        setPublicKey(pubkey);
        setConnected(true);
        console.log('✅ Connected via Nostr extension');
        return;
      }

      // Demo mode - generate random pubkey
      const demoPubkey = Array.from({ length: 64 }, () => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('');
      setPublicKey(demoPubkey);
      setConnected(true);
      console.log('✅ Connected in demo mode');
    } catch (error) {
      console.error('Failed to connect to Nostr:', error);
      throw error;
    }
  }, []);

  // Disconnect from Nostr
  const disconnect = useCallback(() => {
    sockets.forEach(socket => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    });
    setSockets(new Map());
    setConnected(false);
    setPublicKey(null);
    console.log('Disconnected from Nostr');
  }, [sockets]);

  // Publish event to relays
  const publishEvent = useCallback(async (
    kind: number,
    content: string,
    tags: string[][] = []
  ): Promise<string | null> => {
    if (!publicKey) {
      console.error('Not connected to Nostr');
      return null;
    }

    try {
      const event: NostrEvent = {
        kind,
        content,
        tags,
        created_at: Math.floor(Date.now() / 1000),
        pubkey: publicKey
      };

      // Sign event
      const signedEvent = await signEvent(event);
      if (!signedEvent) {
        throw new Error('Failed to sign event');
      }

      // In production, this would send to actual relays
      console.log('📤 Publishing event:', signedEvent);
      
      // For demo, just return a fake event ID
      const eventId = Array.from({ length: 64 }, () => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('');
      
      return eventId;
    } catch (error) {
      console.error('Failed to publish event:', error);
      return null;
    }
  }, [publicKey]);

  // Subscribe to events from relays
  const subscribeToEvents = useCallback((
    filters: NostrFilter,
    _onEvent: (event: NostrEvent) => void
  ): (() => void) => {
    // In production, this would subscribe to actual relay events
    console.log('📥 Subscribing to events:', filters);

    // For demo, return empty cleanup function
    return () => {
      console.log('Unsubscribed from events');
    };
  }, []);

  // Sign event (using extension or demo mode)
  const signEvent = useCallback(async (event: NostrEvent): Promise<NostrEvent | null> => {
    try {
      if (window.nostr) {
        // Use extension to sign
        const signed = await window.nostr.signEvent(event);
        return signed;
      }

      // Demo mode - create fake signature
      const fakeId = Array.from({ length: 64 }, () => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('');
      const fakeSig = Array.from({ length: 128 }, () => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('');

      return {
        ...event,
        id: fakeId,
        sig: fakeSig
      };
    } catch (error) {
      console.error('Failed to sign event:', error);
      return null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connected,
    publicKey,
    connect,
    disconnect,
    publishEvent,
    subscribeToEvents,
    signEvent
  };
}

// Type augmentation for window.nostr
declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: NostrEvent) => Promise<NostrEvent>;
      getRelays?: () => Promise<{ [url: string]: { read: boolean; write: boolean } }>;
      nip04?: {
        encrypt: (pubkey: string, plaintext: string) => Promise<string>;
        decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
      };
    };
  }
}

export type { NostrEvent, NostrFilter };
