// main.rs - Complete Working Nostr Delivery Backend
use actix_web::{web, App, HttpServer, HttpResponse, Error, middleware};
use actix_cors::Cors;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use chrono::Utc;

mod lib;
use lib::*;

// Application State
pub struct AppState {
    pub deliveries: Arc<Mutex<HashMap<String, DeliveryRequest>>>,
    pub users: Arc<Mutex<HashMap<String, UserProfile>>>,
}

impl AppState {
    fn new() -> Self {
        let mut deliveries = HashMap::new();
        let mut users = HashMap::new();
        
        // Seed with demo data
        let demo_user = UserProfile {
            npub: "npub1demo...example".to_string(),
            display_name: Some("Demo User".to_string()),
            reputation: 4.5,
            completed_deliveries: 12,
            total_earnings: 250000,
            verified_identity: true,
            lightning_address: Some("demo@getalby.com".to_string()),
        };
        users.insert(demo_user.npub.clone(), demo_user);
        
        let demo_delivery = DeliveryRequest {
            id: "demo1".to_string(),
            sender: "npub1sender...demo".to_string(),
            pickup: Location {
                address: "123 Main St, Louisville, KY 40202".to_string(),
                coordinates: Some(GeoPoint { lat: 38.2527, lng: -85.7585 }),
                instructions: Some("Ring doorbell".to_string()),
            },
            dropoff: Location {
                address: "456 Oak Ave, Lexington, KY 40508".to_string(),
                coordinates: Some(GeoPoint { lat: 38.0406, lng: -84.5037 }),
                instructions: Some("Leave at front desk".to_string()),
            },
            packages: vec![PackageInfo {
                size: "medium".to_string(),
                weight: Some(5.0),
                description: "Box of books".to_string(),
                fragile: false,
                requires_signature: false,
            }],
            offer_amount: 25000,
            insurance_amount: Some(50000),
            time_window: "today".to_string(),
            expires_at: Some(Utc::now().timestamp() + 86400),
            status: DeliveryStatus::Open,
            bids: vec![],
            accepted_bid: None,
            created_at: Utc::now().timestamp(),
            distance_meters: Some(125000.0), // ~78 miles
        };
        deliveries.insert(demo_delivery.id.clone(), demo_delivery);
        
        Self {
            deliveries: Arc::new(Mutex::new(deliveries)),
            users: Arc::new(Mutex::new(users)),
        }
    }
}

// API Handlers
async fn health_check() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "timestamp": Utc::now().timestamp(),
        "version": "1.0.0"
    }))
}

#[derive(Deserialize)]
struct DeliveryQuery {
    status: Option<String>,
}

async fn get_deliveries(
    data: web::Data<AppState>,
    query: web::Query<DeliveryQuery>,
) -> Result<HttpResponse, Error> {
    let deliveries = data.deliveries.lock().unwrap();
    
    let filtered: Vec<DeliveryRequest> = if let Some(status) = &query.status {
        deliveries.values()
            .filter(|d| {
                let d_status = format!("{:?}", d.status).to_lowercase();
                d_status == status.to_lowercase()
            })
            .cloned()
            .collect()
    } else {
        deliveries.values().cloned().collect()
    };
    
    Ok(HttpResponse::Ok().json(filtered))
}

async fn get_delivery(
    data: web::Data<AppState>,
    id: web::Path<String>,
) -> Result<HttpResponse, Error> {
    let deliveries = data.deliveries.lock().unwrap();
    
    if let Some(delivery) = deliveries.get(id.as_str()) {
        Ok(HttpResponse::Ok().json(delivery))
    } else {
        Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Delivery not found"
        })))
    }
}

#[derive(Deserialize)]
struct CreateDeliveryRequest {
    pickup: Location,
    dropoff: Location,
    packages: Vec<PackageInfo>,
    offer_amount: u64,
    insurance_amount: Option<u64>,
    time_window: String,
    sender: String,
}

async fn create_delivery(
    data: web::Data<AppState>,
    req: web::Json<CreateDeliveryRequest>,
) -> Result<HttpResponse, Error> {
    let id = format!("delivery_{}", Utc::now().timestamp());
    
    // Calculate distance if coordinates available
    let distance = if let (Some(p1), Some(p2)) = (&req.pickup.coordinates, &req.dropoff.coordinates) {
        Some(calculate_distance(p1, p2))
    } else {
        None
    };
    
    let delivery = DeliveryRequest {
        id: id.clone(),
        sender: req.sender.clone(),
        pickup: req.pickup.clone(),
        dropoff: req.dropoff.clone(),
        packages: req.packages.clone(),
        offer_amount: req.offer_amount,
        insurance_amount: req.insurance_amount,
        time_window: req.time_window.clone(),
        expires_at: Some(Utc::now().timestamp() + 86400),
        status: DeliveryStatus::Open,
        bids: vec![],
        accepted_bid: None,
        created_at: Utc::now().timestamp(),
        distance_meters: distance,
    };
    
    data.deliveries.lock().unwrap().insert(id.clone(), delivery.clone());
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "id": id,
        "status": "created",
        "delivery": delivery
    })))
}

#[derive(Deserialize)]
struct PlaceBidRequest {
    courier: String,
    amount: u64,
    estimated_time: String,
    message: Option<String>,
}

async fn place_bid(
    data: web::Data<AppState>,
    delivery_id: web::Path<String>,
    req: web::Json<PlaceBidRequest>,
) -> Result<HttpResponse, Error> {
    let mut deliveries = data.deliveries.lock().unwrap();
    let users = data.users.lock().unwrap();
    
    if let Some(delivery) = deliveries.get_mut(delivery_id.as_str()) {
        let courier_profile = users.get(&req.courier)
            .cloned()
            .unwrap_or_default();
        
        let bid = DeliveryBid {
            id: format!("bid_{}", Utc::now().timestamp()),
            courier: req.courier.clone(),
            amount: req.amount,
            estimated_time: req.estimated_time.clone(),
            reputation: courier_profile.reputation,
            completed_deliveries: courier_profile.completed_deliveries,
            message: req.message.clone(),
            created_at: Utc::now().timestamp(),
        };
        
        delivery.bids.push(bid.clone());
        
        Ok(HttpResponse::Ok().json(serde_json::json!({
            "status": "bid_placed",
            "bid": bid
        })))
    } else {
        Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Delivery not found"
        })))
    }
}

async fn accept_bid(
    data: web::Data<AppState>,
    path: web::Path<(String, usize)>,
) -> Result<HttpResponse, Error> {
    let (delivery_id, bid_index) = path.into_inner();
    let mut deliveries = data.deliveries.lock().unwrap();
    
    if let Some(delivery) = deliveries.get_mut(&delivery_id) {
        if bid_index < delivery.bids.len() {
            let bid = &delivery.bids[bid_index];
            delivery.accepted_bid = Some(bid.id.clone());
            delivery.status = DeliveryStatus::Accepted;
            delivery.offer_amount = bid.amount;
            
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "status": "accepted",
                "delivery": delivery.clone()
            })))
        } else {
            Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid bid index"
            })))
        }
    } else {
        Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Delivery not found"
        })))
    }
}

#[derive(Deserialize)]
struct UpdateStatusRequest {
    status: String,
}

async fn update_delivery_status(
    data: web::Data<AppState>,
    delivery_id: web::Path<String>,
    req: web::Json<UpdateStatusRequest>,
) -> Result<HttpResponse, Error> {
    let mut deliveries = data.deliveries.lock().unwrap();
    
    if let Some(delivery) = deliveries.get_mut(delivery_id.as_str()) {
        delivery.status = match req.status.to_lowercase().as_str() {
            "accepted" => DeliveryStatus::Accepted,
            "in_transit" | "intransit" => DeliveryStatus::InTransit,
            "completed" => DeliveryStatus::Completed,
            "confirmed" => DeliveryStatus::Confirmed,
            _ => delivery.status.clone(),
        };
        
        Ok(HttpResponse::Ok().json(serde_json::json!({
            "status": "updated",
            "delivery": delivery.clone()
        })))
    } else {
        Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Delivery not found"
        })))
    }
}

#[derive(Deserialize)]
struct ConfirmDeliveryRequest {
    rating: Option<f32>,
}

async fn confirm_delivery(
    data: web::Data<AppState>,
    delivery_id: web::Path<String>,
    req: web::Json<ConfirmDeliveryRequest>,
) -> Result<HttpResponse, Error> {
    let mut deliveries = data.deliveries.lock().unwrap();
    let mut users = data.users.lock().unwrap();
    
    if let Some(delivery) = deliveries.get_mut(delivery_id.as_str()) {
        delivery.status = DeliveryStatus::Confirmed;
        
        // Update courier reputation
        if let Some(accepted_bid_id) = &delivery.accepted_bid {
            if let Some(bid) = delivery.bids.iter().find(|b| &b.id == accepted_bid_id) {
                if let Some(courier) = users.get_mut(&bid.courier) {
                    courier.completed_deliveries += 1;
                    courier.total_earnings += delivery.offer_amount;
                    
                    if let Some(rating) = req.rating {
                        courier.reputation = calculate_new_reputation(courier.reputation, rating);
                    }
                }
            }
        }
        
        Ok(HttpResponse::Ok().json(serde_json::json!({
            "status": "confirmed",
            "delivery": delivery.clone()
        })))
    } else {
        Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Delivery not found"
        })))
    }
}

#[derive(Deserialize)]
struct UpdateDeliveryRequest {
    pickup: Option<Location>,
    dropoff: Option<Location>,
    packages: Option<Vec<PackageInfo>>,
    offer_amount: Option<u64>,
    insurance_amount: Option<u64>,
    time_window: Option<String>,
}

async fn update_delivery(
    data: web::Data<AppState>,
    delivery_id: web::Path<String>,
    req: web::Json<UpdateDeliveryRequest>,
) -> Result<HttpResponse, Error> {
    let mut deliveries = data.deliveries.lock().unwrap();
    
    if let Some(delivery) = deliveries.get_mut(delivery_id.as_str()) {
        if delivery.status != DeliveryStatus::Open {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Cannot update delivery that is not open"
            })));
        }

        if let Some(pickup) = req.pickup.clone() {
            delivery.pickup = pickup;
        }
        if let Some(dropoff) = req.dropoff.clone() {
            delivery.dropoff = dropoff;
        }
        if let Some(packages) = req.packages.clone() {
            delivery.packages = packages;
        }
        if let Some(offer_amount) = req.offer_amount {
            delivery.offer_amount = offer_amount;
        }
        if let Some(insurance_amount) = req.insurance_amount {
            delivery.insurance_amount = Some(insurance_amount);
        }
        if let Some(time_window) = req.time_window.clone() {
            delivery.time_window = time_window;
        }

        if let (Some(p1), Some(p2)) = (&delivery.pickup.coordinates, &delivery.dropoff.coordinates) {
            delivery.distance_meters = Some(calculate_distance(p1, p2));
        }

        Ok(HttpResponse::Ok().json(serde_json::json!({
            "status": "updated",
            "delivery": delivery.clone()
        })))
    } else {
        Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Delivery not found"
        })))
    }
}

async fn delete_delivery(
    data: web::Data<AppState>,
    delivery_id: web::Path<String>,
) -> Result<HttpResponse, Error> {
    let mut deliveries = data.deliveries.lock().unwrap();
    
    if let Some(delivery) = deliveries.get(delivery_id.as_str()) {
        if delivery.status != DeliveryStatus::Open {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Cannot delete delivery that is not open"
            })));
        }

        deliveries.remove(delivery_id.as_str());
        
        Ok(HttpResponse::Ok().json(serde_json::json!({
            "status": "deleted",
            "id": delivery_id.as_str()
        })))
    } else {
        Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Delivery not found"
        })))
    }
}

async fn cancel_delivery(
    data: web::Data<AppState>,
    delivery_id: web::Path<String>,
) -> Result<HttpResponse, Error> {
    let mut deliveries = data.deliveries.lock().unwrap();
    let mut users = data.users.lock().unwrap();
    
    if let Some(delivery) = deliveries.get_mut(delivery_id.as_str()) {
        if delivery.status != DeliveryStatus::Accepted && delivery.status != DeliveryStatus::InTransit {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Can only cancel accepted deliveries"
            })));
        }

        if let Some(accepted_bid_id) = &delivery.accepted_bid {
            if let Some(bid) = delivery.bids.iter().find(|b| &b.id == accepted_bid_id) {
                if let Some(courier) = users.get_mut(&bid.courier) {
                    courier.total_earnings += delivery.offer_amount;
                }
            }
        }

        deliveries.remove(delivery_id.as_str());
        
        Ok(HttpResponse::Ok().json(serde_json::json!({
            "status": "cancelled",
            "message": "Delivery cancelled and sats forfeited to courier"
        })))
    } else {
        Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Delivery not found"
        })))
    }
}


async fn get_user(
    data: web::Data<AppState>,
    npub: web::Path<String>,
) -> Result<HttpResponse, Error> {
    let users = data.users.lock().unwrap();
    
    let profile = users.get(npub.as_str())
        .cloned()
        .unwrap_or_else(|| UserProfile {
            npub: npub.to_string(),
            ..Default::default()
        });
    
    Ok(HttpResponse::Ok().json(profile))
}

#[derive(Deserialize)]
struct UpdateUserRequest {
    display_name: Option<String>,
    lightning_address: Option<String>,
}

async fn update_user(
    data: web::Data<AppState>,
    npub: web::Path<String>,
    req: web::Json<UpdateUserRequest>,
) -> Result<HttpResponse, Error> {
    let mut users = data.users.lock().unwrap();
    
    let profile = users.entry(npub.to_string()).or_insert_with(|| UserProfile {
        npub: npub.to_string(),
        ..Default::default()
    });
    
    if let Some(name) = &req.display_name {
        profile.display_name = Some(name.clone());
    }
    if let Some(ln_addr) = &req.lightning_address {
        profile.lightning_address = Some(ln_addr.clone());
    }
    
    Ok(HttpResponse::Ok().json(profile.clone()))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));
    
    println!("ðŸš€ Nostr Delivery Backend Starting...");
    println!("ðŸ“ Server will run on http://0.0.0.0:8080");
    
    let app_state = web::Data::new(AppState::new());
    
    println!("âœ… Demo data loaded");
    println!("ðŸŒ Server ready!");
    
    HttpServer::new(move || {
        let cors = Cors::permissive();
        
        App::new()
            .app_data(app_state.clone())
            .wrap(cors)
            .wrap(middleware::Logger::default())
            .route("/health", web::get().to(health_check))
            .route("/api/deliveries", web::get().to(get_deliveries))
            .route("/api/deliveries", web::post().to(create_delivery))
            .route("/api/deliveries/{id}", web::get().to(get_delivery))
            .route("/api/deliveries/{id}", web::patch().to(update_delivery))
            .route("/api/deliveries/{id}", web::delete().to(delete_delivery))
            .route("/api/deliveries/{id}/bid", web::post().to(place_bid))
            .route("/api/deliveries/{id}/accept/{bid_idx}", web::post().to(accept_bid))
            .route("/api/deliveries/{id}/status", web::patch().to(update_delivery_status))
            .route("/api/deliveries/{id}/cancel", web::post().to(cancel_delivery))
            .route("/api/deliveries/{id}/confirm", web::post().to(confirm_delivery))
            .route("/api/user/{npub}", web::get().to(get_user))
            .route("/api/user/{npub}", web::patch().to(update_user))
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}