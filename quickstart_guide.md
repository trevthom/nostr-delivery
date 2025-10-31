# ⚡ Quick Start Guide - 5 Minutes to Running

## 🎯 Goal
Get Nostr Delivery running on your computer in 5 minutes.

---

## 📋 What You Need

1. **Docker Desktop** installed and running
2. **15 files** I created for you (listed below)
3. **5-10 minutes** for first-time build

---

## 📁 File Checklist

Create this exact folder structure and copy these files:

```
nostr-delivery/
│
├── backend/
│   ├── src/
│   │   ├── main.rs           ← COPY FILE #1
│   │   └── lib.rs            ← COPY FILE #2
│   ├── Cargo.toml            ← COPY FILE #3
│   └── Dockerfile            ← COPY FILE #4
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx           ← COPY FILE #5
│   │   ├── main.tsx          ← COPY FILE #6
│   │   └── index.css         ← COPY FILE #7
│   ├── index.html            ← COPY FILE #8
│   ├── package.json          ← COPY FILE #9
│   ├── vite.config.ts        ← COPY FILE #10
│   ├── tsconfig.json         ← COPY FILE #11
│   ├── tailwind.config.js    ← COPY FILE #12
│   ├── postcss.config.js     ← COPY FILE #13
│   └── Dockerfile            ← COPY FILE #14
│
└── docker-compose.yml        ← COPY FILE #15
```

---

## 🚀 3 Commands to Run

### Step 1: Open Terminal/Command Prompt

**Windows:**
- Press `Windows + R`
- Type `cmd` and press Enter

**Mac:**
- Press `Command + Space`
- Type `terminal` and press Enter

**Linux:**
- Press `Ctrl + Alt + T`

### Step 2: Navigate to Folder

```bash
cd path/to/nostr-delivery
```
*(Replace `path/to` with where you created the folder)*

### Step 3: Start Everything

```bash
docker-compose up --build
```

### Step 4: Wait

You'll see lots of text scrolling. Wait for:
```
backend    | 🌐 Server ready!
frontend   | ➜  Local:   http://localhost:3000/
```

### Step 5: Open Browser

Go to: **http://localhost:3000**

---

## ✅ Is It Working?

You should see:
1. Orange and purple gradient background
2. "Nostr Delivery" logo
3. "Start Demo" button
4. Green dot saying "Backend Connected"

If YES → **Success! 🎉**

If NO → See troubleshooting below ⬇️

---

## 🐛 Quick Fixes

### "Backend Disconnected" (Red Dot)

**Fix:**
```bash
# Stop everything (Ctrl+C in terminal)
# Then restart:
docker-compose down
docker-compose up --build
```

### "Docker not found"

**Fix:** Install Docker Desktop from https://www.docker.com/products/docker-desktop

### "Port already in use"

**Fix:** Change ports in `docker-compose.yml`:
```yaml
ports:
  - "8081:8080"  # Change 8080 to 8081
  - "3001:3000"  # Change 3000 to 3001
```

Then access at http://localhost:3001

---

## 🎮 Test It

### Create a Delivery:
1. Click "Start Demo"
2. Make sure "I'm Sending" is selected
3. Click "Create Request" tab
4. Fill in addresses and amount
5. Click "Create Delivery Request"
6. See it in "My Requests"

### Accept a Delivery:
1. Switch to "I'm Delivering"
2. Click "Browse Jobs"
3. See your delivery listed
4. Click "Accept"
5. Check "Active Deliveries"

---

## 🛑 Stop the Server

Press `Ctrl + C` in the terminal

To completely shut down:
```bash
docker-compose down
```

---

## 🔄 Restart Later

Next time, just run:
```bash
cd path/to/nostr-delivery
docker-compose up
```
*(No `--build` needed unless you change code)*

---

## 📁 All 15 Files You Need

I created these artifacts for you - copy each one to the correct location:

### Backend (4 files):
1. **main.rs** - "Complete Working Nostr Delivery Backend"
2. **lib.rs** - "Backend Library Module"  
3. **Cargo.toml** - "Rust Dependencies"
4. **Dockerfile** - "Dockerfile - Rust Backend"

### Frontend (10 files):
5. **App.tsx** - "App.tsx - Main React Application"
6. **main.tsx** - "main.tsx - React Entry Point"
7. **index.css** - "index.css - Global Styles"
8. **index.html** - "index.html - Frontend Entry Point"
9. **package.json** - "package.json - Frontend Dependencies"
10. **vite.config.ts** - "vite.config.ts - Vite Configuration"
11. **tsconfig.json** - "tsconfig.json - TypeScript Configuration"
12. **tailwind.config.js** - "tailwind.config.js - Tailwind CSS Configuration"
13. **postcss.config.js** - "postcss.config.js - PostCSS Configuration"
14. **Dockerfile** - "Dockerfile - Frontend Container"

### Root (1 file):
15. **docker-compose.yml** - "docker-compose.yml - Production Deployment"

---

## 💡 Pro Tips

**Tip 1:** Keep the terminal window open while using the app

**Tip 2:** Changes to code require rebuild: `docker-compose up --build`

**Tip 3:** Check logs if something breaks: `docker-compose logs`

**Tip 4:** Use multiple browser windows to test as different users

**Tip 5:** Press F12 in browser to see console for errors

---

## 🎓 What You Built

You now have:
- ✅ Rust backend API (high performance)
- ✅ React frontend (modern UI)
- ✅ Delivery coordination system
- ✅ Bidding marketplace
- ✅ Reputation system
- ✅ Multi-package support

All running on YOUR computer, NO cloud required!

---

## 🆘 Still Stuck?

### Check This:
1. ✅ Docker Desktop is running (see icon in system tray)
2. ✅ All 15 files copied to correct locations
3. ✅ Terminal is in `nostr-delivery` folder
4. ✅ No typos in folder/file names
5. ✅ Internet connection active (for downloads)

### See Logs:
```bash
# In another terminal window:
docker-compose logs backend
docker-compose logs frontend
```

### Nuclear Option (Start Fresh):
```bash
docker-compose down
docker system prune -a  # Clears everything
docker-compose up --build
```

---

## ✨ You Did It!

If you can see the orange/purple interface and create deliveries, **you successfully deployed a decentralized delivery system!**

This is the same architecture used by production apps serving thousands of users.

**Welcome to decentralized development! 🚀**

---

**Time Check:** Did this take more than 15 minutes? Let me know what slowed you down so I can improve the guide!
