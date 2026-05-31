-- game.tok · Supabase database migrations
-- Run via: supabase db push  OR  psql $DATABASE_URL -f migrations.sql

-- ── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for wallet address search

-- ── Games ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS games (
  id                 BIGINT       PRIMARY KEY,
  creator            TEXT         NOT NULL,
  ft_mint            TEXT,
  game_type          SMALLINT,    -- 0=rpg 1=mini 2=ponzi 3=strategy 4=puzzle 5=battle
  house_edge_bps     SMALLINT     DEFAULT 1500,
  is_educational     BOOLEAN      DEFAULT FALSE,
  total_players      BIGINT       DEFAULT 0,
  total_raids        BIGINT       DEFAULT 0,
  total_rewards_paid BIGINT       DEFAULT 0,
  paused             BOOLEAN      DEFAULT FALSE,
  slug               TEXT         UNIQUE,
  name               TEXT,
  description        TEXT,
  emoji              TEXT,
  banner_color       TEXT,
  nft_collection     TEXT,
  created_at         TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS games_creator_idx ON games(creator);
CREATE INDEX IF NOT EXISTS games_type_idx    ON games(game_type);

-- ── Players ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  wallet         TEXT         NOT NULL,
  game_id        BIGINT       NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  level          SMALLINT     DEFAULT 1,
  xp             BIGINT       DEFAULT 0,
  raids_won      BIGINT       DEFAULT 0,
  raids_lost     BIGINT       DEFAULT 0,
  total_earned   BIGINT       DEFAULT 0,
  total_staked   BIGINT       DEFAULT 0,
  ship_nft       TEXT,        -- mint pubkey of equipped ship NFT
  joined_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  DEFAULT NOW(),
  PRIMARY KEY (wallet, game_id)
);

CREATE INDEX IF NOT EXISTS players_wallet_idx  ON players(wallet);
CREATE INDEX IF NOT EXISTS players_game_idx    ON players(game_id);
CREATE INDEX IF NOT EXISTS players_level_idx   ON players(game_id, level DESC);

-- ── Raids ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS raids (
  id             BIGSERIAL    PRIMARY KEY,
  game_id        BIGINT       REFERENCES games(id),
  player         TEXT         NOT NULL,
  target_name    TEXT,
  stake          BIGINT       NOT NULL,
  reward         BIGINT       NOT NULL DEFAULT 0,
  won            BOOLEAN      NOT NULL,
  roll           SMALLINT,
  win_threshold  SMALLINT,
  new_level      SMALLINT,
  tx_sig         TEXT         UNIQUE,
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS raids_game_player_idx ON raids(game_id, player);
CREATE INDEX IF NOT EXISTS raids_created_idx     ON raids(created_at DESC);
CREATE INDEX IF NOT EXISTS raids_tx_sig_idx      ON raids(tx_sig);

-- ── Liquidity locks ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lp_locks (
  game_id    BIGINT       PRIMARY KEY REFERENCES games(id),
  owner      TEXT         NOT NULL,
  lp_mint    TEXT         NOT NULL,
  amount     BIGINT       NOT NULL,
  locked_at  TIMESTAMPTZ  NOT NULL,
  unlock_ts  TIMESTAMPTZ  NOT NULL,
  withdrawn  BOOLEAN      DEFAULT FALSE,
  lock_pda   TEXT         -- on-chain PDA address
);

-- ── NFT collections ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nft_collections (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id        BIGINT       REFERENCES games(id),
  collection_mint TEXT        NOT NULL UNIQUE,
  name           TEXT         NOT NULL,
  symbol         TEXT,
  max_supply     BIGINT,
  minted         BIGINT       DEFAULT 0,
  royalty_bps    SMALLINT     DEFAULT 500,
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nfts (
  mint           TEXT         PRIMARY KEY,
  collection_id  UUID         REFERENCES nft_collections(id),
  owner          TEXT         NOT NULL,
  rarity         SMALLINT,    -- 0=common 1=rare 2=epic 3=legendary
  edition        INT,
  trait_data     JSONB        DEFAULT '{}',
  arweave_uri    TEXT,
  minted_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nfts_owner_idx      ON nfts(owner);
CREATE INDEX IF NOT EXISTS nfts_collection_idx ON nfts(collection_id);

-- ── Tournaments ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournaments (
  id             TEXT         PRIMARY KEY,  -- on-chain pubkey
  game_id        BIGINT       REFERENCES games(id),
  creator        TEXT,
  prize_pool     BIGINT       NOT NULL,
  entry_fee      BIGINT       DEFAULT 0,
  max_entrants   INT          DEFAULT 500,
  entrant_count  INT          DEFAULT 0,
  winner_count   SMALLINT     DEFAULT 4,
  prize_shares   SMALLINT[]   DEFAULT '{5000,2500,1500,1000}',
  start_ts       TIMESTAMPTZ  NOT NULL,
  end_ts         TIMESTAMPTZ  NOT NULL,
  state          SMALLINT     DEFAULT 0,  -- 0=pending 1=finalized 2=cancelled
  final_rankings TEXT[],
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournament_entries (
  tournament_id  TEXT         REFERENCES tournaments(id),
  player         TEXT         NOT NULL,
  score          BIGINT       DEFAULT 0,
  rank           SMALLINT,
  claimed        BOOLEAN      DEFAULT FALSE,
  entered_at     TIMESTAMPTZ  DEFAULT NOW(),
  PRIMARY KEY (tournament_id, player)
);

-- ── Leaderboard ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leaderboard (
  wallet         TEXT         NOT NULL,
  game_id        BIGINT       NOT NULL REFERENCES games(id),
  score          BIGINT       DEFAULT 0,
  rank           INT,
  wins           INT          DEFAULT 0,
  level          INT          DEFAULT 1,
  updated_at     TIMESTAMPTZ  DEFAULT NOW(),
  PRIMARY KEY (wallet, game_id)
);

CREATE INDEX IF NOT EXISTS leaderboard_score_idx ON leaderboard(game_id, score DESC);

-- ── Staking ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stake_records (
  id             BIGSERIAL    PRIMARY KEY,
  player         TEXT         NOT NULL,
  game_id        BIGINT       REFERENCES games(id),
  amount         BIGINT       NOT NULL,
  staked_at      TIMESTAMPTZ  NOT NULL,
  last_claim     TIMESTAMPTZ  NOT NULL,
  withdrawn_at   TIMESTAMPTZ,
  is_active      BOOLEAN      DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS stakes_player_game ON stake_records(player, game_id);

-- ── RPC helpers ───────────────────────────────────────────────────────────────

-- Increment leaderboard score atomically
CREATE OR REPLACE FUNCTION increment_leaderboard_score(
  p_wallet TEXT, p_game_id BIGINT, p_amount BIGINT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO leaderboard (wallet, game_id, score, wins)
  VALUES (p_wallet, p_game_id, p_amount, 1)
  ON CONFLICT (wallet, game_id)
  DO UPDATE SET
    score      = leaderboard.score + p_amount,
    wins       = leaderboard.wins + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Update player raid stats atomically
CREATE OR REPLACE FUNCTION update_player_raid_stats(
  p_wallet TEXT, p_game_id BIGINT,
  p_won BOOLEAN, p_reward BIGINT, p_level SMALLINT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO players (wallet, game_id, raids_won, raids_lost, total_earned, level)
  VALUES (
    p_wallet, p_game_id,
    CASE WHEN p_won THEN 1 ELSE 0 END,
    CASE WHEN p_won THEN 0 ELSE 1 END,
    p_reward, p_level
  )
  ON CONFLICT (wallet, game_id)
  DO UPDATE SET
    raids_won    = players.raids_won    + CASE WHEN p_won THEN 1 ELSE 0 END,
    raids_lost   = players.raids_lost   + CASE WHEN p_won THEN 0 ELSE 1 END,
    total_earned = players.total_earned + p_reward,
    level        = GREATEST(players.level, p_level),
    updated_at   = NOW();
END;
$$ LANGUAGE plpgsql;

-- ── Row-level security ────────────────────────────────────────────────────────
ALTER TABLE games             ENABLE ROW LEVEL SECURITY;
ALTER TABLE players           ENABLE ROW LEVEL SECURITY;
ALTER TABLE raids             ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lp_locks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_entries ENABLE ROW LEVEL SECURITY;

-- Public read on everything
CREATE POLICY "public_read_games"        ON games        FOR SELECT USING (true);
CREATE POLICY "public_read_players"      ON players      FOR SELECT USING (true);
CREATE POLICY "public_read_raids"        ON raids        FOR SELECT USING (true);
CREATE POLICY "public_read_leaderboard"  ON leaderboard  FOR SELECT USING (true);
CREATE POLICY "public_read_locks"        ON lp_locks     FOR SELECT USING (true);
CREATE POLICY "public_read_tournaments"  ON tournaments  FOR SELECT USING (true);
CREATE POLICY "public_read_entries"      ON tournament_entries FOR SELECT USING (true);

-- Writes only via service role (indexer) — no direct client writes
