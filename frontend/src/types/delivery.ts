// frontend/src/types/delivery.ts

/**
 * Package size categories
 */
export enum PackageSize {
  ENVELOPE = 'envelope',
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
  EXTRA_LARGE = 'extra_large'
}

/**
 * Package information
 */
export interface PackageInfo {
  size: PackageSize;
  weight?: number; // in kg
  description: string;
  fragile: boolean;
  requires_signature: boolean;
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
  tracking_number?: string;
}

/**
 * Geographic location
 */
export interface Location {
  address: string;
  coordinates?: GeoCoordinates;
  instructions?: string;
  contact_name?: string;
  contact_phone?: string;
}

export interface GeoCoordinates {
  lat: number;
  lng: number;
  accuracy?: number; // in meters
}

/**
 * Delivery status enum
 */
export enum DeliveryStatus {
  OPEN = 'open',
  ACCEPTED = 'accepted',
  IN_TRANSIT = 'intransit',
  COMPLETED = 'completed',
  CONFIRMED = 'confirmed',
  DISPUTED = 'disputed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

/**
 * Delivery bid from courier
 */
export interface DeliveryBid {
  id: string;
  courier: string; // npub
  amount: number; // in sats
  estimated_time: string;
  reputation: number;
  completed_deliveries: number;
  message?: string;
  created_at: number;
  expires_at?: number;
}

/**
 * Complete delivery request
 */
export interface DeliveryRequest {
  id: string;
  sender: string; // npub
  pickup: Location;
  dropoff: Location;
  packages: PackageInfo[];
  offer_amount: number; // in sats
  insurance_amount?: number; // in sats
  time_window: TimeWindow | string;
  expires_at?: number;
  status: DeliveryStatus | string;
  bids: DeliveryBid[];
  accepted_bid?: string;
  courier?: string; // npub of accepted courier
  agreed_amount?: number; // final agreed price
  created_at: number;
  updated_at?: number;
  distance_meters?: number;
  estimated_duration?: number; // in minutes
  route?: RoutePoint[];
  escrow?: EscrowInfo;
  proof_of_delivery?: ProofOfDelivery;
}

/**
 * Time window options
 */
export enum TimeWindow {
  ASAP = 'asap',
  TODAY = 'today',
  TOMORROW = 'tomorrow',
  THIS_WEEK = 'this_week',
  CUSTOM = 'custom'
}

/**
 * Route tracking point
 */
export interface RoutePoint {
  coordinates: GeoCoordinates;
  timestamp: number;
  status: string;
  note?: string;
}

/**
 * Escrow information
 */
export interface EscrowInfo {
  invoice: string; // Lightning invoice
  payment_hash: string;
  amount: number; // in sats
  status: EscrowStatus;
  created_at: number;
  paid_at?: number;
  released_at?: number;
  refunded_at?: number;
}

export enum EscrowStatus {
  PENDING = 'pending',
  LOCKED = 'locked',
  RELEASED = 'released',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed'
}

/**
 * Proof of delivery
 */
export interface ProofOfDelivery {
  type: ProofType;
  data: string; // IPFS hash, photo URL, signature, etc.
  timestamp: number;
  location?: GeoCoordinates;
  signature?: string;
}

export enum ProofType {
  PHOTO = 'photo',
  GPS = 'gps',
  SIGNATURE = 'signature',
  RECIPIENT_CONFIRMATION = 'recipient_confirmation',
  QR_CODE = 'qr_code'
}

/**
 * User profile
 */
export interface UserProfile {
  npub: string;
  display_name?: string;
  avatar?: string;
  bio?: string;
  reputation: number;
  completed_deliveries: number;
  total_earnings?: number;
  total_spent?: number;
  verified_identity: boolean;
  lightning_address?: string;
  created_at?: number;
  last_active?: number;
  stats?: UserStats;
  badges?: Badge[];
}

/**
 * User statistics
 */
export interface UserStats {
  on_time_rate: number; // percentage
  acceptance_rate: number; // percentage
  response_time: number; // average in minutes
  avg_rating: number;
  total_distance_km: number;
  disputes: number;
  cancellations: number;
}

/**
 * User badge/achievement
 */
export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned_at: number;
}

/**
 * Delivery dispute
 */
export interface Dispute {
  id: string;
  delivery_id: string;
  raised_by: string; // npub
  against: string; // npub
  reason: DisputeReason;
  description: string;
  evidence: DisputeEvidence[];
  status: DisputeStatus;
  resolution?: DisputeResolution;
  created_at: number;
  resolved_at?: number;
}

export enum DisputeReason {
  NOT_DELIVERED = 'not_delivered',
  DAMAGED = 'damaged',
  LATE = 'late',
  WRONG_ADDRESS = 'wrong_address',
  PAYMENT_ISSUE = 'payment_issue',
  OTHER = 'other'
}

export interface DisputeEvidence {
  type: 'photo' | 'message' | 'gps' | 'screenshot' | 'other';
  content: string; // IPFS hash or data
  description?: string;
  timestamp: number;
}

export enum DisputeStatus {
  OPEN = 'open',
  UNDER_REVIEW = 'under_review',
  RESOLVED = 'resolved',
  ESCALATED = 'escalated'
}

export interface DisputeResolution {
  decision: 'sender' | 'courier' | 'split';
  payment_sender: number; // sats to sender
  payment_courier: number; // sats to courier
  reason: string;
  resolved_by?: string; // arbiter npub
}

/**
 * Delivery filters for searching
 */
export interface DeliveryFilters {
  status?: DeliveryStatus[];
  min_amount?: number;
  max_amount?: number;
  location?: {
    lat: number;
    lng: number;
    radius_km: number;
  };
  time_window?: TimeWindow[];
  package_sizes?: PackageSize[];
  sender?: string;
  courier?: string;
  created_after?: number;
  created_before?: number;
}

/**
 * Delivery search result
 */
export interface DeliverySearchResult {
  deliveries: DeliveryRequest[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

/**
 * Notification types
 */
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  delivery_id?: string;
  read: boolean;
  created_at: number;
  action_url?: string;
}

export enum NotificationType {
  NEW_BID = 'new_bid',
  BID_ACCEPTED = 'bid_accepted',
  DELIVERY_STARTED = 'delivery_started',
  DELIVERY_COMPLETED = 'delivery_completed',
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_RELEASED = 'payment_released',
  DISPUTE_OPENED = 'dispute_opened',
  REPUTATION_UPDATED = 'reputation_updated',
  SYSTEM = 'system'
}

/**
 * Price estimation parameters
 */
export interface PriceEstimation {
  base_price: number;
  distance_fee: number;
  package_fee: number;
  fragile_fee: number;
  signature_fee: number;
  insurance_fee: number;
  total: number;
}

/**
 * User mode (sender or courier)
 */
export enum UserMode {
  SENDER = 'sender',
  COURIER = 'courier'
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page: number;
  page_size: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}
