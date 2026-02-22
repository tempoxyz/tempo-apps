CREATE TABLE IF NOT EXISTS faucet_dispensations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  recipient TEXT NOT NULL,
  amount TEXT NOT NULL,
  purpose TEXT NOT NULL,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_dispensations_email ON faucet_dispensations(email);
CREATE INDEX idx_dispensations_created_at ON faucet_dispensations(created_at);
CREATE INDEX idx_dispensations_status ON faucet_dispensations(status);
