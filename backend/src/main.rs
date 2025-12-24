// main.rs - Nostr-powered Delivery Backend
use actix_web::{web, App, HttpServer, HttpResponse, Error, middleware};
use actix_cors::Cors;
use serde::Deserialize;
use std::sync::Arc;
use chrono::Utc;
use nostr_sdk::prelude::*;
use std::time::Duration;

use nostr_delivery_backend::*;

// Application State with Nostr Client
pub struct AppState {
    pub nostr_client: Arc<Client>,
    pub system_keys: Keys,
}

impl AppState {
    async fn new(relay_urls: Vec<String>) -> Result<Self, Box<dyn std::error::Error>> {
        // Generate system keys for signing events
        let system_keys = Keys::generate();

        // Create Nostr client
        let client = Client::new(system_keys.clone());

        // Add relays
        for url in relay_urls {
            client.add_relay(&url).await?;
        }

        // Connect to relays
        client.connect().await;

        // Wait a bit for connections to establish
        tokio::time::sleep(Duration::from_secs(2)).await;

        println!("📡 Connected to {} relays", client.relays().await.len());
        println!("🔑 System pubkey: {}", system_keys.public_key().to_bech32()?);

        Ok(Self {
            nostr_client: Arc::new(client),
            system_keys,
        })
    }

    // Helper to publish delivery request event
    async fn publish_delivery(&self, delivery: &DeliveryRequest) -> Result<(), Box<dyn std::error::Error>> {
        let content = serde_json::to_string(delivery)?;

        let tags = vec![
            Tag::custom(TagKind::Custom("d".into()), vec![delivery.id.clone()]),
            Tag::custom(TagKind::Custom("sender".into()), vec![delivery.sender.clone()]),
            Tag::custom(TagKind::Custom("status".into()), vec![format!("{:?}", delivery.status).to_lowercase()]),
            Tag::custom(TagKind::Custom("amount".into()), vec![delivery.offer_amount.to_string()]),
            Tag::custom(TagKind::Custom("created_at".into()), vec![delivery.created_at.to_string()]),
        ];

        let event = EventBuilder::new(Kind::Custom(35000), content, tags).sign_with_keys(&self.system_keys)?;
        self.nostr_client.send_event(event).await?;

        Ok(())
    }

    // Helper to publish bid event
    async fn publish_bid(&self, delivery_id: &str, bid: &DeliveryBid) -> Result<(), Box<dyn std::error::Error>> {
        let content = serde_json::to_string(bid)?;

        let tags = vec![
            Tag::custom(TagKind::Custom("d".into()), vec![bid.id.clone()]),
            Tag::custom(TagKind::Custom("delivery_id".into()), vec![delivery_id.to_string()]),
            Tag::custom(TagKind::Custom("courier".into()), vec![bid.courier.clone()]),
            Tag::custom(TagKind::Custom("amount".into()), vec![bid.amount.to_string()]),
        ];

        let event = EventBuilder::new(Kind::Custom(35001), content, tags).sign_with_keys(&self.system_keys)?;
        self.nostr_client.send_event(event).await?;

        Ok(())
    }

    // Helper to publish status update event
    async fn publish_status_update(&self, delivery_id: &str, status: &DeliveryStatus, additional_data: Option<String>) -> Result<(), Box<dyn std::error::Error>> {
        let kind = match status {
            DeliveryStatus::Accepted => 35002,
            DeliveryStatus::InTransit => 35004,
            DeliveryStatus::Completed => 35005,
            DeliveryStatus::Confirmed => 35006,
            _ => 35000,
        };

        let content = additional_data.unwrap_or_else(|| format!("{{\"status\": \"{:?}\"}}", status));

        let tags = vec![
            Tag::custom(TagKind::Custom("delivery_id".into()), vec![delivery_id.to_string()]),
            Tag::custom(TagKind::Custom("status".into()), vec![format!("{:?}", status).to_lowercase()]),
            Tag::custom(TagKind::Custom("timestamp".into()), vec![Utc::now().timestamp().to_string()]),
        ];

        let event = EventBuilder::new(Kind::Custom(kind), content, tags).sign_with_keys(&self.system_keys)?;
        self.nostr_client.send_event(event).await?;

        Ok(())
    }

    // Helper to publish user profile event
    async fn publish_user_profile(&self, profile: &UserProfile) -> Result<(), Box<dyn std::error::Error>> {
        let content = serde_json::to_string(profile)?;

        let tags = vec![
            Tag::custom(TagKind::Custom("d".into()), vec![profile.npub.clone()]),
            Tag::custom(TagKind::Custom("reputation".into()), vec![profile.reputation.to_string()]),
            Tag::custom(TagKind::Custom("completed_deliveries".into()), vec![profile.completed_deliveries.to_string()]),
        ];

        let event = EventBuilder::new(Kind::Custom(35009), content, tags).sign_with_keys(&self.system_keys)?;
        self.nostr_client.send_event(event).await?;

        Ok(())
    }

    // Query all deliveries from Nostr
    async fn get_all_deliveries(&self) -> Result<Vec<DeliveryRequest>, Box<dyn std::error::Error>> {
        let filter = Filter::new()
            .kind(Kind::Custom(35000))
            .limit(1000);

        let events = self.nostr_client.fetch_events(vec![filter], Some(Duration::from_secs(5))).await?;

        let mut deliveries = Vec::new();

        for event in events {
            if let Ok(mut delivery) = serde_json::from_str::<DeliveryRequest>(&event.content) {
                // Fetch bids for this delivery
                let bids = self.get_bids_for_delivery(&delivery.id).await.unwrap_or_default();
                delivery.bids = bids;

                // Check for status updates
                if let Ok(updates) = self.get_status_updates(&delivery.id).await {
                    if let Some(latest) = updates.last() {
                        delivery.status = latest.status.clone();
                        if latest.proof_of_delivery.is_some() {
                            delivery.proof_of_delivery = latest.proof_of_delivery.clone();
                        }
                        if latest.completed_at.is_some() {
                            delivery.completed_at = latest.completed_at;
                        }
                        if latest.accepted_bid.is_some() {
                            delivery.accepted_bid = latest.accepted_bid.clone();
                        }
                        if latest.sender_rating.is_some() {
                            delivery.sender_rating = latest.sender_rating;
                        }
                        if latest.sender_feedback.is_some() {
                            delivery.sender_feedback = latest.sender_feedback.clone();
                        }
                    }
                }

                deliveries.push(delivery);
            }
        }

        Ok(deliveries)
    }

    // Query specific delivery by ID
    async fn get_delivery_by_id(&self, id: &str) -> Result<Option<DeliveryRequest>, Box<dyn std::error::Error>> {
        let filter = Filter::new()
            .kind(Kind::Custom(35000))
            .custom_tag(SingleLetterTag::lowercase(Alphabet::D), [id]);

        let events = self.nostr_client.fetch_events(vec![filter], Some(Duration::from_secs(5))).await?;

        if let Some(event) = events.first() {
            let mut delivery = serde_json::from_str::<DeliveryRequest>(&event.content)?;

            // Fetch bids
            delivery.bids = self.get_bids_for_delivery(&delivery.id).await.unwrap_or_default();

            // Check for status updates
            if let Ok(updates) = self.get_status_updates(&delivery.id).await {
                if let Some(latest) = updates.last() {
                    delivery.status = latest.status.clone();
                    if latest.proof_of_delivery.is_some() {
                        delivery.proof_of_delivery = latest.proof_of_delivery.clone();
                    }
                    if latest.completed_at.is_some() {
                        delivery.completed_at = latest.completed_at;
                    }
                    if latest.accepted_bid.is_some() {
                        delivery.accepted_bid = latest.accepted_bid.clone();
                    }
                    if latest.sender_rating.is_some() {
                        delivery.sender_rating = latest.sender_rating;
                    }
                    if latest.sender_feedback.is_some() {
                        delivery.sender_feedback = latest.sender_feedback.clone();
                    }
                }
            }

            Ok(Some(delivery))
        } else {
            Ok(None)
        }
    }

    // Get bids for a delivery
    async fn get_bids_for_delivery(&self, delivery_id: &str) -> Result<Vec<DeliveryBid>, Box<dyn std::error::Error>> {
        let filter = Filter::new()
            .kind(Kind::Custom(35001))
            .limit(1000);

        let events = self.nostr_client.fetch_events(vec![filter], Some(Duration::from_secs(5))).await?;

        let mut bids = Vec::new();
        for event in events {
            // Check if this bid is for our delivery_id
            let has_delivery_tag = event.tags.iter().any(|tag| {
                let tag_vec = tag.clone().to_vec();
                tag_vec.len() >= 2 && tag_vec[0] == "delivery_id" && tag_vec[1] == delivery_id
            });

            if has_delivery_tag {
                if let Ok(bid) = serde_json::from_str::<DeliveryBid>(&event.content) {
                    bids.push(bid);
                }
            }
        }

        bids.sort_by_key(|b| b.created_at);
        Ok(bids)
    }

    // Get status updates for a delivery
    async fn get_status_updates(&self, delivery_id: &str) -> Result<Vec<DeliveryUpdate>, Box<dyn std::error::Error>> {
        let filter = Filter::new()
            .kinds(vec![
                Kind::Custom(35002), // Accepted
                Kind::Custom(35003), // Started
                Kind::Custom(35004), // InTransit
                Kind::Custom(35005), // Completed
                Kind::Custom(35006), // Confirmed
            ])
            .limit(1000);

        let events = self.nostr_client.fetch_events(vec![filter], Some(Duration::from_secs(5))).await?;

        let mut updates = Vec::new();
        for event in events {
            let has_delivery_tag = event.tags.iter().any(|tag| {
                let tag_vec = tag.clone().to_vec();
                tag_vec.len() >= 2 && tag_vec[0] == "delivery_id" && tag_vec[1] == delivery_id
            });

            if has_delivery_tag {
                let status = match event.kind.as_u16() {
                    35002 => DeliveryStatus::Accepted,
                    35003 => DeliveryStatus::Open,
                    35004 => DeliveryStatus::InTransit,
                    35005 => DeliveryStatus::Completed,
                    35006 => DeliveryStatus::Confirmed,
                    _ => DeliveryStatus::Open,
                };

                let update: DeliveryUpdate = if let Ok(parsed) = serde_json::from_str(&event.content) {
                    parsed
                } else {
                    DeliveryUpdate {
                        status,
                        timestamp: event.created_at.as_u64() as i64,
                        proof_of_delivery: None,
                        completed_at: None,
                        accepted_bid: None,
                        sender_rating: None,
                        sender_feedback: None,
                    }
                };

                updates.push(update);
            }
        }

        updates.sort_by_key(|u| u.timestamp);
        Ok(updates)
    }

    // Get user profile
    async fn get_user_profile(&self, npub: &str) -> Result<UserProfile, Box<dyn std::error::Error>> {
        let filter = Filter::new()
            .kind(Kind::Custom(35009))
            .custom_tag(SingleLetterTag::lowercase(Alphabet::D), [npub]);

        let events = self.nostr_client.fetch_events(vec![filter], Some(Duration::from_secs(5))).await?;

        if let Some(event) = events.first() {
            let profile = serde_json::from_str::<UserProfile>(&event.content)?;
            Ok(profile)
        } else {
            // Return default profile
            Ok(UserProfile {
                npub: npub.to_string(),
                ..Default::default()
            })
        }
    }
}

// API Handlers
async fn health_check() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "backend": "nostr",
        "timestamp": Utc::now().timestamp(),
        "version": "2.0.0-nostr"
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
    let deliveries = data.get_all_deliveries().await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    let filtered: Vec<DeliveryRequest> = if let Some(status) = &query.status {
        deliveries.into_iter()
            .filter(|d| {
                let d_status = format!("{:?}", d.status).to_lowercase();
                d_status == status.to_lowercase()
            })
            .collect()
    } else {
        deliveries
    };

    Ok(HttpResponse::Ok().json(filtered))
}

async fn get_delivery(
    data: web::Data<AppState>,
    id: web::Path<String>,
) -> Result<HttpResponse, Error> {
    let delivery = data.get_delivery_by_id(&id).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    if let Some(delivery) = delivery {
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
    let id = format!("delivery_{}", Utc::now().timestamp_millis());

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
        expires_at: Some(Utc::now().timestamp() + 604800),
        status: DeliveryStatus::Open,
        bids: vec![],
        accepted_bid: None,
        created_at: Utc::now().timestamp(),
        distance_meters: distance,
        proof_of_delivery: None,
        sender_feedback: None,
        sender_rating: None,
        completed_at: None,
    };

    data.publish_delivery(&delivery).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

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
    // Verify delivery exists
    let delivery = data.get_delivery_by_id(&delivery_id).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    if delivery.is_none() {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Delivery not found"
        })));
    }

    // Get courier profile
    let courier_profile = data.get_user_profile(&req.courier).await
        .unwrap_or_default();

    let bid = DeliveryBid {
        id: format!("bid_{}", Utc::now().timestamp_millis()),
        courier: req.courier.clone(),
        amount: req.amount,
        estimated_time: req.estimated_time.clone(),
        reputation: courier_profile.reputation,
        completed_deliveries: courier_profile.completed_deliveries,
        message: req.message.clone(),
        created_at: Utc::now().timestamp(),
    };

    data.publish_bid(&delivery_id, &bid).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "bid_placed",
        "bid": bid
    })))
}

async fn accept_bid(
    data: web::Data<AppState>,
    path: web::Path<(String, usize)>,
) -> Result<HttpResponse, Error> {
    let (delivery_id, bid_index) = path.into_inner();

    let mut delivery = data.get_delivery_by_id(&delivery_id).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?
        .ok_or_else(|| actix_web::error::ErrorNotFound("Delivery not found"))?;

    if bid_index >= delivery.bids.len() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid bid index"
        })));
    }

    let bid = &delivery.bids[bid_index];
    delivery.accepted_bid = Some(bid.id.clone());
    delivery.status = DeliveryStatus::Accepted;
    delivery.offer_amount = bid.amount;

    // Publish updated delivery
    data.publish_delivery(&delivery).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    // Publish acceptance event
    let acceptance_data = serde_json::json!({
        "status": "Accepted",
        "accepted_bid": bid.id.clone(),
        "timestamp": Utc::now().timestamp()
    });

    data.publish_status_update(&delivery_id, &DeliveryStatus::Accepted, Some(acceptance_data.to_string())).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "accepted",
        "delivery": delivery
    })))
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
    let mut delivery = data.get_delivery_by_id(&delivery_id).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?
        .ok_or_else(|| actix_web::error::ErrorNotFound("Delivery not found"))?;

    let new_status = match req.status.to_lowercase().as_str() {
        "accepted" => DeliveryStatus::Accepted,
        "in_transit" | "intransit" => DeliveryStatus::InTransit,
        "completed" => DeliveryStatus::Completed,
        "confirmed" => DeliveryStatus::Confirmed,
        _ => delivery.status.clone(),
    };

    delivery.status = new_status.clone();

    // Publish updated delivery
    data.publish_delivery(&delivery).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    // Publish status update event
    data.publish_status_update(&delivery_id, &new_status, None).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "updated",
        "delivery": delivery
    })))
}

#[derive(Deserialize)]
struct ConfirmDeliveryRequest {
    rating: Option<f32>,
    feedback: Option<String>,
}

async fn confirm_delivery(
    data: web::Data<AppState>,
    delivery_id: web::Path<String>,
    req: web::Json<ConfirmDeliveryRequest>,
) -> Result<HttpResponse, Error> {
    let mut delivery = data.get_delivery_by_id(&delivery_id).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?
        .ok_or_else(|| actix_web::error::ErrorNotFound("Delivery not found"))?;

    delivery.status = DeliveryStatus::Confirmed;
    delivery.sender_feedback = req.feedback.clone();
    delivery.sender_rating = req.rating;

    // Update courier reputation
    if let Some(accepted_bid_id) = &delivery.accepted_bid {
        if let Some(bid) = delivery.bids.iter().find(|b| &b.id == accepted_bid_id) {
            let mut courier = data.get_user_profile(&bid.courier).await.unwrap_or_default();

            if let Some(rating) = req.rating {
                let new_rep = if courier.completed_deliveries == 0 {
                    rating
                } else {
                    ((courier.reputation * courier.completed_deliveries as f32) + rating) / (courier.completed_deliveries + 1) as f32
                };
                courier.reputation = new_rep;
            }

            courier.completed_deliveries += 1;
            courier.total_earnings += delivery.offer_amount;

            // Publish updated courier profile
            data.publish_user_profile(&courier).await
                .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;
        }
    }

    // Publish updated delivery
    data.publish_delivery(&delivery).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    // Publish confirmation event
    let confirmation_data = serde_json::json!({
        "status": "Confirmed",
        "sender_rating": req.rating,
        "sender_feedback": req.feedback,
        "timestamp": Utc::now().timestamp()
    });

    data.publish_status_update(&delivery_id, &DeliveryStatus::Confirmed, Some(confirmation_data.to_string())).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "confirmed",
        "delivery": delivery
    })))
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
    let mut delivery = data.get_delivery_by_id(&delivery_id).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?
        .ok_or_else(|| actix_web::error::ErrorNotFound("Delivery not found"))?;

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

    // Publish updated delivery
    data.publish_delivery(&delivery).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "updated",
        "delivery": delivery
    })))
}

async fn delete_delivery(
    data: web::Data<AppState>,
    delivery_id: web::Path<String>,
) -> Result<HttpResponse, Error> {
    let delivery = data.get_delivery_by_id(&delivery_id).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?
        .ok_or_else(|| actix_web::error::ErrorNotFound("Delivery not found"))?;

    if delivery.status != DeliveryStatus::Open {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Cannot delete delivery that is not open"
        })));
    }

    // Publish deletion event (mark as expired)
    let mut deleted_delivery = delivery.clone();
    deleted_delivery.status = DeliveryStatus::Expired;

    data.publish_delivery(&deleted_delivery).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "deleted",
        "id": delivery_id.as_str()
    })))
}

async fn cancel_delivery(
    data: web::Data<AppState>,
    delivery_id: web::Path<String>,
) -> Result<HttpResponse, Error> {
    let delivery = data.get_delivery_by_id(&delivery_id).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?
        .ok_or_else(|| actix_web::error::ErrorNotFound("Delivery not found"))?;

    if delivery.status != DeliveryStatus::Accepted && delivery.status != DeliveryStatus::InTransit {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Can only cancel accepted deliveries"
        })));
    }

    // Award sats to courier
    if let Some(accepted_bid_id) = &delivery.accepted_bid {
        if let Some(bid) = delivery.bids.iter().find(|b| &b.id == accepted_bid_id) {
            let mut courier = data.get_user_profile(&bid.courier).await.unwrap_or_default();
            courier.total_earnings += delivery.offer_amount;

            data.publish_user_profile(&courier).await
                .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;
        }
    }

    // Mark as expired
    let mut cancelled_delivery = delivery.clone();
    cancelled_delivery.status = DeliveryStatus::Expired;

    data.publish_delivery(&cancelled_delivery).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "cancelled",
        "message": "Delivery cancelled and sats forfeited to courier"
    })))
}

#[derive(Deserialize)]
struct CompleteDeliveryRequest {
    images: Vec<String>,
    signature_name: Option<String>,
    comments: Option<String>,
}

async fn complete_delivery(
    data: web::Data<AppState>,
    delivery_id: web::Path<String>,
    req: web::Json<CompleteDeliveryRequest>,
) -> Result<HttpResponse, Error> {
    let mut delivery = data.get_delivery_by_id(&delivery_id).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?
        .ok_or_else(|| actix_web::error::ErrorNotFound("Delivery not found"))?;

    if delivery.status != DeliveryStatus::Accepted && delivery.status != DeliveryStatus::InTransit {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Can only complete accepted or in-transit deliveries"
        })));
    }

    let signature_required = delivery.packages.iter().any(|pkg| pkg.requires_signature);
    if signature_required && req.signature_name.is_none() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Signature required for this delivery"
        })));
    }

    delivery.proof_of_delivery = Some(ProofOfDelivery {
        images: req.images.clone(),
        signature_name: req.signature_name.clone(),
        timestamp: Utc::now().timestamp(),
        location: None,
        comments: req.comments.clone(),
    });
    delivery.status = DeliveryStatus::Completed;
    delivery.completed_at = Some(Utc::now().timestamp());

    // Publish updated delivery
    data.publish_delivery(&delivery).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    // Publish completion event
    let completion_data = serde_json::json!({
        "status": "Completed",
        "proof_of_delivery": delivery.proof_of_delivery,
        "completed_at": delivery.completed_at,
        "timestamp": Utc::now().timestamp()
    });

    data.publish_status_update(&delivery_id, &DeliveryStatus::Completed, Some(completion_data.to_string())).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "completed",
        "delivery": delivery
    })))
}

async fn get_user(
    data: web::Data<AppState>,
    npub: web::Path<String>,
) -> Result<HttpResponse, Error> {
    let profile = data.get_user_profile(&npub).await
        .unwrap_or_else(|_| UserProfile {
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
    let mut profile = data.get_user_profile(&npub).await
        .unwrap_or_else(|_| UserProfile {
            npub: npub.to_string(),
            ..Default::default()
        });

    if let Some(name) = &req.display_name {
        profile.display_name = Some(name.clone());
    }
    if let Some(ln_addr) = &req.lightning_address {
        profile.lightning_address = Some(ln_addr.clone());
    }

    data.publish_user_profile(&profile).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    Ok(HttpResponse::Ok().json(profile))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    println!("🚀 Nostr Delivery Backend Starting...");
    println!("🔌 Backend Mode: Nostr-Powered (No Database)");

    // Get relay URLs from environment or use defaults
    let relay_urls = std::env::var("NOSTR_RELAYS")
        .unwrap_or_else(|_| "wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band".to_string())
        .split(',')
        .map(|s| s.trim().to_string())
        .collect::<Vec<String>>();

    println!("📡 Connecting to relays: {:?}", relay_urls);

    let app_state = web::Data::new(
        AppState::new(relay_urls).await
            .expect("Failed to initialize Nostr client")
    );

    println!("✅ Nostr client initialized");
    println!("🌐 Server ready on http://0.0.0.0:8080");

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
            .route("/api/deliveries/{id}/complete", web::post().to(complete_delivery))
            .route("/api/deliveries/{id}/confirm", web::post().to(confirm_delivery))
            .route("/api/user/{npub}", web::get().to(get_user))
            .route("/api/user/{npub}", web::patch().to(update_user))
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
