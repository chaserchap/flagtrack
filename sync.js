/**
 * FlagTrack Sync Module
 * Offline-first sync between IndexedDB and PostgREST.
 *
 * Strategy:
 *   - All writes go to IndexedDB immediately (app never waits for network)
 *   - Records carry a `syncedAt` timestamp (null = not yet synced)
 *   - On sync: push unsynced local records → pull remote changes since last pull
 *   - Merge key: `ts` (play timestamp) for plays, `createdAt` for games/players
 *   - Last-write-wins on conflict (remote wins for simplicity; adjust if needed)
 *
 * Usage (add to your App component):
 *
 *   import { useSync } from './sync';
 *
 *   const { syncStatus, syncNow } = useSync(db, {
 *     onSyncComplete: () => {
 *       db.getAll("games").then(setGames);
 *       db.getAll("plays").then(setAllOffPlays);
 *       db.getAll("defPlays").then(setAllDefPlays);
 *       db.getAll("players").then(setPlayers);
 *     }
 *   });
 *
 * Then show syncStatus in your UI and call syncNow() for manual sync.
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ── Config ────────────────────────────────────────────────────────────────────
const API = "/api";               // Nginx proxies /api → PostgREST
const SYNC_INTERVAL_MS = 30_000;  // Auto-sync every 30s when online
const LAST_PULL_KEY = "flagtrack_last_pull";

// ── Table map: IndexedDB store → PostgREST table + field name transforms ──────
const TABLE_MAP = {
  players: {
    remote: "players",
    toRemote: (r) => ({
      local_id:   r.id,
      name:       r.name,
      season:     r.season,
      created_at: r.createdAt,
      deleted:    r.deleted ?? false,
    }),
    toLocal: (r) => ({
      id:        r.local_id,    // restore IndexedDB integer id
      remoteId:  r.id,          // keep remote UUID for future reference
      name:      r.name,
      season:    r.season,
      createdAt: r.created_at,
      syncedAt:  r.synced_at,
    }),
    dedupeKey: (r) => r.createdAt,
  },

  games: {
    remote: "games",
    toRemote: (r) => ({
      local_id:     r.id,
      opponent:     r.opponent,
      date:         r.date,
      season:       r.season,
      completed:    r.completed ?? false,
      our_score:    r.ourScore ?? null,
      their_score:  r.theirScore ?? null,
      notes:        r.notes ?? null,
      completed_at: r.completedAt ?? null,
      created_at:   r.createdAt,
      deleted:      r.deleted ?? false,
    }),
    toLocal: (r) => ({
      id:          r.local_id,
      remoteId:    r.id,
      opponent:    r.opponent,
      date:        r.date,
      season:      r.season,
      completed:   r.completed,
      ourScore:    r.our_score,
      theirScore:  r.their_score,
      notes:       r.notes,
      completedAt: r.completed_at,
      createdAt:   r.created_at,
      syncedAt:    r.synced_at,
    }),
    dedupeKey: (r) => r.createdAt,
  },

  plays: {
    remote: "plays",
    toRemote: (r) => ({
      local_id:        r.id,
      game_id:         r.gameRemoteId ?? null,  // resolved during sync
      player_id:       r.playerId ?? null,
      player_name:     r.playerName ?? null,
      role:            r.role ?? null,
      direction:       r.direction ?? null,
      play_type:       r.playType ?? null,
      result:          r.result ?? null,
      penalty:         r.penalty ?? null,
      is_penalty_play: r.isPenaltyPlay ?? false,
      opp_rush:        r.oppRush ?? null,
      down:            r.down ?? null,
      zone:            r.zone ?? null,
      note:            r.note ?? null,
      incomplete:      r.incomplete ?? false,
      is_conversion:   r.isConversion ?? false,
      conv_pts:        r.convPts ?? null,
      conv_result:     r.convResult ?? null,
      side:            r.side ?? null,
      ts:              r.ts,
      deleted:         r.deleted ?? false,
    }),
    toLocal: (r) => ({
      id:            r.local_id,
      remoteId:      r.id,
      gameId:        r.local_game_id,  // resolved during pull
      gameRemoteId:  r.game_id,
      playerId:      r.player_id,
      playerName:    r.player_name,
      role:          r.role,
      direction:     r.direction,
      playType:      r.play_type,
      result:        r.result,
      penalty:       r.penalty,
      isPenaltyPlay: r.is_penalty_play,
      oppRush:       r.opp_rush,
      down:          r.down,
      zone:          r.zone,
      note:          r.note,
      incomplete:    r.incomplete,
      isConversion:  r.is_conversion,
      convPts:       r.conv_pts,
      convResult:    r.conv_result,
      side:          r.side,
      ts:            r.ts,
      syncedAt:      r.synced_at,
    }),
    dedupeKey: (r) => r.ts,
  },

  defPlays: {
    remote: "def_plays",
    toRemote: (r) => ({
      local_id:         r.id,
      game_id:          r.gameRemoteId ?? null,
      opp_play_type:    r.oppPlayType ?? null,
      direction:        r.direction ?? null,
      pullers:          r.pullers ?? [],
      outcome:          r.outcome ?? null,
      penalty:          r.penalty ?? null,
      is_penalty_play:  r.isPenaltyPlay ?? false,
      rush:             r.rush ?? null,
      interceptor_id:   r.interceptorId ?? null,
      interceptor_name: r.interceptorName ?? null,
      down:             r.down ?? null,
      zone:             r.zone ?? null,
      note:             r.note ?? null,
      incomplete:       r.incomplete ?? false,
      ts:               r.ts,
      deleted:          r.deleted ?? false,
    }),
    toLocal: (r) => ({
      id:              r.local_id,
      remoteId:        r.id,
      gameId:          r.local_game_id,
      gameRemoteId:    r.game_id,
      oppPlayType:     r.opp_play_type,
      direction:       r.direction,
      pullers:         r.pullers ?? [],
      outcome:         r.outcome,
      penalty:         r.penalty,
      isPenaltyPlay:   r.is_penalty_play,
      rush:            r.rush,
      interceptorId:   r.interceptor_id,
      interceptorName: r.interceptor_name,
      down:            r.down,
      zone:            r.zone,
      note:            r.note,
      incomplete:      r.incomplete,
      ts:              r.ts,
      syncedAt:        r.synced_at,
    }),
    dedupeKey: (r) => r.ts,
  },

  insights: {
    remote: "insights",
    toRemote: (r) => ({
      local_id:   r.id,
      game_id:    r.gameRemoteId ?? null,
      season:     r.season,
      scope:      r.scope,
      bullets:    r.bullets ?? null,
      generating: r.generating ?? false,
      error:      r.error ?? null,
      ts:         r.ts,
    }),
    toLocal: (r) => ({
      id:         r.local_id,
      remoteId:   r.id,
      gameId:     r.local_game_id,
      gameRemoteId: r.game_id,
      season:     r.season,
      scope:      r.scope,
      bullets:    r.bullets,
      generating: r.generating,
      error:      r.error,
      ts:         r.ts,
      syncedAt:   r.synced_at,
    }),
    dedupeKey: (r) => r.ts,
  },
};

// ── Core API helpers ──────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Upsert a batch of records (PostgREST upsert via POST + Prefer header)
async function upsertRemote(table, records) {
  if (!records.length) return;
  return apiFetch(`/${table}`, {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(records),
  });
}

// Pull records updated since a timestamp
async function pullRemote(table, since) {
  const filter = since ? `?synced_at=gte.${since}` : "";
  return apiFetch(`/${table}${filter}`);
}

// ── Main sync logic ───────────────────────────────────────────────────────────
async function runSync(db) {
  const now = Date.now();
  const lastPull = parseInt(localStorage.getItem(LAST_PULL_KEY) || "0", 10);

  // Build a local_id → remote_id map for games (needed to resolve game_id FK)
  const localGames  = await db.getAll("games");
  const remoteGames = await pullRemote("games", lastPull);
  const gameIdMap   = {};  // local integer id → remote UUID
  for (const rg of remoteGames || []) {
    if (rg.local_id) gameIdMap[rg.local_id] = rg.id;
  }

  // ── Push phase: send unsynced local records to PostgREST ──────────────────
  for (const [store, cfg] of Object.entries(TABLE_MAP)) {
    const localRecords = await db.getAll(store);
    const unsynced     = localRecords.filter(r => !r.syncedAt);
    if (!unsynced.length) continue;

    const remoteRecords = unsynced.map(r => {
      const remote = cfg.toRemote(r);
      // Resolve game FK for plays/defPlays/insights
      if (remote.game_id === null && r.gameId) {
        remote.game_id = gameIdMap[r.gameId] ?? null;
      }
      return remote;
    });

    await upsertRemote(cfg.remote, remoteRecords);

    // Mark local records as synced
    for (const r of localRecords.filter(r => !r.syncedAt)) {
      await db.put(store, { ...r, syncedAt: now });
    }
  }

  // ── Pull phase: fetch remote changes and merge into IndexedDB ─────────────
  for (const [store, cfg] of Object.entries(TABLE_MAP)) {
    if (store === "games") continue; // Already pulled above

    const remoteRecords = await pullRemote(cfg.remote, lastPull);
    if (!remoteRecords?.length) continue;

    const localRecords  = await db.getAll(store);
    const localByDedupe = new Map(localRecords.map(r => [cfg.dedupeKey(r), r]));

    for (const remote of remoteRecords) {
      // Resolve local game id from remote game_id UUID
      const localGameId = remote.game_id
        ? remoteGames.find(g => g.id === remote.game_id)?.local_id ?? null
        : null;

      const local    = cfg.toLocal({ ...remote, local_game_id: localGameId });
      const existing = localByDedupe.get(cfg.dedupeKey(local));

      if (!existing) {
        // New record from remote — insert into IndexedDB
        // Strip id so IndexedDB auto-increments (unless we have a local_id)
        const { id, ...rest } = local;
        if (id) {
          await db.put(store, { id, ...rest });
        } else {
          await db.add(store, rest);
        }
      } else if ((remote.synced_at || 0) > (existing.syncedAt || 0)) {
        // Remote is newer — update local (remote wins)
        await db.put(store, { ...existing, ...local, id: existing.id });
      }
      // else: local is newer or equal — skip (will push on next sync)
    }
  }

  // Merge pulled games into local
  for (const remote of remoteGames || []) {
    const localGameId = remote.local_id;
    const existing    = localGames.find(g => g.id === localGameId);
    const local       = TABLE_MAP.games.toLocal(remote);

    if (!existing) {
      const { id, ...rest } = local;
      if (id) await db.put("games", { id, ...rest });
      else     await db.add("games", rest);
    } else if ((remote.synced_at || 0) > (existing.syncedAt || 0)) {
      await db.put("games", { ...existing, ...local, id: existing.id });
    }
  }

  localStorage.setItem(LAST_PULL_KEY, String(now));
}

// ── React hook ────────────────────────────────────────────────────────────────
export function useSync(db, { onSyncComplete } = {}) {
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | error | ok
  const [lastSync,   setLastSync]   = useState(null);
  const [online,     setOnline]     = useState(navigator.onLine);
  const timerRef = useRef(null);

  useEffect(() => {
    const up   = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online",  up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) { setSyncStatus("error"); return; }
    setSyncStatus("syncing");
    try {
      await runSync(db);
      setSyncStatus("ok");
      setLastSync(new Date());
      onSyncComplete?.();
    } catch (e) {
      console.error("Sync error:", e);
      setSyncStatus("error");
    }
  }, [db, onSyncComplete]);

  // Auto-sync on mount and on interval
  useEffect(() => {
    syncNow();
    timerRef.current = setInterval(syncNow, SYNC_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [syncNow]);

  // Sync when coming back online
  useEffect(() => {
    if (online) syncNow();
  }, [online, syncNow]);

  return { syncStatus, lastSync, online, syncNow };
}

// ── Sync status indicator component ───────────────────────────────────────────
export function SyncIndicator({ syncStatus, lastSync, syncNow }) {
  const label = {
    idle:    "–",
    syncing: "⟳",
    ok:      "✓",
    error:   "⚠",
  }[syncStatus] ?? "–";

  const color = {
    idle:    "#4a6a8a",
    syncing: "#00e5ff",
    ok:      "#00e676",
    error:   "#ff1744",
  }[syncStatus] ?? "#4a6a8a";

  const timeStr = lastSync
    ? lastSync.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })
    : "never";

  return (
    <button
      onClick={syncNow}
      title={`Last sync: ${timeStr}. Tap to sync now.`}
      style={{
        background: "none", border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 4,
        fontSize: 11, fontWeight: 700, color,
        fontFamily: "'Barlow Condensed', sans-serif",
        letterSpacing: ".06em", textTransform: "uppercase",
        padding: "4px 8px",
        animation: syncStatus === "syncing" ? "spin .8s linear infinite" : "none",
      }}
    >
      {label} {syncStatus !== "syncing" ? `Sync ${timeStr}` : "Syncing…"}
    </button>
  );
}
