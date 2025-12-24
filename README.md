# Peer-to-Peer Delivery/Transport over Nostr

## Architecture

This application uses **Nostr as the backend database**. Instead of a traditional database (PostgreSQL, MongoDB, etc.), all data is stored as Nostr events on public relays:

- **Deliveries** → Kind 35000 events
- **Bids** → Kind 35001 events
- **Status Updates** → Kinds 35002-35006 events
- **User Profiles** → Kind 35009 events

The Rust backend acts as a Nostr client that publishes and queries events from configured relays. The REST API remains unchanged, providing seamless integration with the frontend.

## To run, use two terminal windows:
1. 1st terminal - navigate to backend folder
    - cargo run --release
2. 2nd terminal - navigate to frontend folder
    - npm install
    - npm run dev
3. Open the link
4. Login with nsec (nostrtool.com if you want a general one)

## Configuration

### Nostr Relays
The backend connects to Nostr relays specified in the `NOSTR_RELAYS` environment variable:

```bash
export NOSTR_RELAYS="wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band"
```

Default relays (if not specified):
- wss://relay.damus.io
- wss://nos.lol
- wss://relay.nostr.band

You can add more relays for improved redundancy and availability.

## TO DO ☐ ✔

☐ Enable NWC for Bitcoin (not fully working)

☐ Disable 10 second refresh (moves screen)

☐ Demo Mode should be a read-only view

☐ Even more compact "Completed Deliveries" view

☐ Add unique identifiers to deliveries

✔ Enable Reputation Score

✔ Enable "Deliveries Completed" increment in Settings menu

☐ Enable optional name/identifier in addition to npub

☐ Sending/Delivering address autocomplete?

☐ GPS coordinates option?

☐ Enable encrypted chat between sender/courier

☐ Add taxi wording/options for transporting persons

☐ Enable optional GPS tracking of courier

☐ Create Android application

☐ Enable automated routing for longer deliveries

☐ Enable "hubs" alongside automated routing

☐ Enable escrow mechanism

☐ Enable local timezones

☐ Add unique delivery identifiers (hash?)

