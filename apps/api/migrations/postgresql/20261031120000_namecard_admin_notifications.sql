-- ims:migration-phase: post-data

-- The management window can rewrite a card and move it between accounts, which
-- the owner has to hear about: one notice per edited card and one per side of a
-- transfer.

ALTER TABLE public.namecard_notifications
    DROP CONSTRAINT namecard_notifications_kind_check;
ALTER TABLE public.namecard_notifications
    ADD CONSTRAINT namecard_notifications_kind_check
        CHECK (kind IN (
            'card-approved', 'card-rejected', 'claim-approved', 'claim-rejected',
            'station-message', 'card-locked', 'card-unlocked',
            'card-admin-edited', 'card-transferred-in', 'card-transferred-out'
        ));
