-- apps/orchestrator/src/db/sql/buyerlab2.sql
-- Buyer Lab, sub-project 2. Additive and idempotent. Apply with scripts/apply-buyerlab2-schema.cjs.
-- Must stay in step with src/db/schemaBuyerLab.ts (a test checks every column).

ALTER TABLE buyer_projects ADD COLUMN IF NOT EXISTS self_test boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS buyer_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
  run_id uuid NOT NULL REFERENCES buyer_runs(id) ON DELETE cascade,
  body jsonb NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS buyer_reports_run_idx ON buyer_reports (run_id);

CREATE TABLE IF NOT EXISTS buyer_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
  run_id uuid NOT NULL REFERENCES buyer_runs(id) ON DELETE cascade,
  persona_id uuid NOT NULL,
  role text NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS buyer_chats_run_persona_idx ON buyer_chats (tenant_id, run_id, persona_id, created_at);
