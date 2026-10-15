-- Adopt the original public intake schema without changing existing rows.
CREATE TABLE IF NOT EXISTS public.mobile_challenges (
  challenge_id text PRIMARY KEY,
  challenge jsonb NOT NULL,
  expires_at bigint NOT NULL,
  consumed boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.mobile_operations (
  owner_key text NOT NULL,
  request_id text NOT NULL,
  terms_hash text NOT NULL,
  PRIMARY KEY (owner_key, request_id)
);

CREATE TABLE IF NOT EXISTS public.mobile_authorizations (
  authorization_key text PRIMARY KEY,
  challenge_id text UNIQUE NOT NULL,
  terms_hash text NOT NULL,
  response jsonb NOT NULL
);
