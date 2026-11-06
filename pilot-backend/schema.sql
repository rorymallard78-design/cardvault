-- CardVault private pilot — Cloudflare D1 database
-- Apply once with: npx wrangler d1 execute cardvault-pilot --remote --file=./schema.sql
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS pilot_invites (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  quota INTEGER NOT NULL DEFAULT 50 CHECK (quota BETWEEN 1 AND 50),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_scan_at INTEGER,
  last_attempt_id TEXT
);
CREATE TABLE IF NOT EXISTS pilot_budget (
  id INTEGER PRIMARY KEY CHECK (id=1),
  max_scans INTEGER NOT NULL DEFAULT 1000 CHECK (max_scans >= 0),
  max_spend_micro_usd INTEGER NOT NULL DEFAULT 20000000 CHECK (max_spend_micro_usd >= 0),
  claimed_scans INTEGER NOT NULL DEFAULT 0 CHECK (claimed_scans >= 0),
  completed_scans INTEGER NOT NULL DEFAULT 0 CHECK (completed_scans >= 0),
  failed_scans INTEGER NOT NULL DEFAULT 0 CHECK (failed_scans >= 0),
  spent_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK (spent_micro_usd >= 0),
  reserved_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK (reserved_micro_usd >= 0)
);
INSERT OR IGNORE INTO pilot_budget (id) VALUES (1);

CREATE TABLE IF NOT EXISTS pilot_scans (
  id TEXT PRIMARY KEY,
  invite_hash TEXT NOT NULL REFERENCES pilot_invites(code_hash),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','expired')),
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at INTEGER,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK (cost_micro_usd >= 0)
);
CREATE INDEX IF NOT EXISTS pilot_scans_by_status ON pilot_scans(status, started_at);

-- All three operations happen inside the same SQLite statement/transaction.
-- A failed limit check aborts the invite increment (and no credit is spent).
CREATE TRIGGER IF NOT EXISTS pilot_reserve_scan
AFTER UPDATE OF used ON pilot_invites
WHEN NEW.used = OLD.used + 1
BEGIN
  SELECT CASE WHEN (SELECT claimed_scans >= max_scans OR spent_micro_usd + reserved_micro_usd + 30000 > max_spend_micro_usd FROM pilot_budget WHERE id=1)
    THEN RAISE(ABORT, 'BUDGET_EXHAUSTED') END;
  INSERT INTO pilot_scans (id, invite_hash) VALUES (NEW.last_attempt_id, NEW.code_hash);
  UPDATE pilot_budget
    SET claimed_scans = claimed_scans + 1,
        reserved_micro_usd = reserved_micro_usd + 30000
    WHERE id=1;
END;

-- A successful scan consumes a scan credit; its reserved amount is reconciled
-- against measured Anthropic token usage.
CREATE TRIGGER IF NOT EXISTS pilot_finish_scan
AFTER UPDATE OF status ON pilot_scans
WHEN OLD.status='pending' AND NEW.status='succeeded'
BEGIN
  UPDATE pilot_budget SET
    completed_scans=completed_scans+1,
    reserved_micro_usd=reserved_micro_usd-30000,
    spent_micro_usd=spent_micro_usd+NEW.cost_micro_usd
  WHERE id=1;
END;

-- Failed/expired scans return one scan credit but still account for any
-- metered API usage (e.g. malformed model output, provider response failure).
CREATE TRIGGER IF NOT EXISTS pilot_refund_scan
AFTER UPDATE OF status ON pilot_scans
WHEN OLD.status='pending' AND NEW.status IN ('failed','expired')
BEGIN
  UPDATE pilot_invites SET used=used-1 WHERE code_hash=NEW.invite_hash;
  UPDATE pilot_budget SET
    claimed_scans=claimed_scans-1,
    failed_scans=failed_scans+1,
    reserved_micro_usd=reserved_micro_usd-30000,
    spent_micro_usd=spent_micro_usd+NEW.cost_micro_usd
  WHERE id=1;
END;
