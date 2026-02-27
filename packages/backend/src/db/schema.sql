-- Claude Town Database Schema

CREATE TABLE IF NOT EXISTS wallets (
  address           TEXT PRIMARY KEY,
  token_balance     BIGINT NOT NULL DEFAULT 0,
  plot_x            INTEGER NOT NULL,
  plot_y            INTEGER NOT NULL,
  house_tier        SMALLINT NOT NULL DEFAULT 0,
  build_progress    NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  damage_pct        NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  build_speed_mult  NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  boost_expires_at  TIMESTAMPTZ,
  color_hue         SMALLINT NOT NULL DEFAULT 0,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trade_events (
  id              BIGSERIAL PRIMARY KEY,
  tx_signature    TEXT NOT NULL UNIQUE,
  wallet_address  TEXT NOT NULL REFERENCES wallets(address),
  event_type      TEXT NOT NULL CHECK (event_type IN ('buy', 'sell', 'transfer_in', 'transfer_out')),
  token_amount    BIGINT NOT NULL,
  sol_amount      BIGINT,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_events_wallet ON trade_events(wallet_address);
CREATE INDEX IF NOT EXISTS idx_trade_events_processed_at ON trade_events(processed_at DESC);

-- AI-generated content columns on wallets (added via ALTER for existing DBs)
DO $$ BEGIN
  ALTER TABLE wallets ADD COLUMN IF NOT EXISTS custom_image_url TEXT;
  ALTER TABLE wallets ADD COLUMN IF NOT EXISTS building_name TEXT;
  ALTER TABLE wallets ADD COLUMN IF NOT EXISTS architectural_style TEXT;
  ALTER TABLE wallets ADD COLUMN IF NOT EXISTS clawd_comment TEXT;
  ALTER TABLE wallets ADD COLUMN IF NOT EXISTS image_prompt TEXT;
  ALTER TABLE wallets ADD COLUMN IF NOT EXISTS image_generated_at TIMESTAMPTZ;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Clawd decision log
CREATE TABLE IF NOT EXISTS clawd_decisions (
  id              BIGSERIAL PRIMARY KEY,
  wallet_address  TEXT NOT NULL REFERENCES wallets(address),
  event_type      TEXT NOT NULL,
  decision_json   JSONB NOT NULL,
  image_url       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clawd_decisions_wallet ON clawd_decisions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_clawd_decisions_created_at ON clawd_decisions(created_at DESC);

CREATE TABLE IF NOT EXISTS plot_grid (
  x         INTEGER NOT NULL,
  y         INTEGER NOT NULL,
  address   TEXT REFERENCES wallets(address),
  PRIMARY KEY (x, y)
);
