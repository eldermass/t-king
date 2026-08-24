CREATE TABLE IF NOT EXISTS market_limit_up_quotes (
  trade_date TEXT NOT NULL,
  code TEXT NOT NULL,
  quote_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (trade_date, code)
);

CREATE INDEX IF NOT EXISTS idx_market_limit_up_quotes_trade_date
  ON market_limit_up_quotes(trade_date);
