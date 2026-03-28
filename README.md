# FlagTrack — Self-Hosted Setup

Flag football play tracker. Runs on your homelab, syncs over Tailscale.

## Stack

```
Tailscale device → http://flagtrack
  └── Nginx :80
        ├── /       → React app (Vite build, static)
        └── /api/   → PostgREST :3000 → Postgres :5432
```

---

## Quick Start

### 1. Prerequisites

- Docker + Docker Compose v2 on your homelab machine
- Tailscale running on the homelab machine
- The homelab machine's Tailscale hostname set to `flagtrack`
  (or update `nginx/nginx.conf` `server_name` to match yours)

### 2. Set your Tailscale hostname

On the homelab machine:
```bash
sudo tailscale set --hostname=flagtrack
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env and set a strong POSTGRES_PASSWORD
nano .env
```

### 4. Place your app source

Copy `flag-football-tracker.jsx` (from the Claude artifact) into:
```
src/
  main.jsx          ← entry point (see below)
  App.jsx           ← rename flag-football-tracker.jsx to this
```

Create `src/main.jsx`:
```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
```

### 5. Add sync to the app (optional but recommended)

In `src/App.jsx`, import and wire up the sync hook:

```jsx
import { useSync, SyncIndicator } from "../sync.js";

// Inside your App component:
const { syncStatus, lastSync, syncNow } = useSync(db, {
  onSyncComplete: () => {
    db.getAll("games").then(setGames);
    db.getAll("plays").then(setAllOffPlays);
    db.getAll("defPlays").then(setAllDefPlays);
    db.getAll("players").then(setPlayers);
  }
});

// In your nav bar JSX:
<SyncIndicator syncStatus={syncStatus} lastSync={lastSync} syncNow={syncNow} />
```

### 6. Build and deploy

```bash
docker compose up -d --build
```

First run takes ~2 minutes (Postgres init + npm install + Vite build).

### 7. Access from any Tailscale device

Open `http://flagtrack` in your browser or on your phone (connected to Tailscale).

To install as a PWA on iOS: Safari → Share → Add to Home Screen.

---

## Directory Structure

```
flagtrack/
├── db/
│   └── init.sql          # Postgres schema (runs once on first boot)
├── nginx/
│   └── nginx.conf        # Nginx config (static serve + API proxy)
├── public/
│   └── manifest.json     # PWA manifest
├── src/
│   ├── main.jsx          # Vite entry point (you create this)
│   └── App.jsx           # Main app (flag-football-tracker.jsx)
├── sync.js               # Offline-first sync module
├── Dockerfile            # Multi-stage: Vite build → Nginx serve
├── docker-compose.yml    # Postgres + PostgREST + App
├── vite.config.js        # Vite config with dev proxy
├── package.json
├── index.html
├── .env.example
└── README.md
```

---

## Updating the App

After editing the source:

```bash
docker compose up -d --build app
```

Postgres data is in a named volume (`postgres_data`) and survives rebuilds.

---

## Accessing Postgres Directly

```bash
docker compose exec postgres psql -U flagtrack flagtrack
```

Useful queries:
```sql
-- Check play counts
SELECT g.opponent, g.date, COUNT(p.id) AS plays
FROM games g LEFT JOIN plays p ON p.game_id = g.id
GROUP BY g.id ORDER BY g.created_at DESC;

-- See unsynced local records (shouldn't be any if sync is running)
SELECT * FROM plays WHERE synced_at IS NULL;
```

---

## PostgREST API

PostgREST auto-generates a REST API from the schema. Example calls:

```bash
# All games
curl http://flagtrack/api/games

# Plays for a specific game
curl "http://flagtrack/api/plays?game_id=eq.<game-uuid>"

# Games in a season
curl "http://flagtrack/api/games?season=eq.Spring+2025"
```

Full PostgREST docs: https://postgrest.org/en/stable/references/api.html

---

## Backup

```bash
# Dump database
docker compose exec postgres pg_dump -U flagtrack flagtrack > flagtrack_backup.sql

# Restore
cat flagtrack_backup.sql | docker compose exec -T postgres psql -U flagtrack flagtrack
```

Set this up as a cron job on the homelab for automatic backups.

---

## Troubleshooting

**App shows blank page**
- Check `docker compose logs app` for Nginx errors
- Make sure `src/main.jsx` exists

**API calls failing (Network Error in sync)**
- Check `docker compose logs postgrest`
- Verify Postgres is healthy: `docker compose ps`

**Can't reach from Tailscale device**
- Confirm the homelab machine is connected: `tailscale status`
- Check Tailscale ACL allows access to the machine
- Try the Tailscale IP directly instead of hostname first

**Sync conflicts**
- Current strategy: remote wins when `synced_at` is newer
- Edit `sync.js` `runSync()` merge logic to change this behavior
