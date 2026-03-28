-- FlagTrack schema
-- Mirrors the IndexedDB data model with sync metadata added

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Players ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  local_id    INTEGER,               -- IndexedDB autoincrement id (for merge dedup)
  name        TEXT NOT NULL,
  season      TEXT NOT NULL,
  created_at  BIGINT NOT NULL,
  synced_at   BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  deleted     BOOLEAN DEFAULT FALSE
);

-- ── Games ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS games (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  local_id    INTEGER,
  opponent    TEXT NOT NULL,
  date        TEXT NOT NULL,
  season      TEXT NOT NULL,
  completed   BOOLEAN DEFAULT FALSE,
  our_score   INTEGER,
  their_score INTEGER,
  notes       TEXT,
  completed_at BIGINT,
  created_at  BIGINT NOT NULL,
  synced_at   BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  deleted     BOOLEAN DEFAULT FALSE
);

-- ── Offense plays ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plays (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  local_id        INTEGER,
  game_id         TEXT REFERENCES games(id) ON DELETE CASCADE,
  player_id       TEXT,
  player_name     TEXT,
  role            TEXT,
  direction       TEXT,
  play_type       TEXT,
  result          TEXT,
  penalty         TEXT,
  is_penalty_play BOOLEAN DEFAULT FALSE,
  opp_rush        TEXT,
  down            INTEGER,
  zone            TEXT,
  note            TEXT,
  incomplete      BOOLEAN DEFAULT FALSE,
  -- Conversion fields
  is_conversion   BOOLEAN DEFAULT FALSE,
  conv_pts        INTEGER,
  conv_result     TEXT,
  side            TEXT,
  ts              BIGINT NOT NULL,
  synced_at       BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  deleted         BOOLEAN DEFAULT FALSE
);

-- ── Defense plays ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS def_plays (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  local_id         INTEGER,
  game_id          TEXT REFERENCES games(id) ON DELETE CASCADE,
  opp_play_type    TEXT,
  direction        TEXT,
  pullers          JSONB DEFAULT '[]',
  outcome          TEXT,
  penalty          TEXT,
  is_penalty_play  BOOLEAN DEFAULT FALSE,
  rush             TEXT,
  interceptor_id   TEXT,
  interceptor_name TEXT,
  down             INTEGER,
  zone             TEXT,
  note             TEXT,
  incomplete       BOOLEAN DEFAULT FALSE,
  ts               BIGINT NOT NULL,
  synced_at        BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  deleted          BOOLEAN DEFAULT FALSE
);

-- ── AI Insights ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insights (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  local_id    INTEGER,
  game_id     TEXT,
  season      TEXT NOT NULL,
  scope       TEXT NOT NULL,  -- 'game' | 'season'
  bullets     JSONB,          -- array of insight strings
  generating  BOOLEAN DEFAULT FALSE,
  error       TEXT,
  ts          BIGINT NOT NULL,
  synced_at   BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_plays_game_id     ON plays(game_id);
CREATE INDEX IF NOT EXISTS idx_plays_ts          ON plays(ts);
CREATE INDEX IF NOT EXISTS idx_def_plays_game_id ON def_plays(game_id);
CREATE INDEX IF NOT EXISTS idx_def_plays_ts      ON def_plays(ts);
CREATE INDEX IF NOT EXISTS idx_games_season      ON games(season);
CREATE INDEX IF NOT EXISTS idx_insights_game_id  ON insights(game_id);
CREATE INDEX IF NOT EXISTS idx_insights_season   ON insights(season);

-- ── PostgREST role ────────────────────────────────────────────────────────────
-- PostgREST connects as this role; no password needed inside Docker network
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'web_anon') THEN
    CREATE ROLE web_anon NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO web_anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO web_anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO web_anon;
