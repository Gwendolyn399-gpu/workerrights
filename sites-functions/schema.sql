CREATE TABLE app.cases (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  scene text NOT NULL,
  title text NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'collecting',
  facts jsonb NOT NULL,
  facts_revision integer NOT NULL DEFAULT 0,
  facts_meta jsonb NOT NULL,
  intake jsonb NOT NULL,
  derived_results jsonb NOT NULL,
  messages jsonb NOT NULL,
  message_seq integer NOT NULL DEFAULT 0,
  row_version integer NOT NULL DEFAULT 0,
  plan_generated_at timestamptz,
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cases_owner_updated_idx ON app.cases (owner_id, updated_at);
CREATE TABLE app.qca_locks (
  lock_key text PRIMARY KEY,
  holder text NOT NULL,
  fencing bigint NOT NULL,
  expires_at timestamptz NOT NULL,
  value jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.qca_intents (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES app.cases (id),
  owner_id text NOT NULL,
  idempotency_key uuid NOT NULL,
  fingerprint text NOT NULL,
  state text NOT NULL,
  session_id text,
  prompt_event_id text,
  last_event_id text,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, idempotency_key)
);
CREATE INDEX qca_intents_case_idx ON app.qca_intents (case_id, created_at);
CREATE INDEX qca_intents_fingerprint_idx ON app.qca_intents (case_id, fingerprint, created_at);