import React, { useState, useEffect } from 'react';
import { Package, MapPin, Clock, Shield, Bitcoin, CheckCircle, XCircle, AlertCircle, Settings, LogOut, User, TrendingUp, Key } from 'lucide-react';
import { isValidNsec, nsecToNpub, formatNpubForDisplay } from './lib/crypto';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

enum PackageSize {
  ENVELOPE = 'envelope',
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
  EXTRA_LARGE = 'extra_large'
}

interface PackageInfo {
  size: PackageSize;
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

interface UserProfile {
  npub: string;
  display_name?: string;
  reputation: number;
  completed_deliveries: number;
  total_earnings?: number;
  verified_identity: boolean;
  lightning_address?: string;
}

enum UserMode {
  SENDER = 'sender',
  COURIER = 'courier'
}

// ============================================================================
// API CLIENT
// ============================================================================

const API_URL = 'http://localhost:8080';

const api = {
  getDeliveries: async (status?: string): Promise<DeliveryRequest[]> => {
    const url = status ? `${API_URL}/api/deliveries?status=${status}` : `${API_URL}/api/deliveries`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch deliveries');
    return response.json();
  },

  createDelivery: async (data: any): Promise<any> => {
    const response = await fetch(`${API_URL}/api/deliveries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create delivery');
    return response.json();
  },

  placeBid: async (deliveryId: string, bidData: any): Promise<any> => {
    const response = await fetch(`${API_URL}/api/deliveries/${deliveryId}/bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bidData)
    });
    if (!response.ok) throw new Error('Failed to place bid');
    return response.json();
  },

  acceptBid: async (deliveryId: string, bidIndex: number): Promise<any> => {
    const response = await fetch(`${API_URL}/api/deliveries/${deliveryId}/accept/${bidIndex}`, {
      method: 'POST'
    });
    if (!response.ok) throw new Error('Failed to accept bid');
    return response.json();
  },

  confirmDelivery: async (deliveryId: string, rating: number): Promise<any> => {
    const response = await fetch(`${API_URL}/api/deliveries/${deliveryId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating })
    });
    if (!response.ok) throw new Error('Failed to confirm delivery');
    return response.json();
  },

  getUser: async (npub: string): Promise<UserProfile> => {
    const response = await fetch(`${API_URL}/api/user/${npub}`);
    if (!response.ok) throw new Error('Failed to fetch user');
    return response.json();
  },

  updateDelivery: async (deliveryId: string, data: any): Promise<any> => {
    const response = await fetch(`${API_URL}/api/deliveries/${deliveryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to update delivery');
    return response.json();
  },

  deleteDelivery: async (deliveryId: string): Promise<any> => {
    const response = await fetch(`${API_URL}/api/deliveries/${deliveryId}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete delivery');
    return response.json();
  },

  cancelDelivery: async (deliveryId: string): Promise<any> => {
    const response = await fetch(`${API_URL}/api/deliveries/${deliveryId}/cancel`, {
      method: 'POST'
    });
    if (!response.ok) throw new Error('Failed to cancel delivery');
    return response.json();
  }
};

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export default function DeliveryApp() {
  // Auth & User State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authType, setAuthType] = useState<'demo' | 'nsec'>('demo'); // Track auth type
  const [userMode, setUserMode] = useState<UserMode>(UserMode.SENDER);
  const [userProfile, setUserProfile] = useState<UserProfile>({
    npub: '',
    reputation: 4.5,
    completed_deliveries: 0,
    verified_identity: false
  });

  // Connection State
  const [backendConnected, setBackendConnected] = useState(false);

  // Delivery State
  const [deliveryRequests, setDeliveryRequests] = useState<DeliveryRequest[]>([]);
  const [activeDelivery, setActiveDelivery] = useState<DeliveryRequest | null>(null);
  
  // UI State
  const [currentView, setCurrentView] = useState<'create' | 'browse' | 'active'>('create');
  const [showLogin, setShowLogin] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingDelivery, setEditingDelivery] = useState<DeliveryRequest | null>(null);
  const [darkMode, setDarkMode] = useState(false);

  // Login Form State
  const [nsecInput, setNsecInput] = useState('');
  const [loginMode, setLoginMode] = useState<'demo' | 'nsec'>('demo');

  // Form State
  const [formData, setFormData] = useState({
    pickupAddress: '',
    pickupInstructions: '',
    dropoffAddress: '',
    dropoffInstructions: '',
    packages: [{
      size: PackageSize.SMALL,
      description: '',
      fragile: false,
      requires_signature: false
    }] as PackageInfo[],
    offerAmount: '',
    insuranceAmount: '',
    timeWindow: 'asap',
    customDate: ''
  });

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    checkBackendConnection();
  }, []);

  useEffect(() => {
    if (isAuthenticated && backendConnected) {
      loadDeliveryRequests();
    }
  }, [isAuthenticated, userMode, backendConnected]);

  // ============================================================================
  // CONNECTION HANDLERS
  // ============================================================================

  const checkBackendConnection = async () => {
    try {
      const response = await fetch(`${API_URL}/health`);
      if (response.ok) {
        setBackendConnected(true);
        console.log('âœ… Backend connected');
      }
    } catch (error) {
      console.error('âŒ Backend connection failed:', error);
      setBackendConnected(false);
    }
  };

  // ============================================================================
  // AUTH HANDLERS
  // ============================================================================

  const handleDemoLogin = async () => {
    try {
      setLoading(true);
      const npub = `npub1demo${Math.random().toString(36).substring(7)}`;
      const profile = await api.getUser(npub);
      setUserProfile({ ...profile, npub });
      setAuthType('demo');
      setIsAuthenticated(true);
      setShowLogin(false);
      setError(null);
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleNsecLogin = async () => {
    try {
      setLoading(true);
      setError(null);

      // Validate nsec format
      if (!isValidNsec(nsecInput.trim())) {
        setError('Invalid nsec format. Please enter a valid Nostr private key.');
        setLoading(false);
        return;
      }

      // Convert nsec to npub
      const npub = await nsecToNpub(nsecInput.trim());
      
      // Get or create user profile
      const profile = await api.getUser(npub);
      setUserProfile({ ...profile, npub, verified_identity: true });
      setAuthType('nsec');
      setIsAuthenticated(true);
      setShowLogin(false);
      setNsecInput(''); // Clear the input for security
      
      console.log('âœ… Logged in with nsec, npub:', npub);
    } catch (err) {
      console.error('Nsec login error:', err);
      setError('Failed to login with nsec. Please check your private key.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setShowLogin(true);
    setAuthType('demo');
    setNsecInput('');
    setLoginMode('demo');
    setUserProfile({
      npub: '',
      reputation: 4.5,
      completed_deliveries: 0,
      verified_identity: false
    });
    setDeliveryRequests([]);
    setActiveDelivery(null);
    setError(null);
  };

  // ============================================================================
  // DELIVERY HANDLERS
  // ============================================================================

  const loadDeliveryRequests = async () => {
    try {
      setLoading(true);
      // Load all deliveries - we'll filter in the UI
      const requests = await api.getDeliveries();
      setDeliveryRequests(requests);
      
      // Find active delivery for courier - delivery they accepted
      const active = requests.find(r => 
        (r.status === 'accepted' || r.status === 'intransit' || r.status === 'completed') &&
        r.bids.some(b => b.courier === userProfile.npub && r.accepted_bid === b.id)
      );
      setActiveDelivery(active || null);
      setError(null);
    } catch (err) {
      setError('Failed to load deliveries');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const createDeliveryRequest = async () => {
    try {
      const { pickupAddress, dropoffAddress, packages, offerAmount, insuranceAmount, timeWindow, customDate } = formData;
      
      if (!pickupAddress || !dropoffAddress || !offerAmount) {
        setError('Please fill in all required fields');
        return;
      }

      setLoading(true);

      const deliveryData = {
        sender: userProfile.npub,
        pickup: {
          address: pickupAddress,
          instructions: formData.pickupInstructions || undefined
        },
        dropoff: {
          address: dropoffAddress,
          instructions: formData.dropoffInstructions || undefined
        },
        packages,
        offer_amount: parseInt(offerAmount),
        insurance_amount: insuranceAmount ? parseInt(insuranceAmount) : undefined,
        time_window: timeWindow === 'custom' ? customDate : timeWindow
      };

      await api.createDelivery(deliveryData);
      alert('âœ… Delivery request created!');
      resetForm();
      await loadDeliveryRequests();
      setCurrentView('active');
      setError(null);
    } catch (err) {
      setError('Failed to create request');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const placeBid = async (requestId: string, amount: number) => {
    try {
      setLoading(true);
      const result = await api.placeBid(requestId, {
        courier: userProfile.npub,
        amount,
        estimated_time: '1-2 hours',
        message: ''
      });
      alert('âœ… Bid placed successfully!');
      await loadDeliveryRequests();
      
      // Switch to Active Deliveries view to see the accepted delivery
      setCurrentView('active');
      setError(null);
    } catch (err) {
      setError('Failed to place bid');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const acceptBid = async (request: DeliveryRequest, bidIndex: number) => {
    try {
      setLoading(true);
      const result = await api.acceptBid(request.id, bidIndex);
      setActiveDelivery(result.delivery);
      alert('âœ… Bid accepted! Delivery in progress.');
      await loadDeliveryRequests();
      setCurrentView('active');
      setError(null);
    } catch (err) {
      setError('Failed to accept bid');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateDeliveryRequest = async () => {
    if (!editingDelivery) return;
    
    try {
      const { pickupAddress, dropoffAddress, packages, offerAmount, insuranceAmount, timeWindow, customDate } = formData;
      
      if (!pickupAddress || !dropoffAddress || !offerAmount) {
        setError('Please fill in all required fields');
        return;
      }

      setLoading(true);

      const deliveryData = {
        pickup: {
          address: pickupAddress,
          instructions: formData.pickupInstructions || undefined
        },
        dropoff: {
          address: dropoffAddress,
          instructions: formData.dropoffInstructions || undefined
        },
        packages,
        offer_amount: parseInt(offerAmount),
        insurance_amount: insuranceAmount ? parseInt(insuranceAmount) : undefined,
        time_window: timeWindow === 'custom' ? customDate : timeWindow
      };

      await api.updateDelivery(editingDelivery.id, deliveryData);
      alert('âœ… Delivery request updated!');
      setEditingDelivery(null);
      resetForm();
      await loadDeliveryRequests();
      setCurrentView('active');
      setError(null);
    } catch (err) {
      setError('Failed to update request');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const startEditingDelivery = (delivery: DeliveryRequest) => {
    setEditingDelivery(delivery);
    setFormData({
      pickupAddress: delivery.pickup.address,
      pickupInstructions: delivery.pickup.instructions || '',
      dropoffAddress: delivery.dropoff.address,
      dropoffInstructions: delivery.dropoff.instructions || '',
      packages: delivery.packages,
      offerAmount: delivery.offer_amount.toString(),
      insuranceAmount: delivery.insurance_amount?.toString() || '',
      timeWindow: delivery.time_window,
      customDate: ''
    });
    setCurrentView('create');
  };

  const cancelEditingDelivery = () => {
    setEditingDelivery(null);
    resetForm();
  };

  const deleteDeliveryRequest = async (deliveryId: string) => {
    if (!confirm('Are you sure you want to delete this delivery request?')) {
      return;
    }

    try {
      setLoading(true);
      await api.deleteDelivery(deliveryId);
      alert('âœ… Delivery request deleted!');
      await loadDeliveryRequests();
      setError(null);
    } catch (err) {
      setError('Failed to delete request');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const cancelDeliveryJob = async (deliveryId: string) => {
    if (!confirm('Are you sure you want to cancel this job? You will forfeit your sats to the courier.')) {
      return;
    }

    try {
      setLoading(true);
      await api.cancelDelivery(deliveryId);
      alert('âš ï¸ Job cancelled. Sats forfeited to courier.');
      await loadDeliveryRequests();
      setError(null);
    } catch (err) {
      setError('Failed to cancel job');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelivery = async () => {
    if (!activeDelivery) return;
    
    try {
      setLoading(true);
      await api.confirmDelivery(activeDelivery.id, 5);
      alert('âœ… Delivery confirmed! Payment released.');
      setActiveDelivery(null);
      await loadDeliveryRequests();
      setError(null);
    } catch (err) {
      setError('Failed to confirm delivery');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // FORM HANDLERS
  // ============================================================================

  const resetForm = () => {
    setFormData({
      pickupAddress: '',
      pickupInstructions: '',
      dropoffAddress: '',
      dropoffInstructions: '',
      packages: [{
        size: PackageSize.SMALL,
        description: '',
        fragile: false,
        requires_signature: false
      }],
      offerAmount: '',
      insuranceAmount: '',
      timeWindow: 'asap',
      customDate: ''
    });
  };

  const addPackage = () => {
    setFormData({
      ...formData,
      packages: [...formData.packages, {
        size: PackageSize.SMALL,
        description: '',
        fragile: false,
        requires_signature: false
      }]
    });
  };

  const updatePackage = (index: number, updates: Partial<PackageInfo>) => {
    const newPackages = [...formData.packages];
    newPackages[index] = { ...newPackages[index], ...updates };
    setFormData({ ...formData, packages: newPackages });
  };

  const removePackage = (index: number) => {
    if (formData.packages.length === 1) return;
    const newPackages = formData.packages.filter((_, i) => i !== index);
    setFormData({ ...formData, packages: newPackages });
  };

  // ============================================================================
  // RENDER: LOGIN SCREEN
  // ============================================================================

  if (showLogin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
          <div className="text-center mb-8">
            <Package className="w-16 h-16 text-orange-500 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Nostr Delivery</h1>
            <p className="text-gray-600">Decentralized peer-to-peer delivery network</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Login Mode Tabs */}
          <div className="flex gap-2 mb-6 border-b border-gray-200">
            <button
              onClick={() => setLoginMode('demo')}
              className={`flex-1 px-4 py-3 font-medium transition-colors ${
                loginMode === 'demo'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Demo Mode
            </button>
            <button
              onClick={() => setLoginMode('nsec')}
              className={`flex-1 px-4 py-3 font-medium transition-colors ${
                loginMode === 'nsec'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Nostr Login
            </button>
          </div>

          {/* Demo Login */}
          {loginMode === 'demo' && (
            <div className="space-y-4">
              <button
                onClick={handleDemoLogin}
                disabled={loading || !backendConnected}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>â³ Connecting...</>
                ) : (
                  <>
                    <TrendingUp className="w-5 h-5" />
                    Start Demo
                  </>
                )}
              </button>

              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>ðŸ'¡ Demo Mode:</strong> Test the application without real Nostr or Lightning integration.
                </p>
              </div>
            </div>
          )}

          {/* Nsec Login */}
          {loginMode === 'nsec' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nostr Private Key (nsec)
                </label>
                <input
                  type="password"
                  value={nsecInput}
                  onChange={(e) => setNsecInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !loading && backendConnected) {
                      handleNsecLogin();
                    }
                  }}
                  placeholder="nsec1..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent font-mono text-sm"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Enter your Nostr private key (nsec1...) to login
                </p>
              </div>

              <button
                onClick={handleNsecLogin}
                disabled={loading || !backendConnected || !nsecInput.trim()}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>â³ Logging in...</>
                ) : (
                  <>
                    <Key className="w-5 h-5" />
                    Login with Nostr
                  </>
                )}
              </button>

              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-900">
                  <strong>âš ï¸ Security:</strong> Your nsec is only used to derive your npub and is not stored. For maximum security, use a Nostr extension instead.
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-center gap-4 text-sm">
            <div className={`flex items-center gap-2 ${backendConnected ? 'text-green-600' : 'text-red-600'}`}>
              <div className={`w-2 h-2 rounded-full ${backendConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              Backend {backendConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>

          {!backendConnected && (
            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-900">
                <strong>âš ï¸ Backend not connected.</strong> Make sure the backend server is running on http://localhost:8080
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER: MAIN APP
  // ============================================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-orange-500" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Nostr Delivery</h1>
              <p className="text-xs text-gray-500">
                {authType === 'nsec' ? formatNpubForDisplay(userProfile.npub) : 'Demo Mode'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <select
              value={userMode}
              onChange={(e) => {
                setUserMode(e.target.value as UserMode);
                setCurrentView(e.target.value === UserMode.SENDER ? 'create' : 'browse');
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value={UserMode.SENDER}>I'm Sending</option>
              <option value={UserMode.COURIER}>I'm Delivering</option>
            </select>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Settings className="w-5 h-5 text-gray-600" />
            </button>

            <button
              onClick={handleLogout}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 py-2">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between">
            <span className="text-red-700 text-sm">{error}</span>
            <button onClick={() => setError(null)} className="text-red-700">âœ•</button>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold mb-6">Settings</h2>
            
            {/* Dark Mode Toggle */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Dark Mode</h3>
                  <p className="text-sm text-gray-600">Switch between light and dark theme</p>
                </div>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                    darkMode ? 'bg-orange-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                      darkMode ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Profile Section */}
            <h3 className="text-lg font-bold mb-4">Profile</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-orange-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Reputation</p>
                <p className="text-2xl font-bold text-orange-600">
                  {userProfile.reputation.toFixed(1)} ⭐
                </p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Completed</p>
                <p className="text-2xl font-bold text-green-600">
                  {userProfile.completed_deliveries}
                </p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">ID</p>
                <p className="text-xs font-mono text-blue-600 truncate">
                  {userProfile.npub}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex gap-2 border-b border-gray-200">
          {userMode === UserMode.SENDER && (
            <button
              onClick={() => setCurrentView('create')}
              className={`px-6 py-3 font-medium transition-colors ${
                currentView === 'create'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Create Request
            </button>
          )}
          {userMode === UserMode.COURIER && (
            <button
              onClick={() => setCurrentView('browse')}
              className={`px-6 py-3 font-medium transition-colors ${
                currentView === 'browse'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Browse Jobs
            </button>
          )}
          <button
            onClick={() => setCurrentView('active')}
            className={`px-6 py-3 font-medium transition-colors ${
              currentView === 'active'
                ? 'border-b-2 border-orange-500 text-orange-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {userMode === UserMode.SENDER ? 'My Requests' : 'Active Deliveries'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 pb-8">
        {/* CREATE REQUEST VIEW */}
        {currentView === 'create' && userMode === UserMode.SENDER && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-6">
              {editingDelivery ? 'Edit Delivery Request' : 'Create Delivery Request'}
            </h2>
            
            {editingDelivery && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                <span className="text-blue-700 text-sm">
                  <strong>Editing:</strong> You can modify this request until it's accepted by a courier.
                </span>
                <button
                  onClick={cancelEditingDelivery}
                  className="text-blue-700 hover:text-blue-900 text-sm font-medium"
                >
                  Cancel Edit
                </button>
              </div>
            )}
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Pickup Location *</label>
                <input
                  type="text"
                  value={formData.pickupAddress}
                  onChange={(e) => setFormData({ ...formData, pickupAddress: e.target.value })}
                  placeholder="123 Main St, City, State ZIP"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                <input
                  type="text"
                  value={formData.pickupInstructions}
                  onChange={(e) => setFormData({ ...formData, pickupInstructions: e.target.value })}
                  placeholder="Special instructions (optional)"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg mt-2 focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Dropoff Location *</label>
                <input
                  type="text"
                  value={formData.dropoffAddress}
                  onChange={(e) => setFormData({ ...formData, dropoffAddress: e.target.value })}
                  placeholder="456 Oak Ave, City, State ZIP"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                />
                <input
                  type="text"
                  value={formData.dropoffInstructions}
                  onChange={(e) => setFormData({ ...formData, dropoffInstructions: e.target.value })}
                  placeholder="Delivery instructions (optional)"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg mt-2 focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Packages</label>
                {formData.packages.map((pkg, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4 mb-3">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-gray-900">Package {index + 1}</span>
                      {formData.packages.length > 1 && (
                        <button onClick={() => removePackage(index)} className="text-red-600 hover:text-red-700 text-sm">
                          Remove
                        </button>
                      )}
                    </div>
                    <select
                      value={pkg.size}
                      onChange={(e) => updatePackage(index, { size: e.target.value as PackageSize })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2"
                    >
                      <option value={PackageSize.ENVELOPE}>Envelope (documents, up to 1 lb)</option>
                      <option value={PackageSize.SMALL}>Small (shoebox, 1-5 lbs)</option>
                      <option value={PackageSize.MEDIUM}>Medium (12x12x12", 5-20 lbs)</option>
                      <option value={PackageSize.LARGE}>Large (18x18x18", 20-50 lbs)</option>
                      <option value={PackageSize.EXTRA_LARGE}>Extra Large (moving box, 50+ lbs)</option>
                    </select>
                    <input
                      type="text"
                      value={pkg.description}
                      onChange={(e) => updatePackage(index, { description: e.target.value })}
                      placeholder="Description"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2"
                    />
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={pkg.fragile}
                          onChange={(e) => updatePackage(index, { fragile: e.target.checked })}
                          className="rounded"
                        />
                        Fragile
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={pkg.requires_signature}
                          onChange={(e) => updatePackage(index, { requires_signature: e.target.checked })}
                          className="rounded"
                        />
                        Signature Required
                      </label>
                    </div>
                  </div>
                ))}
                <button onClick={addPackage} className="text-orange-600 hover:text-orange-700 font-medium text-sm">
                  + Add Another Package
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Time Window</label>
                <select
                  value={formData.timeWindow}
                  onChange={(e) => setFormData({ ...formData, timeWindow: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                >
                  <option value="asap">ASAP (within 2 hours)</option>
                  <option value="today">Today (by end of day)</option>
                  <option value="tomorrow">Tomorrow</option>
                  <option value="custom">Custom Date</option>
                </select>
                {formData.timeWindow === 'custom' && (
                  <input
                    type="date"
                    value={formData.customDate}
                    onChange={(e) => setFormData({ ...formData, customDate: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg mt-2 focus:ring-2 focus:ring-orange-500"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Offer Amount (sats) *</label>
                <div className="relative">
                  <Bitcoin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-orange-500" />
                  <input
                    type="number"
                    value={formData.offerAmount}
                    onChange={(e) => setFormData({ ...formData, offerAmount: e.target.value })}
                    placeholder="25000"
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <button
                onClick={editingDelivery ? updateDeliveryRequest : createDeliveryRequest}
                disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-medium py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? 'â³ Creating...' : (
                  <>
                    <Package className="w-5 h-5" />
                    {editingDelivery ? 'Update Delivery Request' : 'Create Delivery Request'}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* BROWSE JOBS VIEW */}
        {currentView === 'browse' && userMode === UserMode.COURIER && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-4">Available Delivery Jobs</h2>
            {loading ? (
              <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                <p className="text-gray-500">â³ Loading deliveries...</p>
              </div>
            ) : deliveryRequests.filter(r => r.status === 'open').length === 0 ? (
              <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No delivery requests available.</p>
              </div>
            ) : (
              deliveryRequests.filter(r => r.status === 'open').map(request => (
                <div key={request.id} className="bg-white rounded-xl shadow-lg p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-5 h-5 text-orange-500" />
                        <span className="font-bold text-lg">{request.pickup.address}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <MapPin className="w-5 h-5" />
                        <span>{request.dropoff.address}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {request.time_window}
                        </span>
                        {request.distance_meters && (
                          <span>~{Math.round(request.distance_meters / 1609)} miles</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-orange-600">
                        {request.offer_amount.toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-500">sats</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {request.packages.map((pkg, idx) => (
                      <span key={idx} className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                        {pkg.size} {pkg.fragile && 'ðŸ”´'}
                      </span>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => placeBid(request.id, request.offer_amount)}
                      disabled={loading}
                      className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-medium py-3 rounded-lg transition-colors"
                    >
                      Accept {request.offer_amount.toLocaleString()} sats
                    </button>
                    <button
                      onClick={() => {
                        const counterOffer = prompt('Enter your counter-offer (sats):');
                        if (counterOffer) placeBid(request.id, parseInt(counterOffer));
                      }}
                      disabled={loading}
                      className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-medium py-3 rounded-lg transition-colors"
                    >
                      Counter Offer
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ACTIVE DELIVERIES VIEW */}
        {currentView === 'active' && (
          <div>
            <h2 className="text-2xl font-bold mb-4">
              {userMode === UserMode.SENDER ? 'My Requests' : 'Active Deliveries'}
            </h2>
            {loading ? (
              <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                <p className="text-gray-500">â³ Loading...</p>
              </div>
            ) : userMode === UserMode.SENDER ? (
              // Show sender's requests with bids
              deliveryRequests.filter(r => r.sender === userProfile.npub).length === 0 ? (
                <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                  <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No requests yet. Create one to get started!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {deliveryRequests.filter(r => r.sender === userProfile.npub).map(request => (
                    <div key={request.id} className="bg-white rounded-xl shadow-lg p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold">Delivery Request</h3>
                        <span className={`px-4 py-2 rounded-full font-medium text-sm ${
                          request.status === 'open' ? 'bg-blue-100 text-blue-700' :
                          request.status === 'accepted' ? 'bg-green-100 text-green-700' :
                          request.status === 'completed' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {request.status}
                        </span>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-sm text-gray-500">Pickup</p>
                          <p className="font-medium">{request.pickup.address}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Dropoff</p>
                          <p className="font-medium">{request.dropoff.address}</p>
                        </div>
                      </div>

                      {request.status === 'open' && (
                        <div className="flex gap-2 mb-4">
                          <button
                            onClick={() => startEditingDelivery(request)}
                            disabled={loading}
                            className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-medium py-2 rounded-lg transition-colors"
                          >
                            Edit Request
                          </button>
                          <button
                            onClick={() => deleteDeliveryRequest(request.id)}
                            disabled={loading}
                            className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-medium py-2 rounded-lg transition-colors"
                          >
                            Delete Request
                          </button>
                        </div>
                      )}

                      {request.status === 'accepted' && (
                        <button
                          onClick={() => cancelDeliveryJob(request.id)}
                          disabled={loading}
                          className="w-full mb-4 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-medium py-2 rounded-lg transition-colors"
                        >
                          Cancel Job and Forfeit Sats
                        </button>
                      )}

                      {request.bids.length > 0 && request.status === 'open' && (
                        <div className="mt-4">
                          <h4 className="font-bold mb-2">Bids ({request.bids.length})</h4>
                          <div className="space-y-2">
                            {request.bids.map((bid, idx) => (
                              <div key={bid.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div>
                                  <p className="font-medium">{bid.amount.toLocaleString()} sats</p>
                                  <p className="text-sm text-gray-500">
                                    {bid.reputation.toFixed(1)}â­ â€¢ {bid.completed_deliveries} deliveries
                                  </p>
                                </div>
                                <button
                                  onClick={() => acceptBid(request, idx)}
                                  disabled={loading}
                                  className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
                                >
                                  Accept
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {request.status === 'completed' && (
                        <button
                          onClick={confirmDelivery}
                          disabled={loading}
                          className="w-full mt-4 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2"
                        >
                          <CheckCircle className="w-5 h-5" />
                          Confirm Delivery & Release Payment
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : activeDelivery ? (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold">Active Delivery</h3>
                  <span className="px-4 py-2 bg-green-100 text-green-700 rounded-full font-medium">
                    {activeDelivery.status}
                  </span>
                </div>

                <div className="space-y-6">
                  {/* Pickup and Dropoff */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="p-4 bg-orange-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-2 font-semibold">Pickup Location</p>
                      <p className="font-medium mb-1">{activeDelivery.pickup.address}</p>
                      {activeDelivery.pickup.instructions && (
                        <p className="text-sm text-gray-600 mt-2">
                          <strong>Instructions:</strong> {activeDelivery.pickup.instructions}
                        </p>
                      )}
                    </div>
                    <div className="p-4 bg-purple-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-2 font-semibold">Dropoff Location</p>
                      <p className="font-medium mb-1">{activeDelivery.dropoff.address}</p>
                      {activeDelivery.dropoff.instructions && (
                        <p className="text-sm text-gray-600 mt-2">
                          <strong>Instructions:</strong> {activeDelivery.dropoff.instructions}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Package Details */}
                  <div className="border-t pt-4">
                    <h4 className="font-semibold mb-3">Package Details</h4>
                    <div className="space-y-2">
                      {activeDelivery.packages.map((pkg, idx) => (
                        <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <span className="font-medium capitalize">{pkg.size.replace('_', ' ')}</span>
                            <div className="flex gap-2">
                              {pkg.fragile && (
                                <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">Fragile</span>
                              )}
                              {pkg.requires_signature && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">Signature Required</span>
                              )}
                            </div>
                          </div>
                          {pkg.description && (
                            <p className="text-sm text-gray-600 mt-1">{pkg.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Delivery Info */}
                  <div className="grid md:grid-cols-3 gap-4 border-t pt-4">
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Payment</p>
                      <p className="text-2xl font-bold text-green-600">
                        {activeDelivery.offer_amount.toLocaleString()} sats
                      </p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Time Window</p>
                      <p className="font-medium capitalize">{activeDelivery.time_window}</p>
                    </div>
                    {activeDelivery.distance_meters && (
                      <div className="p-3 bg-yellow-50 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Distance</p>
                        <p className="font-medium">~{Math.round(activeDelivery.distance_meters / 1609)} miles</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No active deliveries. Browse available jobs to start earning!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}