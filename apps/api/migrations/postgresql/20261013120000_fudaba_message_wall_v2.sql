-- ims:migration-phase: post-data
INSERT INTO public.fudaba_office_walls(office_id)
SELECT id FROM public.fudaba_offices ON CONFLICT(office_id) DO NOTHING;
ALTER TABLE public.fudaba_messages
  ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'published' CHECK (publication_status IN ('published','pending')),
  ADD COLUMN color TEXT NOT NULL DEFAULT 'cream' CHECK (color IN ('cream','rose','mint','blue','lavender')),
  ADD COLUMN content_revision INTEGER NOT NULL DEFAULT 0 CHECK (content_revision >= 0),
  ADD COLUMN moderation_revision INTEGER NOT NULL DEFAULT 0 CHECK (moderation_revision >= 0),
  ADD COLUMN updated_at TIMESTAMPTZ,
  ADD COLUMN admin_hidden_at TIMESTAMPTZ,
  ADD COLUMN admin_hidden_by_id BIGINT REFERENCES public.backoffice_accounts(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fudaba_message_admin_hidden_pair CHECK ((admin_hidden_at IS NULL) = (admin_hidden_by_id IS NULL)),
  ADD CONSTRAINT fudaba_message_identity_office UNIQUE(id,office_id);
UPDATE public.fudaba_messages SET updated_at=created_at;
ALTER TABLE public.fudaba_messages ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.fudaba_messages ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.fudaba_messages ADD CONSTRAINT fudaba_message_updated_time CHECK(updated_at>=created_at);
CREATE TABLE public.fudaba_message_placements (
  message_id TEXT PRIMARY KEY,
  office_id TEXT NOT NULL REFERENCES public.fudaba_offices(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL,
  world_x DOUBLE PRECISION NOT NULL CHECK (world_x BETWEEN -1000000 AND 1000000),
  world_y DOUBLE PRECISION NOT NULL CHECK (world_y BETWEEN -1000000 AND 1000000),
  rotation DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (rotation BETWEEN -12 AND 12),
  z_index INTEGER NOT NULL CHECK (z_index BETWEEN 1 AND 2147483000),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TIMESTAMPTZ NOT NULL CHECK(updated_at>=pinned_at),
  FOREIGN KEY(message_id,office_id) REFERENCES public.fudaba_messages(id,office_id) ON DELETE CASCADE
);
INSERT INTO public.fudaba_message_placements(message_id,office_id,pinned_at,world_x,world_y,z_index,updated_at)
SELECT ranked.id, ranked.office_id, ranked.created_at,
  800 + ((ranked.ordinal-1)%4)*280, 200 + floor((ranked.ordinal-1)/4.0)*320,
  wall.max_z_index+ranked.ordinal, ranked.created_at
FROM (SELECT id,office_id,created_at,row_number() OVER(PARTITION BY office_id ORDER BY created_at,id)::INTEGER AS ordinal FROM public.fudaba_messages) ranked
JOIN public.fudaba_office_walls wall ON wall.office_id=ranked.office_id;
UPDATE public.fudaba_office_walls wall SET
  max_z_index=GREATEST(wall.max_z_index, placements.max_z),
  right_edge=GREATEST(wall.right_edge, ceil(placements.max_x/800.0)*800),
  bottom_edge=GREATEST(wall.bottom_edge, ceil(placements.max_y/450.0)*450)
FROM (SELECT office_id,max(z_index) AS max_z,max(world_x+150) AS max_x,max(world_y+160) AS max_y FROM public.fudaba_message_placements GROUP BY office_id) placements
WHERE placements.office_id=wall.office_id;
CREATE INDEX fudaba_message_placements_office_order ON public.fudaba_message_placements(office_id,pinned_at,message_id);
CREATE INDEX fudaba_messages_author_order ON public.fudaba_messages(author_account_id,created_at DESC,id DESC);
CREATE INDEX fudaba_messages_public_v2 ON public.fudaba_messages(office_id,created_at,id) WHERE hidden_at IS NULL AND admin_hidden_at IS NULL;
CREATE TABLE public.fudaba_message_publish_cooldowns (
  account_id TEXT NOT NULL REFERENCES public.platform_accounts(id) ON DELETE CASCADE,
  office_id TEXT NOT NULL REFERENCES public.fudaba_offices(id) ON DELETE CASCADE,
  last_published_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(account_id,office_id)
);
CREATE TABLE public.fudaba_message_moderation_audit (
  id BIGSERIAL PRIMARY KEY, message_id TEXT NOT NULL, office_id TEXT NOT NULL,
  layer TEXT NOT NULL CHECK(layer IN ('office','admin')),
  actor_account_id TEXT REFERENCES public.platform_accounts(id) ON DELETE RESTRICT,
  actor_admin_id BIGINT REFERENCES public.backoffice_accounts(id) ON DELETE RESTRICT,
  hidden BOOLEAN NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  CHECK((layer='office' AND actor_account_id IS NOT NULL AND actor_admin_id IS NULL)
    OR (layer='admin' AND actor_admin_id IS NOT NULL AND actor_account_id IS NULL))
);
