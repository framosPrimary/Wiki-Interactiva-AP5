CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commit_sha text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('staging','published','failed','superseded')),
  source_path text NOT NULL,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS active_content_version (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version_id uuid NOT NULL REFERENCES content_versions(id)
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
  slug text NOT NULL,
  source_path text NOT NULL,
  title text NOT NULL,
  module text NOT NULL,
  submodule text,
  document_id text,
  revision integer,
  review_status text,
  content text NOT NULL,
  headings jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(content,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(document_id,'') || ' ' || coalesce(source_path,'')), 'A')
  ) STORED,
  UNIQUE(version_id, slug),
  UNIQUE(version_id, source_path)
);

CREATE TABLE IF NOT EXISTS chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  source_path text NOT NULL,
  title text NOT NULL,
  heading text,
  anchor text,
  content text NOT NULL,
  authority text NOT NULL CHECK (authority IN ('functional','supplemental')),
  source_kind text NOT NULL,
  review_status text,
  limitations text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(heading,'')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(content,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(source_path,'')), 'C')
  ) STORED
);

CREATE INDEX IF NOT EXISTS documents_version_idx ON documents(version_id);
CREATE INDEX IF NOT EXISTS documents_search_idx ON documents USING gin(search_vector);
CREATE INDEX IF NOT EXISTS documents_title_trgm_idx ON documents USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS chunks_version_idx ON chunks(version_id, authority);
CREATE INDEX IF NOT EXISTS chunks_search_idx ON chunks USING gin(search_vector);

CREATE TABLE IF NOT EXISTS sync_events (
  id bigserial PRIMARY KEY,
  commit_sha text NOT NULL,
  outcome text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Reservadas para la fase posterior. El MVP no escribe conversaciones.
CREATE TABLE IF NOT EXISTS future_interaction_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending_review',
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
