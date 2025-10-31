# 🚀 Nostr Delivery - Complete Setup Instructions

Follow these steps EXACTLY to get the system running on your computer.

---

## ✅ Prerequisites

You need to install these programs on your computer first:

### 1. Install Docker Desktop
- **Windows/Mac**: Download from https://www.docker.com/products/docker-desktop
- **Linux**: Follow instructions at https://docs.docker.com/engine/install/

After installing, open Docker Desktop and make sure it's running (you'll see the Docker icon in your system tray).

---

## 📁 Step 1: Create Project Structure

Create these folders and files on your computer:

```
nostr-delivery/
├── backend/
│   ├── src/
│   │   ├── main.rs
│   │   └── lib.rs
│   ├── Cargo.toml
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── Dockerfile
└── docker-compose.yml
```

---

## 📝 Step 2: Copy All Files

Copy each file content from the artifacts I created into the correct location:

### Backend Files:

1. **backend/src/main.rs** - The main Rust server code
2. **backend/src/lib.rs** - Shared library code
3. **backend/Cargo.toml** - Rust dependencies
4. **backend/Dockerfile** - Backend container config

### Frontend Files:

5. **frontend/src/App.tsx** - Main React application
6. **frontend/src/main.tsx** - React entry point
7. **frontend/src/index.css** - Global styles
8. **frontend/index.html** - HTML entry point
9. **frontend/package.json** - Node dependencies
10. **frontend/vite.config.ts** - Vite config
11. **frontend/tsconfig.json** - TypeScript config
12. **frontend/tailwind.config.js** - Tailwind config
13. **frontend/postcss.config.js** - PostCSS config
14. **frontend/Dockerfile** - Frontend container config

### Root Files:

15. **docker-compose.yml** - Docker orchestration

---

## 🏃 Step 3: Run the Application

### Option A: Using Docker (Recommended - Easiest)

1. Open a terminal/command prompt
2. Navigate to the `nostr-delivery` folder:
   ```bash
   cd nostr-delivery
   ```

3. Start everything with one command:
   ```bash
   docker-compose up --build
   ```

4. Wait for it to build (first time takes 5-10 minutes)

5. When you see these messages, it's ready:
   ```
   backend    | 🚀 Nostr Delivery Backend Starting...
   backend    | 🌐 Server ready!
   frontend   | ➜  Local:   http://localhost:3000/
   ```

6. Open your web browser and go to: **http://localhost:3000**

7. To stop the servers, press `Ctrl+C` in the terminal

---

### Option B: Running Manually (Without Docker)

If Docker doesn't work, you can run each part separately:

#### Backend (Rust):

1. Install Rust from: https://rustup.rs/
2. Open terminal and go to backend folder:
   ```bash
   cd nostr-delivery/backend
   ```
3. Run the server:
   ```bash
   cargo run --release
   ```
4. Keep this terminal open

#### Frontend (Node.js):

1. Install Node.js from: https://nodejs.org/ (version 18 or higher)
2. Open a NEW terminal and go to frontend folder:
   ```bash
   cd nostr-delivery/frontend
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```
5. Keep this terminal open

6. Open your browser to: **http://localhost:3000**

---

## 🎮 Step 4: Test the Application

### Login:
1. Click "Start Demo" button
2. You should see the main interface

### As a Sender (Create Delivery):
1. Make sure "I'm Sending" is selected at the top
2. Click "Create Request" tab
3. Fill in:
   - Pickup address (e.g., "123 Main St, Louisville, KY")
   - Dropoff address (e.g., "456 Oak Ave, Lexington, KY")
   - Package details
   - Offer amount in sats (e.g., "25000")
4. Click "Create Delivery Request"
5. Check "My Requests" tab to see it

### As a Courier (Accept Delivery):
1. Switch to "I'm Delivering" at the top
2. Click "Browse Jobs" tab
3. You should see available deliveries
4. Click "Accept" or "Counter Offer"
5. Check "Active Deliveries" tab

---

## ✅ Verification Checklist

Make sure these work:

- [ ] Backend starts without errors
- [ ] Frontend loads in browser
- [ ] Can click "Start Demo" and login
- [ ] Can switch between "I'm Sending" and "I'm Delivering"
- [ ] Can create a delivery request
- [ ] Can see the delivery in Browse Jobs (after switching to courier mode)
- [ ] Can place a bid on a delivery
- [ ] Can accept a bid (as sender)
- [ ] No error messages in the browser console (F12 to check)

---

## 🐛 Troubleshooting

### Problem: "Backend not connected" error

**Solution:**
- Make sure backend is running (you should see "Server ready!" in terminal)
- Check if http://localhost:8080/health returns data in your browser
- If using Docker, make sure Docker Desktop is running

### Problem: Frontend won't load

**Solution:**
- Make sure port 3000 isn't already in use
- Try: `npm run dev -- --port 3001` (use port 3001 instead)
- Check terminal for error messages

### Problem: "Cannot find module" errors

**Solution:**
- Delete `node_modules` folder in frontend
- Run `npm install` again
- Restart the frontend server

### Problem: Rust compilation errors

**Solution:**
- Make sure you copied ALL the Rust code correctly
- Check that `main.rs` and `lib.rs` are in the `src` folder
- Run `cargo clean` then `cargo build --release` again

### Problem: Docker build fails

**Solution:**
- Make sure Docker Desktop is running
- Try: `docker-compose down` then `docker-compose up --build` again
- Check Docker has enough disk space (needs ~5GB)

---

## 📱 Testing with Multiple Users

To test the full flow:

1. **Open Browser Window 1** (http://localhost:3000)
   - Login as Demo
   - Switch to "I'm Sending"
   - Create a delivery request

2. **Open Browser Window 2** (http://localhost:3000) 
   - Login as Demo (different user)
   - Switch to "I'm Delivering"
   - You should see the delivery from Window 1
   - Place a bid

3. **Back to Window 1**
   - Go to "My Requests"
   - You should see the bid
   - Accept the bid

4. **Both Windows**
   - Check "Active Deliveries" / "My Requests"
   - Should show the in-progress delivery

---

## 🎯 What Works Now

✅ **Core Features:**
- User login (demo mode)
- Creating delivery requests
- Viewing available deliveries
- Placing bids on deliveries
- Accepting bids
- Tracking active deliveries
- User reputation system

✅ **Technical Features:**
- REST API backend (Rust)
- React frontend (TypeScript)
- Real-time updates
- Geographic distance calculations
- Reputation algorithm

---

## 🚧 What's Not Implemented Yet

These features are planned but not built:

- ❌ Real Nostr protocol integration (currently demo only)
- ❌ Lightning Network payments (currently just numbers)
- ❌ IPFS photo storage (currently no photos)
- ❌ GPS tracking (currently just addresses)
- ❌ WebSocket real-time updates (currently needs refresh)
- ❌ Authentication with real Nostr keys

---

## 📊 System Requirements

**Minimum:**
- 4GB RAM
- 5GB disk space
- Modern web browser (Chrome, Firefox, Edge, Safari)
- Internet connection (for downloading dependencies)

**Recommended:**
- 8GB RAM
- 10GB disk space
- Fast internet connection

---

## 🆘 Getting Help

If something doesn't work:

1. **Check the terminal/console** for error messages
2. **Open browser developer tools** (F12) and check the Console tab
3. **Look at the backend logs** - they show what's happening
4. **Try the troubleshooting section** above

### Common Error Messages:

**"port already in use"**
- Another program is using port 8080 or 3000
- Solution: Close other programs or change the port

**"fetch failed"**
- Backend isn't running or not accessible
- Solution: Make sure backend started successfully

**"CORS error"**
- Frontend can't talk to backend
- Solution: Make sure both are running

---

## ✨ Success!

If you see the interface and can create/view deliveries, **congratulations!** 🎉

You now have a working decentralized delivery coordination system running on your computer.

---

## 📚 Next Steps

Once everything is working, you can:

1. **Test the full flow** with the multiple windows approach above
2. **Try different scenarios** (multiple packages, different amounts, etc.)
3. **Invite friends** to test with you (they need to run it on their computer too)
4. **Check the logs** to see what's happening behind the scenes

---

## 🔧 Development Commands

**Backend:**
```bash
cd backend
cargo build          # Build (debug mode)
cargo build --release  # Build (optimized)
cargo run            # Run
cargo test           # Run tests
cargo clean          # Clean build files
```

**Frontend:**
```bash
cd frontend
npm install          # Install dependencies
npm run dev          # Start dev server
npm run build        # Build for production
npm run preview      # Preview production build
```

**Docker:**
```bash
docker-compose up           # Start services
docker-compose up --build   # Rebuild and start
docker-compose down         # Stop services
docker-compose logs         # View logs
docker-compose ps           # Check status
```

---

## 🎓 Understanding the Code

### Backend (Rust):
- **main.rs** - HTTP server, API endpoints, request handling
- **lib.rs** - Data structures, distance calculations, reputation algorithm

### Frontend (React):
- **App.tsx** - Main application, all UI and logic
- **main.tsx** - React bootstrap
- **index.css** - Styles with Tailwind CSS

### How It Works:
1. Backend creates a REST API on port 8080
2. Frontend runs a web app on port 3000
3. Frontend makes HTTP requests to backend
4. Backend stores data in memory (resets when restarted)
5. No database needed for demo

---

**You're all set! Enjoy your decentralized delivery system! 🚀**
