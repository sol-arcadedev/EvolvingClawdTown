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

CREATE TABLE IF NOT EXISTS plot_grid (
  x         INTEGER NOT NULL,
  y         INTEGER NOT NULL,
  address   TEXT REFERENCES wallets(address),
  PRIMARY KEY (x, y)
);
