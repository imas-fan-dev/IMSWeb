-- ims:migration-phase: post-data

ALTER TABLE public.users
    ADD COLUMN admin_role TEXT;

UPDATE public.users
SET admin_role = 'admin'
WHERE dept = 'op';

ALTER TABLE public.users
    ADD CONSTRAINT users_admin_role_matches_department_check
    CHECK (
        (dept = 'op' AND admin_role IN ('admin', 'super_admin'))
        OR (dept <> 'op' AND admin_role IS NULL)
    );

CREATE UNIQUE INDEX users_one_super_admin_idx
    ON public.users(admin_role)
    WHERE admin_role = 'super_admin';
