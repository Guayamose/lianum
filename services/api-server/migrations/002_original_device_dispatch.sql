-- Separate original-device migration. Does not adopt or change V1 intake rows.
CREATE TABLE public.original_device_dispatch_meta_v1 (
  metadata_key text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE public.original_device_dispatch_v1 (
  operation_key text PRIMARY KEY,
  consent_key text UNIQUE NOT NULL,
  terms_hash text NOT NULL,
  state text NOT NULL
);
