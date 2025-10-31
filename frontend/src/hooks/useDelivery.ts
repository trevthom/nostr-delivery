// frontend/src/hooks/useDelivery.ts
import { useState, useCallback, useEffect } from 'react';

interface PackageInfo {
  size: string;
  weight?: number;
  description: string;
  fragile: boolean;
  requires_signature: boolean;
}

interface Location {
  address: string;
  coordinates?: { lat: number; lng: number };
  instructions?: string;
}

interface DeliveryBid {
  id: string;
  courier: string;
  amount: number;
  estimated_time: string;
  reputation: number;
  completed_deliveries: number;
  message?: string;
  created_at: number;
}

interface DeliveryRequest {
  id: string;
  sender: string;
  pickup: Location;
  dropoff: Location;
  packages: PackageInfo[];
  offer_amount: number;
  insurance_amount?: number;
  time_window: string;
  expires_at?: number;
  status: 'open' | 'accepted' | 'intransit' | 'completed' | 'confirmed' | 'disputed';
  bids: DeliveryBid[];
  accepted_bid?: string;
  created_at: number;
  distance_meters?: number;
}

interface UseDeliveryReturn {
  deliveries: DeliveryRequest[];
  loading: boolean;
  error: string | null;
  activeDelivery: DeliveryRequest | null;
  fetchDeliveries: (status?: string) => Promise<void>;
  fetchDelivery: (id: string) => Promise<DeliveryRequest | null>;
  createDelivery: (data: CreateDeliveryData) => Promise<DeliveryRequest | null>;
  placeBid: (deliveryId: string, amount: number, message?: string) => Promise<boolean>;
  acceptBid: (deliveryId: string, bidIndex: number) => Promise<boolean>;
  updateStatus: (deliveryId: string, status: string) => Promise<boolean>;
  confirmDelivery: (deliveryId: string, rating: number) => Promise<boolean>;
  calculateDistance: (pickup: Location, dropoff: Location) => number | null;
  estimatePrice: (distance: number, packages: PackageInfo[]) => number;
}

interface CreateDeliveryData {
  sender: string;
  pickup: Location;
  dropoff: Location;
  packages: PackageInfo[];
  offer_amount: number;
  insurance_amount?: number;
  time_window: string;
}

const API_URL = 'http://localhost:8080';

export function useDelivery(): UseDeliveryReturn {
  const [deliveries, setDeliveries] = useState<DeliveryRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDelivery, setActiveDelivery] = useState<DeliveryRequest | null>(null);

  // Fetch deliveries from API
  const fetchDeliveries = useCallback(async (status?: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const url = status 
        ? `${API_URL}/api/deliveries?status=${status}` 
        : `${API_URL}/api/deliveries`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch deliveries');
      }

      const data = await response.json();
      setDeliveries(data);
      
      // Update active delivery if exists
      const active = data.find((d: DeliveryRequest) => 
        d.status === 'accepted' || d.status === 'intransit' || d.status === 'completed'
      );
      setActiveDelivery(active || null);
      
      console.log(`✅ Fetched ${data.length} deliveries`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Failed to fetch deliveries:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch single delivery
  const fetchDelivery = useCallback(async (id: string): Promise<DeliveryRequest | null> => {
    try {
      const response = await fetch(`${API_URL}/api/deliveries/${id}`);
      
      if (!response.ok) {
        throw new Error('Delivery not found');
      }

      const data = await response.json();
      console.log('✅ Fetched delivery:', id);
      return data;
    } catch (err) {
      console.error('Failed to fetch delivery:', err);
      return null;
    }
  }, []);

  // Create new delivery
  const createDelivery = useCallback(async (
    data: CreateDeliveryData
  ): Promise<DeliveryRequest | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/deliveries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error('Failed to create delivery');
      }

      const result = await response.json();
      console.log('✅ Created delivery:', result.id);
      
      // Refresh deliveries list
      await fetchDeliveries();
      
      return result.delivery;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create delivery';
      setError(errorMessage);
      console.error('Failed to create delivery:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchDeliveries]);

  // Place bid on delivery
  const placeBid = useCallback(async (
    deliveryId: string,
    amount: number,
    message?: string
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      // Get current user's npub (from localStorage or context)
      const userNpub = localStorage.getItem('userNpub') || 'npub1demo';

      const response = await fetch(`${API_URL}/api/deliveries/${deliveryId}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courier: userNpub,
          amount,
          estimated_time: '1-2 hours',
          message
        })
      });

      if (!response.ok) {
        throw new Error('Failed to place bid');
      }

      console.log('✅ Placed bid on delivery:', deliveryId);
      
      // Refresh deliveries
      await fetchDeliveries();
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to place bid';
      setError(errorMessage);
      console.error('Failed to place bid:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchDeliveries]);

  // Accept bid
  const acceptBid = useCallback(async (
    deliveryId: string,
    bidIndex: number
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_URL}/api/deliveries/${deliveryId}/accept/${bidIndex}`,
        { method: 'POST' }
      );

      if (!response.ok) {
        throw new Error('Failed to accept bid');
      }

      const result = await response.json();
      console.log('✅ Accepted bid on delivery:', deliveryId);
      
      // Set as active delivery
      setActiveDelivery(result.delivery);
      
      // Refresh deliveries
      await fetchDeliveries();
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to accept bid';
      setError(errorMessage);
      console.error('Failed to accept bid:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchDeliveries]);

  // Update delivery status
  const updateStatus = useCallback(async (
    deliveryId: string,
    status: string
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/deliveries/${deliveryId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      console.log('✅ Updated delivery status:', deliveryId, status);
      
      // Refresh deliveries
      await fetchDeliveries();
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update status';
      setError(errorMessage);
      console.error('Failed to update status:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchDeliveries]);

  // Confirm delivery completion
  const confirmDelivery = useCallback(async (
    deliveryId: string,
    rating: number
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/deliveries/${deliveryId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating })
      });

      if (!response.ok) {
        throw new Error('Failed to confirm delivery');
      }

      console.log('✅ Confirmed delivery:', deliveryId);
      
      // Clear active delivery
      setActiveDelivery(null);
      
      // Refresh deliveries
      await fetchDeliveries();
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to confirm delivery';
      setError(errorMessage);
      console.error('Failed to confirm delivery:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchDeliveries]);

  // Calculate distance between two locations
  const calculateDistance = useCallback((
    pickup: Location,
    dropoff: Location
  ): number | null => {
    if (!pickup.coordinates || !dropoff.coordinates) {
      return null;
    }

    const R = 6371000; // Earth radius in meters
    const lat1 = pickup.coordinates.lat * Math.PI / 180;
    const lat2 = dropoff.coordinates.lat * Math.PI / 180;
    const deltaLat = (dropoff.coordinates.lat - pickup.coordinates.lat) * Math.PI / 180;
    const deltaLng = (dropoff.coordinates.lng - pickup.coordinates.lng) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c; // Distance in meters
  }, []);

  // Estimate delivery price based on distance and packages
  const estimatePrice = useCallback((
    distance: number,
    packages: PackageInfo[]
  ): number => {
    // Base rate: 300 sats per km
    const distanceKm = distance / 1000;
    const basePrice = distanceKm * 300;

    // Package size multiplier
    const sizeMultiplier = packages.reduce((sum, pkg) => {
      switch (pkg.size) {
        case 'envelope':
          return sum + 0.5;
        case 'small':
          return sum + 1.0;
        case 'medium':
          return sum + 1.5;
        case 'large':
          return sum + 2.5;
        case 'extra_large':
          return sum + 4.0;
        default:
          return sum + 1.0;
      }
    }, 0);

    // Fragile items add 20%
    const fragileMultiplier = packages.some(p => p.fragile) ? 1.2 : 1.0;

    // Signature required adds 10%
    const signatureMultiplier = packages.some(p => p.requires_signature) ? 1.1 : 1.0;

    const totalPrice = basePrice * sizeMultiplier * fragileMultiplier * signatureMultiplier;

    return Math.round(totalPrice);
  }, []);

  // Auto-fetch deliveries on mount
  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  return {
    deliveries,
    loading,
    error,
    activeDelivery,
    fetchDeliveries,
    fetchDelivery,
    createDelivery,
    placeBid,
    acceptBid,
    updateStatus,
    confirmDelivery,
    calculateDistance,
    estimatePrice
  };
}

export type { DeliveryRequest, DeliveryBid, PackageInfo, Location, CreateDeliveryData };
