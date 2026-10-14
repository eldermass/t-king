CREATE TABLE IF NOT EXISTS market_stock_quotes (
  trade_date TEXT PRIMARY KEY,
  quotes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_stock_quotes_trade_date
  ON market_stock_quotes(trade_date);
