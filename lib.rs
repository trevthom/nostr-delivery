// lib.rs - Shared types and utilities
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DeliveryStatus {
    Open,
    Accepted,
    InTransit,
    Completed,
    Confirmed,
    Disputed,
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Location {
    pub address: String,
    pub coordinates: Option<GeoPoint>,
    pub instructions: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeoPoint {
    pub lat: f64,
    pub lng: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageInfo {
    pub size: String,
    pub weight: Option<f32>,
    pub description: String,
    pub fragile: bool,
    pub requires_signature: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeliveryRequest {
    pub id: String,
    pub sender: String,
    pub pickup: Location,
    pub dropoff: Location,
    pub packages: Vec<PackageInfo>,
    pub offer_amount: u64,
    pub insurance_amount: Option<u64>,
    pub time_window: String,
    pub expires_at: Option<i64>,
    pub status: DeliveryStatus,
    pub bids: Vec<DeliveryBid>,
    pub accepted_bid: Option<String>,
    pub created_at: i64,
    pub distance_meters: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeliveryBid {
    pub id: String,
    pub courier: String,
    pub amount: u64,
    pub estimated_time: String,
    pub reputation: f32,
    pub completed_deliveries: u32,
    pub message: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub npub: String,
    pub display_name: Option<String>,
    pub reputation: f32,
    pub completed_deliveries: u32,
    pub total_earnings: u64,
    pub verified_identity: bool,
    pub lightning_address: Option<String>,
}

impl Default for UserProfile {
    fn default() -> Self {
        Self {
            npub: String::new(),
            display_name: None,
            reputation: 4.5,
            completed_deliveries: 0,
            total_earnings: 0,
            verified_identity: false,
            lightning_address: None,
        }
    }
}

// Geographic distance calculation
pub fn calculate_distance(p1: &GeoPoint, p2: &GeoPoint) -> f64 {
    let r = 6371000.0; // Earth radius in meters
    let lat1 = p1.lat.to_radians();
    let lat2 = p2.lat.to_radians();
    let delta_lat = (p2.lat - p1.lat).to_radians();
    let delta_lng = (p2.lng - p1.lng).to_radians();

    let a = (delta_lat / 2.0).sin().powi(2)
        + lat1.cos() * lat2.cos() * (delta_lng / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());

    r * c
}

// Reputation calculation
pub fn calculate_new_reputation(old_rep: f32, rating: f32) -> f32 {
    // Asymptotic approach to perfect rating
    let decay = 0.9;
    let target = 5.0;
    target - (target - old_rep) * decay + (rating - old_rep) * (1.0 - decay)
}

// In-memory storage
pub type Storage = HashMap<String, DeliveryRequest>;
pub type UserStorage = HashMap<String, UserProfile>;