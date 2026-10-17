-- Buyer Lab, sub-project 1. Additive and idempotent. Apply with scripts/apply-buyerlab-schema.cjs.
-- Must stay in step with src/db/schemaBuyerLab.ts (a test checks every column).

CREATE TABLE IF NOT EXISTS buyer_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
  name text NOT NULL,
  target_url text,
  brief text,
  self_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS buyer_projects_tenant_idx ON buyer_projects (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS buyer_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
  project_id uuid NOT NULL REFERENCES buyer_projects(id) ON DELETE cascade,
  kind text NOT NULL,
  surface text NOT NULL,
  label text NOT NULL,
  url text,
  content_hash text NOT NULL,
  text text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS buyer_sources_project_idx ON buyer_sources (tenant_id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS buyer_sources_project_hash_idx ON buyer_sources (project_id, content_hash);

CREATE TABLE IF NOT EXISTS buyer_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
  project_id uuid NOT NULL REFERENCES buyer_projects(id) ON DELETE cascade,
  archetype text NOT NULL,
  surfaces jsonb NOT NULL DEFAULT '["public"]'::jsonb,
  spec jsonb NOT NULL,
  edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS buyer_personas_project_idx ON buyer_personas (tenant_id, project_id);

CREATE TABLE IF NOT EXISTS buyer_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
  project_id uuid NOT NULL REFERENCES buyer_projects(id) ON DELETE cascade,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  config jsonb NOT NULL,
  calls_used integer NOT NULL DEFAULT 0,
  call_budget integer NOT NULL,
  funded_by text NOT NULL,
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS buyer_runs_project_idx ON buyer_runs (tenant_id, project_id, created_at);

CREATE TABLE IF NOT EXISTS buyer_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
  run_id uuid NOT NULL REFERENCES buyer_runs(id) ON DELETE cascade,
  step_key text NOT NULL,
  status text NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  output jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS buyer_run_steps_run_step_idx ON buyer_run_steps (run_id, step_key);

CREATE TABLE IF NOT EXISTS buyer_outcomes (
  run_id uuid PRIMARY KEY REFERENCES buyer_runs(id) ON DELETE cascade,
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
  outcome jsonb NOT NULL,
  built_at timestamptz NOT NULL DEFAULT now()
);
