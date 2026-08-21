CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS boards (
  user_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS market_sentiment (
  trade_date TEXT PRIMARY KEY,
  market_sentiment REAL,
  profit_score REAL,
  speculation_score REAL,
  breadth_score REAL,
  limit_score REAL,
  liquidity_score REAL,
  risk_score REAL,
  momentum REAL,
  phase TEXT NOT NULL,
  advancers INTEGER,
  decliners INTEGER,
  unchanged INTEGER,
  limit_up_count INTEGER,
  limit_down_count INTEGER,
  broken_board_count INTEGER,
  broken_board_rate REAL,
  max_board_height INTEGER,
  board_2_count INTEGER,
  board_3_count INTEGER,
  board_4_plus_count INTEGER,
  total_amount REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_sentiment_trade_date ON market_sentiment(trade_date);
