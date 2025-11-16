import React, { useState, useEffect } from 'react';
import { Package, MapPin, Clock, Shield, Bitcoin, CheckCircle, XCircle, AlertCircle, Settings, LogOut, User, TrendingUp, Key, ChevronDown, ChevronUp, Bell } from 'lucide-react';
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

interface ProofOfDelivery {
  images: string[];
  signature_name?: string;
  timestamp: number;
  location?: { lat: number; lng: number };
  comments?: string;
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
  proof_of_delivery?: ProofOfDelivery;
  sender_feedback?: string;
  sender_rating?: number;
  completed_at?: number;
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

  confirmDelivery: async (deliveryId: string, rating: number, feedback?: string): Promise<any> => {
    const response = await fetch(`${API_URL}/api/deliveries/${deliveryId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, feedback })
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
  const [currentView, setCurrentView] = useState<'create' | 'browse' | 'active' | 'confirmed' | 'completed'>('create');
  const [showLogin, setShowLogin] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingDelivery, setEditingDelivery] = useState<DeliveryRequest | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [hasViewedCompletedDeliveries, setHasViewedCompletedDeliveries] = useState(false);

  // Login Form State
  const [nsecInput, setNsecInput] = useState('');
  const [loginMode, setLoginMode] = useState<'demo' | 'nsec'>('demo');

  // Delivery Completion State
  const [proofImages, setProofImages] = useState<string[]>([]);
  const [signatureName, setSignatureName] = useState('');
  const [deliveryComments, setDeliveryComments] = useState('');
  const [showCompletionForm, setShowCompletionForm] = useState(false);
  const [senderFeedback, setSenderFeedback] = useState('');
  const [selectedRating, setSelectedRating] = useState(0);

  // Collapsible state
  const [collapsedDeliveries, setCollapsedDeliveries] = useState<Record<string, boolean>>({});

  // Bid/delivery seen tracking
  const [seenBids, setSeenBids] = useState<Record<string, boolean>>({}); // deliveryId -> seen
  const [seenActiveDeliveries, setSeenActiveDeliveries] = useState<Record<string, boolean>>({}); // deliveryId -> seen

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

  // Mark completed deliveries as viewed when courier views the completed tab
  useEffect(() => {
    if (currentView === 'completed' && userMode === UserMode.COURIER) {
      setHasViewedCompletedDeliveries(true);
    }
  }, [currentView, userMode]);

  // Reset viewed flag when courier has new confirmed deliveries
  useEffect(() => {
    if (userMode === UserMode.COURIER) {
      const confirmedCount = deliveryRequests.filter(
        r => r.status === 'confirmed' && r.bids.some(b => b.courier === userProfile.npub && r.accepted_bid === b.id)
      ).length;

      // Reset flag when there are new confirmed deliveries and user is not currently viewing them
      if (confirmedCount > 0 && currentView !== 'completed' && hasViewedCompletedDeliveries) {
        setHasViewedCompletedDeliveries(false);
      }
    }
  }, [deliveryRequests, userMode, userProfile.npub, currentView, hasViewedCompletedDeliveries]);

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

      // Refresh user profile to get updated stats (reputation and completed deliveries)
      if (userProfile.npub) {
        try {
          const updatedProfile = await api.getUser(userProfile.npub);
          setUserProfile({ ...updatedProfile, npub: userProfile.npub, verified_identity: userProfile.verified_identity });
        } catch (profileErr) {
          console.error('Failed to refresh user profile:', profileErr);
          // Don't set error state for profile refresh failures
        }
      }

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
      // Mark bid as seen when accepting
      setSeenBids(prev => ({ ...prev, [request.id]: true }));
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

  const confirmDelivery = async (delivery: DeliveryRequest) => {
    if (selectedRating === 0) {
      setError('Please select a rating before confirming');
      return;
    }

    try {
      setLoading(true);
      await api.confirmDelivery(delivery.id, selectedRating, senderFeedback.trim() || undefined);
      alert('âœ… Delivery confirmed! Payment released.');
      setSenderFeedback('');
      setSelectedRating(0);
      await loadDeliveryRequests();
      // Refresh user profile to get updated stats
      const updatedProfile = await api.getUser(userProfile.npub);
      setUserProfile({ ...updatedProfile, npub: userProfile.npub });
      setError(null);
    } catch (err) {
      setError('Failed to confirm delivery');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const markBidAsSeen = (deliveryId: string) => {
    setSeenBids(prev => ({ ...prev, [deliveryId]: true }));
  };

  const markActiveDeliveryAsSeen = (deliveryId: string) => {
    setSeenActiveDeliveries(prev => ({ ...prev, [deliveryId]: true }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProofImages(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const completeDelivery = async () => {
    if (!activeDelivery) return;

    const signatureRequired = activeDelivery.packages.some(pkg => pkg.requires_signature);
    if (signatureRequired && !signatureName.trim()) {
      setError('Signature name is required for this delivery');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/deliveries/${activeDelivery.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: proofImages,
          signature_name: signatureName.trim() || undefined,
          comments: deliveryComments.trim() || undefined
        })
      });

      if (!response.ok) throw new Error('Failed to complete delivery');

      alert('âœ… Delivery marked as completed! Awaiting sender confirmation.');
      setProofImages([]);
      setSignatureName('');
      setDeliveryComments('');
      setShowCompletionForm(false);
      await loadDeliveryRequests();
      setError(null);
    } catch (err) {
      setError('Failed to complete delivery');
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
      <div className={`min-h-screen ${darkMode ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' : 'bg-gradient-to-br from-orange-50 via-white to-purple-50'} flex items-center justify-center p-4`}>
        <div className={`${darkMode ? 'bg-gray-800 text-white' : 'bg-white'} rounded-2xl shadow-xl max-w-md w-full p-8`}>
          <div className="text-center mb-8">
            <Package className="w-16 h-16 text-orange-500 mx-auto mb-4" />
            <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} mb-2`}>Nostr Delivery</h1>
            <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>Decentralized peer-to-peer delivery network</p>
          </div>

          {error && (
            <div className={`mb-4 p-3 ${darkMode ? 'bg-red-900 border-red-700 text-red-200' : 'bg-red-50 border-red-200 text-red-700'} border rounded-lg text-sm`}>
              {error}
            </div>
          )}

          {/* Login Mode Tabs */}
          <div className={`flex gap-2 mb-6 border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
            <button
              onClick={() => setLoginMode('demo')}
              className={`flex-1 px-4 py-3 font-medium transition-colors ${
                loginMode === 'demo'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Demo Mode
            </button>
            <button
              onClick={() => setLoginMode('nsec')}
              className={`flex-1 px-4 py-3 font-medium transition-colors ${
                loginMode === 'nsec'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
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

              <div className={`mt-4 p-4 ${darkMode ? 'bg-blue-900 border-blue-700' : 'bg-blue-50 border-blue-200'} border rounded-lg`}>
                <p className={`text-sm ${darkMode ? 'text-blue-200' : 'text-blue-900'}`}>
                  <strong>ðŸ'¡ Demo Mode:</strong> Test the application without real Nostr or Lightning integration.
                </p>
              </div>
            </div>
          )}

          {/* Nsec Login */}
          {loginMode === 'nsec' && (
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
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
                  className={`w-full px-4 py-3 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white'} rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent font-mono text-sm`}
                />
                <p className={`mt-2 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
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

              <div className={`mt-4 p-4 ${darkMode ? 'bg-yellow-900 border-yellow-700' : 'bg-yellow-50 border-yellow-200'} border rounded-lg`}>
                <p className={`text-sm ${darkMode ? 'text-yellow-200' : 'text-yellow-900'}`}>
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
            <div className={`mt-6 p-4 ${darkMode ? 'bg-yellow-900 border-yellow-700' : 'bg-yellow-50 border-yellow-200'} border rounded-lg`}>
              <p className={`text-sm ${darkMode ? 'text-yellow-200' : 'text-yellow-900'}`}>
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
    <div className={`min-h-screen ${darkMode ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' : 'bg-gradient-to-br from-orange-50 via-white to-purple-50'}`}>
      {/* Header */}
      <header className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b sticky top-0 z-10`}>
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-orange-500" />
              <div>
                <h1 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Nostr Delivery</h1>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
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
              className={`px-3 py-2 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white'} rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500`}
            >
              <option value={UserMode.SENDER}>I'm Sending</option>
              <option value={UserMode.COURIER}>I'm Delivering</option>
            </select>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
            >
              <Settings className={`w-5 h-5 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`} />
            </button>

            <button
              onClick={handleLogout}
              className={`p-2 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
            >
              <LogOut className={`w-5 h-5 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`} />
            </button>
            </div>
          </div>

          {/* Notifications */}
          <div className="flex justify-center mt-2">
            {userMode === UserMode.SENDER && (
              <>
                {deliveryRequests.filter(r => r.sender === userProfile.npub && r.bids.length > 0 && r.status === 'open' && !seenBids[r.id]).length > 0 && (
                  <div className={`flex items-center gap-2 px-4 py-2 ${darkMode ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800'} rounded-full text-sm`}>
                    <Bell className="w-4 h-4" />
                    <span>{deliveryRequests.filter(r => r.sender === userProfile.npub && r.bids.length > 0 && r.status === 'open' && !seenBids[r.id]).length} new bid(s)</span>
                  </div>
                )}
                {deliveryRequests.filter(r => r.sender === userProfile.npub && r.status === 'completed').length > 0 && (
                  <div className={`flex items-center gap-2 px-4 py-2 ml-2 ${darkMode ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800'} rounded-full text-sm`}>
                    <Bell className="w-4 h-4" />
                    <span>{deliveryRequests.filter(r => r.sender === userProfile.npub && r.status === 'completed').length} delivery(ies) completed</span>
                  </div>
                )}
              </>
            )}
            {userMode === UserMode.COURIER && (
              <>
                {deliveryRequests.filter(r => r.bids.some(b => b.courier === userProfile.npub) && r.status === 'accepted' && r.bids.find(b => b.courier === userProfile.npub && r.accepted_bid === b.id) && !seenActiveDeliveries[r.id]).length > 0 && (
                  <div className={`flex items-center gap-2 px-4 py-2 ${darkMode ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800'} rounded-full text-sm`}>
                    <Bell className="w-4 h-4" />
                    <span>{deliveryRequests.filter(r => r.bids.some(b => b.courier === userProfile.npub) && r.status === 'accepted' && r.bids.find(b => b.courier === userProfile.npub && r.accepted_bid === b.id) && !seenActiveDeliveries[r.id]).length} bid(s) accepted</span>
                  </div>
                )}
                {!hasViewedCompletedDeliveries && deliveryRequests.filter(r => r.status === 'confirmed' && r.bids.some(b => b.courier === userProfile.npub && r.accepted_bid === b.id)).length > 0 && (
                  <div className={`flex items-center gap-2 px-4 py-2 ml-2 ${darkMode ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800'} rounded-full text-sm`}>
                    <Bell className="w-4 h-4" />
                    <span>Delivery Completed!</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 py-2">
          <div className={`${darkMode ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'} border rounded-lg p-3 flex items-center justify-between`}>
            <span className={`${darkMode ? 'text-red-200' : 'text-red-700'} text-sm`}>{error}</span>
            <button onClick={() => setError(null)} className={darkMode ? 'text-red-200' : 'text-red-700'}>âœ•</button>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className={`${darkMode ? 'bg-gray-800 text-white' : 'bg-white'} rounded-xl shadow-lg p-6`}>
            <h2 className={`text-xl font-bold mb-6 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Settings</h2>
            
            {/* Dark Mode Toggle */}
            <div className={`mb-6 p-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'} mb-1`}>Dark Mode</h3>
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Switch between light and dark theme</p>
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
            <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Profile</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`p-4 ${darkMode ? 'bg-orange-900' : 'bg-orange-50'} rounded-lg`}>
                <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'} mb-1`}>Reputation</p>
                <p className={`text-2xl font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                  {userProfile.completed_deliveries === 0 ? 'N/A' : `${userProfile.reputation.toFixed(1)} ⭐`}
                </p>
              </div>
              <div className={`p-4 ${darkMode ? 'bg-green-900' : 'bg-green-50'} rounded-lg`}>
                <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'} mb-1`}>Deliveries Completed</p>
                <p className={`text-2xl font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                  {userProfile.completed_deliveries}
                </p>
              </div>
              <div className={`p-4 ${darkMode ? 'bg-blue-900' : 'bg-blue-50'} rounded-lg`}>
                <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'} mb-1`}>ID</p>
                <p className={`text-xs font-mono ${darkMode ? 'text-blue-400' : 'text-blue-600'} truncate`}>
                  {userProfile.npub}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className={`flex gap-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          {userMode === UserMode.SENDER && (
            <button
              onClick={() => setCurrentView('create')}
              className={`px-6 py-3 font-medium transition-colors ${
                currentView === 'create'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
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
                  : darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
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
                : darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {userMode === UserMode.SENDER ? 'My Requests' : 'Active Deliveries'}
          </button>
          {userMode === UserMode.SENDER && (
            <button
              onClick={() => setCurrentView('confirmed')}
              className={`px-6 py-3 font-medium transition-colors ${
                currentView === 'confirmed'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Completed Deliveries
            </button>
          )}
          {userMode === UserMode.COURIER && (
            <button
              onClick={() => {
                setCurrentView('completed');
                setHasViewedCompletedDeliveries(true);
              }}
              className={`px-6 py-3 font-medium transition-colors ${
                currentView === 'completed'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Completed Deliveries
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 pb-8">
        {/* CREATE REQUEST VIEW */}
        {currentView === 'create' && userMode === UserMode.SENDER && (
          <div className={`${darkMode ? 'bg-gray-800 text-white' : 'bg-white'} rounded-xl shadow-lg p-6`}>
            <h2 className={`text-2xl font-bold mb-6 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {editingDelivery ? 'Edit Delivery Request' : 'Create Delivery Request'}
            </h2>
            
            {editingDelivery && (
              <div className={`mb-4 p-3 ${darkMode ? 'bg-blue-900 border-blue-700' : 'bg-blue-50 border-blue-200'} border rounded-lg flex items-center justify-between`}>
                <span className={`${darkMode ? 'text-blue-200' : 'text-blue-700'} text-sm`}>
                  <strong>Editing:</strong> You can modify this request until it's accepted by a courier.
                </span>
                <button
                  onClick={cancelEditingDelivery}
                  className={`${darkMode ? 'text-blue-200 hover:text-blue-100' : 'text-blue-700 hover:text-blue-900'} text-sm font-medium`}
                >
                  Cancel Edit
                </button>
              </div>
            )}
            
            <div className="space-y-6">
              <div>
                <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Pickup Location *</label>
                <input
                  type="text"
                  value={formData.pickupAddress}
                  onChange={(e) => setFormData({ ...formData, pickupAddress: e.target.value })}
                  placeholder="123 Main St, City, State ZIP"
                  className={`w-full px-4 py-3 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400' : 'border-gray-300 bg-white'} rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent`}
                />
                <input
                  type="text"
                  value={formData.pickupInstructions}
                  onChange={(e) => setFormData({ ...formData, pickupInstructions: e.target.value })}
                  placeholder="Special instructions (optional)"
                  className={`w-full px-4 py-3 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400' : 'border-gray-300 bg-white'} rounded-lg mt-2 focus:ring-2 focus:ring-orange-500`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Dropoff Location *</label>
                <input
                  type="text"
                  value={formData.dropoffAddress}
                  onChange={(e) => setFormData({ ...formData, dropoffAddress: e.target.value })}
                  placeholder="456 Oak Ave, City, State ZIP"
                  className={`w-full px-4 py-3 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400' : 'border-gray-300 bg-white'} rounded-lg focus:ring-2 focus:ring-orange-500`}
                />
                <input
                  type="text"
                  value={formData.dropoffInstructions}
                  onChange={(e) => setFormData({ ...formData, dropoffInstructions: e.target.value })}
                  placeholder="Delivery instructions (optional)"
                  className={`w-full px-4 py-3 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400' : 'border-gray-300 bg-white'} rounded-lg mt-2 focus:ring-2 focus:ring-orange-500`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Packages</label>
                {formData.packages.map((pkg, index) => (
                  <div key={index} className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-4 mb-3`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Package {index + 1}</span>
                      {formData.packages.length > 1 && (
                        <button onClick={() => removePackage(index)} className={`${darkMode ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'} text-sm`}>
                          Remove
                        </button>
                      )}
                    </div>
                    <select
                      value={pkg.size}
                      onChange={(e) => updatePackage(index, { size: e.target.value as PackageSize })}
                      className={`w-full px-3 py-2 border ${darkMode ? 'border-gray-600 bg-gray-600 text-white' : 'border-gray-300 bg-white'} rounded-lg mb-2`}
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
                      className={`w-full px-3 py-2 border ${darkMode ? 'border-gray-600 bg-gray-600 text-white placeholder-gray-400' : 'border-gray-300 bg-white'} rounded-lg mb-2`}
                    />
                    <div className="flex gap-4">
                      <label className={`flex items-center gap-2 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <input
                          type="checkbox"
                          checked={pkg.fragile}
                          onChange={(e) => updatePackage(index, { fragile: e.target.checked })}
                          className="rounded"
                        />
                        Fragile
                      </label>
                      <label className={`flex items-center gap-2 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
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
                <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Time Window</label>
                <select
                  value={formData.timeWindow}
                  onChange={(e) => setFormData({ ...formData, timeWindow: e.target.value })}
                  className={`w-full px-4 py-3 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white'} rounded-lg focus:ring-2 focus:ring-orange-500`}
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
                    className={`w-full px-4 py-3 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white'} rounded-lg mt-2 focus:ring-2 focus:ring-orange-500`}
                  />
                )}
              </div>

              <div>
                <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Offer Amount (sats) *</label>
                <div className="relative">
                  <Bitcoin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-orange-500" />
                  <input
                    type="number"
                    value={formData.offerAmount}
                    onChange={(e) => setFormData({ ...formData, offerAmount: e.target.value })}
                    placeholder="25000"
                    className={`w-full pl-12 pr-4 py-3 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400' : 'border-gray-300 bg-white'} rounded-lg focus:ring-2 focus:ring-orange-500`}
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
            <h2 className={`text-2xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Available Delivery Jobs</h2>
            {loading ? (
              <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg p-12 text-center`}>
                <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>â³ Loading deliveries...</p>
              </div>
            ) : deliveryRequests.filter(r => r.status === 'open').length === 0 ? (
              <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg p-12 text-center`}>
                <Package className={`w-16 h-16 ${darkMode ? 'text-gray-600' : 'text-gray-300'} mx-auto mb-4`} />
                <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>No delivery requests available.</p>
              </div>
            ) : (
              deliveryRequests.filter(r => r.status === 'open').map(request => (
                <div key={request.id} className={`${darkMode ? 'bg-gray-800 text-white' : 'bg-white'} rounded-xl shadow-lg p-6`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-5 h-5 text-orange-500" />
                        <span className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>{request.pickup.address}</span>
                      </div>
                      <div className={`flex items-center gap-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        <MapPin className="w-5 h-5" />
                        <span>{request.dropoff.address}</span>
                      </div>
                      <div className={`flex items-center gap-4 mt-3 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
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
                      <div className={`text-3xl font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                        {request.offer_amount.toLocaleString()}
                      </div>
                      <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>sats</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {request.packages.map((pkg, idx) => (
                      <span key={idx} className={`px-3 py-1 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-900'} rounded-full text-sm`}>
                        {pkg.size} {pkg.fragile && 'ðŸ"´'}
                      </span>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    {(() => {
                      const existingBid = request.bids.find(b => b.courier === userProfile.npub);
                      const hasBid = !!existingBid;

                      return (
                        <>
                          <button
                            onClick={() => !hasBid && placeBid(request.id, request.offer_amount)}
                            disabled={loading || hasBid}
                            className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors"
                          >
                            {hasBid
                              ? `Bid Sent for ${existingBid.amount.toLocaleString()} sats`
                              : `Accept ${request.offer_amount.toLocaleString()} sats`
                            }
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
                        </>
                      );
                    })()}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ACTIVE DELIVERIES VIEW */}
        {currentView === 'active' && (
          <div>
            <h2 className={`text-2xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}` }>
              {userMode === UserMode.SENDER ? 'My Requests' : 'Active Deliveries'}
            </h2>
            {loading ? (
              <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg p-12 text-center`}>
                <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>â³ Loading...</p>
              </div>
            ) : userMode === UserMode.SENDER ? (
              // Show sender's requests with bids (excluding only confirmed, keep completed for review)
              deliveryRequests.filter(r => r.sender === userProfile.npub && r.status !== 'confirmed').length === 0 ? (
                <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg p-12 text-center`}>
                  <AlertCircle className={`w-16 h-16 ${darkMode ? 'text-gray-600' : 'text-gray-300'} mx-auto mb-4`} />
                  <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>No requests yet. Create one to get started!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {deliveryRequests.filter(r => r.sender === userProfile.npub && r.status !== 'confirmed').map(request => (
                    <div key={request.id} className={`${darkMode ? 'bg-gray-800 text-white' : 'bg-white'} rounded-xl shadow-lg p-6`}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}` }>
                          Delivery Request
                          {request.bids.length > 0 && request.status === 'open' && !seenBids[request.id] && (
                            <span className="text-red-500 ml-1">*</span>
                          )}
                        </h3>
                        <div className="flex items-center gap-2">
                          {request.bids.length > 0 && request.status === 'open' && !seenBids[request.id] && (
                            <button
                              onClick={() => markBidAsSeen(request.id)}
                              className={`px-3 py-1 text-sm font-medium rounded-lg ${darkMode ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-100 hover:bg-blue-200 text-blue-700'}`}
                            >
                              Mark Bid as Seen
                            </button>
                          )}
                          <span className={`px-4 py-2 rounded-full font-medium text-sm ${
                            request.status === 'open' ? 'bg-blue-100 text-blue-700' :
                            request.status === 'accepted' ? 'bg-green-100 text-green-700' :
                            request.status === 'completed' ? 'bg-purple-100 text-purple-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {request.status}
                          </span>
                        </div>
                      </div>

                      {/* Auto-delete Warning */}
                      {request.status === 'open' && request.expires_at && (
                        (() => {
                          const now = Math.floor(Date.now() / 1000);
                          const timeLeft = request.expires_at - now;
                          const daysLeft = Math.floor(timeLeft / 86400);
                          const hoursLeft = Math.floor((timeLeft % 86400) / 3600);

                          if (timeLeft > 0 && timeLeft < 604800) {
                            return (
                              <div className={`mb-4 p-3 ${daysLeft < 2 ? (darkMode ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200') : (darkMode ? 'bg-yellow-900 border-yellow-700' : 'bg-yellow-50 border-yellow-200')} border rounded-lg`}>
                                <p className={`text-sm font-medium ${daysLeft < 2 ? (darkMode ? 'text-red-200' : 'text-red-700') : (darkMode ? 'text-yellow-200' : 'text-yellow-700')}`}>
                                  âš  Auto-delete in {daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''}` : `${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}`}
                                </p>
                                <p className={`text-xs mt-1 ${daysLeft < 2 ? (darkMode ? 'text-red-300' : 'text-red-600') : (darkMode ? 'text-yellow-300' : 'text-yellow-600')}`}>
                                  This delivery will be automatically deleted if not started. Save details if you need to resubmit.
                                </p>
                              </div>
                            );
                          }
                          return null;
                        })()
                      )}

                      <div className="grid md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Pickup</p>
                          <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{request.pickup.address}</p>
                        </div>
                        <div>
                          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Dropoff</p>
                          <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{request.dropoff.address}</p>
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
                        <div className={`mt-4 p-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg`}>
                          <h4 className={`font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Delivery Completed - Review & Confirm</h4>

                          {/* Show Proof of Delivery Images */}
                          {request.proof_of_delivery?.images && request.proof_of_delivery.images.length > 0 && (
                            <div className="mb-4">
                              <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                                Proof of Delivery Images
                              </label>
                              <div className="grid grid-cols-3 gap-2">
                                {request.proof_of_delivery.images.map((img, idx) => (
                                  <img
                                    key={idx}
                                    src={img}
                                    alt={`Proof ${idx + 1}`}
                                    className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-80"
                                    onClick={() => window.open(img, '_blank')}
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Show Signature Name if provided */}
                          {request.proof_of_delivery?.signature_name && (
                            <div className="mb-4">
                              <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                                Received By
                              </label>
                              <p className={`${darkMode ? 'text-white' : 'text-gray-900'} font-medium`}>
                                {request.proof_of_delivery.signature_name}
                              </p>
                            </div>
                          )}

                          {/* Star Rating */}
                          <div className="mb-4">
                            <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                              Rate the Courier
                            </label>
                            <div className="flex gap-2">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => setSelectedRating(star)}
                                  className={`text-3xl transition-all ${
                                    selectedRating >= star
                                      ? 'text-yellow-400 scale-110'
                                      : darkMode ? 'text-gray-600 hover:text-gray-500' : 'text-gray-300 hover:text-gray-400'
                                  }`}
                                >
                                  ★
                                </button>
                              ))}
                              {selectedRating > 0 && (
                                <span className={`ml-2 self-center ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                  {selectedRating} star{selectedRating !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Feedback Input */}
                          <div className="mb-4">
                            <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                              Feedback for Courier (Optional)
                            </label>
                            <textarea
                              value={senderFeedback}
                              onChange={(e) => setSenderFeedback(e.target.value)}
                              placeholder="Share your experience with this delivery..."
                              rows={3}
                              className={`w-full px-4 py-3 border ${darkMode ? 'border-gray-600 bg-gray-600 text-white placeholder-gray-400' : 'border-gray-300 bg-white'} rounded-lg focus:ring-2 focus:ring-orange-500`}
                            />
                          </div>

                          <button
                            onClick={() => confirmDelivery(request)}
                            disabled={loading}
                            className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2"
                          >
                            <CheckCircle className="w-5 h-5" />
                            Confirm Delivery & Release Payment
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : activeDelivery ? (
              <div className={`${darkMode ? 'bg-gray-800 text-white' : 'bg-white'} rounded-xl shadow-lg p-6`}>
                <div className="flex items-center justify-between mb-6">
                  <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Active Delivery
                    {activeDelivery.status === 'accepted' && !seenActiveDeliveries[activeDelivery.id] && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </h3>
                  <div className="flex items-center gap-2">
                    {activeDelivery.status === 'accepted' && !seenActiveDeliveries[activeDelivery.id] && (
                      <button
                        onClick={() => markActiveDeliveryAsSeen(activeDelivery.id)}
                        className={`px-3 py-1 text-sm font-medium rounded-lg ${darkMode ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-100 hover:bg-blue-200 text-blue-700'}`}
                      >
                        Mark Active Delivery as Seen
                      </button>
                    )}
                    <span className={`px-4 py-2 ${darkMode ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-700'} rounded-full font-medium`}>
                      {activeDelivery.status === 'completed' ? '(pending completion)' : activeDelivery.status === 'accepted' ? 'in progress' : activeDelivery.status}
                    </span>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Pickup and Dropoff */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className={`p-4 ${darkMode ? 'bg-orange-900' : 'bg-orange-50'} rounded-lg`}>
                      <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'} mb-2 font-semibold`}>Pickup Location</p>
                      <p className={`font-medium mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{activeDelivery.pickup.address}</p>
                      {activeDelivery.pickup.instructions && (
                        <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'} mt-2`}>
                          <strong>Instructions:</strong> {activeDelivery.pickup.instructions}
                        </p>
                      )}
                    </div>
                    <div className={`p-4 ${darkMode ? 'bg-purple-900' : 'bg-purple-50'} rounded-lg`}>
                      <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'} mb-2 font-semibold`}>Dropoff Location</p>
                      <p className={`font-medium mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{activeDelivery.dropoff.address}</p>
                      {activeDelivery.dropoff.instructions && (
                        <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'} mt-2`}>
                          <strong>Instructions:</strong> {activeDelivery.dropoff.instructions}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Package Details */}
                  <div className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} pt-4`}>
                    <h4 className={`font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Package Details</h4>
                    <div className="space-y-2">
                      {activeDelivery.packages.map((pkg, idx) => (
                        <div key={idx} className={`p-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg`}>
                          <div className="flex items-center justify-between">
                            <span className={`font-medium capitalize ${darkMode ? 'text-white' : 'text-gray-900'}`}>{pkg.size.replace('_', ' ')}</span>
                            <div className="flex gap-2">
                              {pkg.fragile && (
                                <span className={`px-2 py-1 ${darkMode ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-700'} text-xs rounded`}>Fragile</span>
                              )}
                              {pkg.requires_signature && (
                                <span className={`px-2 py-1 ${darkMode ? 'bg-blue-900 text-blue-300' : 'bg-blue-100 text-blue-700'} text-xs rounded`}>Signature Required</span>
                              )}
                            </div>
                          </div>
                          {pkg.description && (
                            <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'} mt-1`}>{pkg.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Delivery Info */}
                  <div className={`grid md:grid-cols-3 gap-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} pt-4`}>
                    <div className={`p-3 ${darkMode ? 'bg-green-900' : 'bg-green-50'} rounded-lg`}>
                      <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'} mb-1`}>Payment</p>
                      <p className={`text-2xl font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                        {activeDelivery.offer_amount.toLocaleString()} sats
                      </p>
                    </div>
                    <div className={`p-3 ${darkMode ? 'bg-blue-900' : 'bg-blue-50'} rounded-lg`}>
                      <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'} mb-1`}>Time Window</p>
                      <p className={`font-medium capitalize ${darkMode ? 'text-white' : 'text-gray-900'}`}>{activeDelivery.time_window}</p>
                    </div>
                    {activeDelivery.distance_meters && (
                      <div className={`p-3 ${darkMode ? 'bg-yellow-900' : 'bg-yellow-50'} rounded-lg`}>
                        <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'} mb-1`}>Distance</p>
                        <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>~{Math.round(activeDelivery.distance_meters / 1609)} miles</p>
                      </div>
                    )}
                  </div>

                  {/* Mark as Delivered Button */}
                  {(activeDelivery.status === 'accepted' || activeDelivery.status === 'intransit') && !showCompletionForm && (
                    <div className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} pt-4 mt-4`}>
                      <button
                        onClick={() => setShowCompletionForm(true)}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="w-5 h-5" />
                        Mark as Delivered
                      </button>
                    </div>
                  )}

                  {/* Delivery Completion Form */}
                  {showCompletionForm && (
                    <div className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} pt-4 mt-4 space-y-4`}>
                      <h4 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Proof of Delivery</h4>

                      {/* Image Upload */}
                      <div>
                        <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                          Upload Proof Images (Optional)
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleImageUpload}
                          className={`w-full px-4 py-3 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white'} rounded-lg focus:ring-2 focus:ring-orange-500`}
                        />
                        {proofImages.length > 0 && (
                          <p className={`mt-2 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {proofImages.length} image(s) selected
                          </p>
                        )}
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {proofImages.map((img, idx) => (
                            <div key={idx} className="relative">
                              <img src={img} alt={`Proof ${idx + 1}`} className="w-full h-24 object-cover rounded-lg" />
                              <button
                                onClick={() => setProofImages(prev => prev.filter((_, i) => i !== idx))}
                                className={`absolute top-1 right-1 ${darkMode ? 'bg-red-900 text-red-200' : 'bg-red-500 text-white'} rounded-full w-6 h-6 flex items-center justify-center text-xs`}
                              >
                                âœ•
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Signature Name (if required) */}
                      {activeDelivery.packages.some(pkg => pkg.requires_signature) && (
                        <div>
                          <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                            Recipient Signature Name *
                          </label>
                          <input
                            type="text"
                            value={signatureName}
                            onChange={(e) => setSignatureName(e.target.value)}
                            placeholder="Enter name of person who signed"
                            className={`w-full px-4 py-3 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400' : 'border-gray-300 bg-white'} rounded-lg focus:ring-2 focus:ring-orange-500`}
                          />
                        </div>
                      )}

                      {/* Delivery Comments */}
                      <div>
                        <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                          Comments (Optional)
                        </label>
                        <textarea
                          value={deliveryComments}
                          onChange={(e) => setDeliveryComments(e.target.value)}
                          placeholder="Add any notes or comments about the delivery..."
                          rows={3}
                          className={`w-full px-4 py-3 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400' : 'border-gray-300 bg-white'} rounded-lg focus:ring-2 focus:ring-orange-500`}
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setShowCompletionForm(false);
                            setProofImages([]);
                            setSignatureName('');
                            setDeliveryComments('');
                          }}
                          className={`flex-1 ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} ${darkMode ? 'text-white' : 'text-gray-900'} font-medium py-3 rounded-lg transition-colors`}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={completeDelivery}
                          disabled={loading}
                          className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          {loading ? 'Submitting...' : 'Submit Proof & Complete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className={`${darkMode ? 'bg-gray-800 text-white' : 'bg-white'} rounded-xl shadow-lg p-12 text-center`}>
                <AlertCircle className={`w-16 h-16 ${darkMode ? 'text-gray-600' : 'text-gray-300'} mx-auto mb-4`} />
                <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>No active deliveries. Browse available jobs to start earning!</p>
              </div>
            )}
          </div>
        )}

        {/* CONFIRMED DELIVERIES VIEW (SENDER) */}
        {currentView === 'confirmed' && userMode === UserMode.SENDER && (
          <div>
            <h2 className={`text-2xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Completed Deliveries</h2>
            {loading ? (
              <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg p-12 text-center`}>
                <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>â³ Loading...</p>
              </div>
            ) : deliveryRequests.filter(r => r.sender === userProfile.npub && r.status === 'confirmed').length === 0 ? (
              <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg p-12 text-center`}>
                <CheckCircle className={`w-16 h-16 ${darkMode ? 'text-gray-600' : 'text-gray-300'} mx-auto mb-4`} />
                <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>No completed deliveries yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {deliveryRequests.filter(r => r.sender === userProfile.npub && r.status === 'confirmed').map(delivery => {
                  const courierBid = delivery.bids.find(b => b.id === delivery.accepted_bid);
                  const isCollapsed = collapsedDeliveries[delivery.id] !== false;
                  const completedDate = delivery.completed_at ? new Date(delivery.completed_at * 1000) : null;

                  return (
                    <div key={delivery.id} className={`${darkMode ? 'bg-gray-800 text-white' : 'bg-white'} rounded-xl shadow-lg p-6`}>
                      <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={() => setCollapsedDeliveries(prev => ({ ...prev, [delivery.id]: !isCollapsed }))}>
                        <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Completed Delivery</h3>
                        <div className="flex items-center gap-2">
                          <span className={`px-4 py-2 ${darkMode ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-700'} rounded-full font-medium text-sm`}>
                            ✅ Completed
                          </span>
                          {isCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                        </div>
                      </div>

                      {/* Collapsed Summary View */}
                      {isCollapsed ? (
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Pickup</p>
                            <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{delivery.pickup.address}</p>
                          </div>
                          <div>
                            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Dropoff</p>
                            <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{delivery.dropoff.address}</p>
                          </div>
                          {completedDate && (
                            <>
                              <div>
                                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Date Completed</p>
                                <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{completedDate.toLocaleDateString()}</p>
                              </div>
                              <div>
                                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Time Completed</p>
                                <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{completedDate.toLocaleTimeString()}</p>
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <>
                          {/* Delivery Details */}
                          <div className="grid md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Pickup</p>
                              <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{delivery.pickup.address}</p>
                            </div>
                            <div>
                              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Dropoff</p>
                              <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{delivery.dropoff.address}</p>
                            </div>
                            {completedDate && (
                              <>
                                <div>
                                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Date Completed</p>
                                  <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{completedDate.toLocaleDateString()}</p>
                                </div>
                                <div>
                                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Time Completed</p>
                                  <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{completedDate.toLocaleTimeString()}</p>
                                </div>
                              </>
                            )}
                          </div>

                      {/* Package Info */}
                      <div className="mb-4">
                        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-2`}>Packages</p>
                        <div className="flex flex-wrap gap-2">
                          {delivery.packages.map((pkg, idx) => (
                            <span key={idx} className={`px-3 py-1 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-900'} rounded-full text-sm`}>
                              {pkg.size} - {pkg.description || 'No description'}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Courier Info */}
                      {courierBid && (
                        <div className={`mb-4 p-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg`}>
                          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Delivered By</p>
                          <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{courierBid.courier}</p>
                          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {courierBid.reputation.toFixed(1)}⭐ • {courierBid.completed_deliveries} deliveries
                          </p>
                        </div>
                      )}

                      {/* Proof of Delivery */}
                      {delivery.proof_of_delivery && (
                        <div className={`mb-4 p-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg`}>
                          <h4 className={`font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Proof of Delivery</h4>
                          {delivery.proof_of_delivery.signature_name && (
                            <p className={`text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              <strong>Received by:</strong> {delivery.proof_of_delivery.signature_name}
                            </p>
                          )}
                          {delivery.proof_of_delivery.comments && (
                            <p className={`text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              <strong>Comments:</strong> {delivery.proof_of_delivery.comments}
                            </p>
                          )}
                          {delivery.proof_of_delivery.images.length > 0 && (
                            <div className="grid grid-cols-4 gap-2 mt-2">
                              {delivery.proof_of_delivery.images.map((img, idx) => (
                                <img
                                  key={idx}
                                  src={img}
                                  alt={`Proof ${idx + 1}`}
                                  className="w-full h-24 object-cover rounded-lg cursor-pointer hover:opacity-80"
                                  onClick={() => window.open(img, '_blank')}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Sender Feedback */}
                      {delivery.sender_feedback && (
                        <div className={`mb-4 p-3 ${darkMode ? 'bg-blue-900' : 'bg-blue-50'} rounded-lg`}>
                          <h4 className={`font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Your Feedback</h4>
                          <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {delivery.sender_feedback}
                          </p>
                        </div>
                      )}

                          {/* Payment Info */}
                          <div className={`p-3 ${darkMode ? 'bg-green-900' : 'bg-green-50'} rounded-lg`}>
                            <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'} mb-1`}>Payment Released</p>
                            <p className={`text-2xl font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                              {delivery.offer_amount.toLocaleString()} sats
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* COMPLETED DELIVERIES VIEW (COURIER) */}
        {currentView === 'completed' && userMode === UserMode.COURIER && (
          <div>
            <h2 className={`text-2xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Completed Deliveries</h2>
            {loading ? (
              <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg p-12 text-center`}>
                <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>â³ Loading...</p>
              </div>
            ) : deliveryRequests.filter(r => r.status === 'confirmed' && r.bids.some(b => b.courier === userProfile.npub && r.accepted_bid === b.id)).length === 0 ? (
              <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg p-12 text-center`}>
                <CheckCircle className={`w-16 h-16 ${darkMode ? 'text-gray-600' : 'text-gray-300'} mx-auto mb-4`} />
                <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>No completed deliveries yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {deliveryRequests.filter(r => r.status === 'confirmed' && r.bids.some(b => b.courier === userProfile.npub && r.accepted_bid === b.id)).map(delivery => {
                  const isCollapsed = collapsedDeliveries[delivery.id] !== false;
                  const completedDate = delivery.completed_at ? new Date(delivery.completed_at * 1000) : null;

                  return (
                    <div key={delivery.id} className={`${darkMode ? 'bg-gray-800 text-white' : 'bg-white'} rounded-xl shadow-lg p-6`}>
                      <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={() => setCollapsedDeliveries(prev => ({ ...prev, [delivery.id]: !isCollapsed }))}>
                        <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Completed Delivery</h3>
                        <div className="flex items-center gap-2">
                          <span className={`px-4 py-2 ${darkMode ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-700'} rounded-full font-medium text-sm`}>
                            ✅ Completed
                          </span>
                          {isCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                        </div>
                      </div>

                      {/* Collapsed Summary View */}
                      {isCollapsed ? (
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Pickup</p>
                            <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{delivery.pickup.address}</p>
                          </div>
                          <div>
                            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Dropoff</p>
                            <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{delivery.dropoff.address}</p>
                          </div>
                          {completedDate && (
                            <>
                              <div>
                                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Date Completed</p>
                                <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{completedDate.toLocaleDateString()}</p>
                              </div>
                              <div>
                                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Time Completed</p>
                                <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{completedDate.toLocaleTimeString()}</p>
                              </div>
                            </>
                          )}
                          {delivery.sender_rating && (
                            <div>
                              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Your Rating</p>
                              <p className={`font-medium text-yellow-500 text-lg`}>{'⭐'.repeat(Math.round(delivery.sender_rating))} ({delivery.sender_rating.toFixed(1)})</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          {/* Delivery Details */}
                          <div className="grid md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Pickup</p>
                              <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{delivery.pickup.address}</p>
                            </div>
                            <div>
                              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Dropoff</p>
                              <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{delivery.dropoff.address}</p>
                            </div>
                            {completedDate && (
                              <>
                                <div>
                                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Date Completed</p>
                                  <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{completedDate.toLocaleDateString()}</p>
                                </div>
                                <div>
                                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Time Completed</p>
                                  <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{completedDate.toLocaleTimeString()}</p>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Star Rating */}
                          {delivery.sender_rating && (
                            <div className={`mb-4 p-3 ${darkMode ? 'bg-yellow-900' : 'bg-yellow-50'} rounded-lg`}>
                              <h4 className={`font-semibold mb-2 ${darkMode ? 'text-yellow-300' : 'text-yellow-900'}`}>Your Rating</h4>
                              <p className="text-yellow-500 text-2xl">{'⭐'.repeat(Math.round(delivery.sender_rating))} <span className={`text-lg ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>({delivery.sender_rating.toFixed(1)} stars)</span></p>
                            </div>
                          )}

                    {/* Package Info */}
                    <div className="mb-4">
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-2`}>Packages</p>
                      <div className="flex flex-wrap gap-2">
                        {delivery.packages.map((pkg, idx) => (
                          <span key={idx} className={`px-3 py-1 ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-900'} rounded-full text-sm`}>
                            {pkg.size} - {pkg.description || 'No description'}
                          </span>
                        ))}
                      </div>
                    </div>

                          {/* Proof of Delivery */}
                          {delivery.proof_of_delivery && (
                            <div className={`mb-4 p-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg`}>
                              <h4 className={`font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Your Proof of Delivery</h4>
                              {delivery.proof_of_delivery.signature_name && (
                                <p className={`text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                  <strong>Received by:</strong> {delivery.proof_of_delivery.signature_name}
                                </p>
                              )}
                              {delivery.proof_of_delivery.comments && (
                                <p className={`text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                  <strong>Comments:</strong> {delivery.proof_of_delivery.comments}
                                </p>
                              )}
                              {delivery.proof_of_delivery.images.length > 0 && (
                                <div className="grid grid-cols-4 gap-2 mt-2">
                                  {delivery.proof_of_delivery.images.map((img, idx) => (
                                    <img
                                      key={idx}
                                      src={img}
                                      alt={`Proof ${idx + 1}`}
                                      className="w-full h-24 object-cover rounded-lg cursor-pointer hover:opacity-80"
                                      onClick={() => window.open(img, '_blank')}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Sender Feedback */}
                          {delivery.sender_feedback && (
                            <div className={`mb-4 p-3 ${darkMode ? 'bg-blue-900' : 'bg-blue-50'} rounded-lg`}>
                              <h4 className={`font-semibold mb-2 ${darkMode ? 'text-blue-300' : 'text-blue-900'}`}>Sender Feedback</h4>
                              <p className={`text-sm ${darkMode ? 'text-blue-200' : 'text-blue-800'}`}>{delivery.sender_feedback}</p>
                            </div>
                          )}

                          {/* Earnings Info */}
                          <div className={`p-3 ${darkMode ? 'bg-green-900' : 'bg-green-50'} rounded-lg`}>
                            <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'} mb-1`}>Earnings</p>
                            <p className={`text-2xl font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                              {delivery.offer_amount.toLocaleString()} sats
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
