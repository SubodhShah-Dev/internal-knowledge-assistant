CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  original_name text NOT NULL,
  stored_path text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id bigserial PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  page_number integer,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS document_chunks_search_gin ON document_chunks USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS documents_owner_idx ON documents(owner_id);

CREATE TABLE IF NOT EXISTS conversations (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_user_updated_idx
  ON conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS qa_history (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id bigint REFERENCES conversations(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Upgrades for databases created before chat sessions existed.
ALTER TABLE qa_history ADD COLUMN IF NOT EXISTS conversation_id bigint REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE qa_history ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS qa_history_conv_idx ON qa_history (conversation_id, id);

-- Groundedness Audit: one row per verified answer, holding the per-claim
-- entailment results and the overall groundedness score (0-100).
CREATE TABLE IF NOT EXISTS answer_verifications (
  id bigserial PRIMARY KEY,
  qa_history_id bigint NOT NULL REFERENCES qa_history(id) ON DELETE CASCADE,
  overall_score numeric(5,2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  status text NOT NULL CHECK (status IN ('verified', 'partial', 'unsupported', 'unverified')),
  verifier_model text NOT NULL,
  claims jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS answer_verifications_qa_idx ON answer_verifications(qa_history_id);

CREATE TABLE IF NOT EXISTS conversation_documents (
  conversation_id bigint NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, document_id)
);
CREATE INDEX IF NOT EXISTS conversation_documents_doc_idx ON conversation_documents(document_id);

-- Backfill legacy conversations to include all documents for a user.
-- Use a DO block to run DML only if the table is empty and only once.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM conversation_documents) THEN
    INSERT INTO conversation_documents (conversation_id, document_id)
    SELECT c.id, d.id
    FROM conversations c
    JOIN documents d ON d.owner_id = c.user_id;
  END IF;
END;
$$;

-- Admin CMS: configurable models and app settings.
CREATE TABLE IF NOT EXISTS models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  model_id text NOT NULL UNIQUE,
  base_url text,
  api_key text,
  is_enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Session's chosen model (NULL = use default/env fallback).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS model_id uuid REFERENCES models(id) ON DELETE SET NULL;

-- Audit: which model answered each turn.
ALTER TABLE qa_history ADD COLUMN IF NOT EXISTS model text;
