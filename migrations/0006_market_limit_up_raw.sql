CREATE TABLE IF NOT EXISTS market_limit_up_raw (
  trade_date TEXT PRIMARY KEY,
  total_stocks INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  rows_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_limit_up_raw_trade_date
  ON market_limit_up_raw(trade_date);
