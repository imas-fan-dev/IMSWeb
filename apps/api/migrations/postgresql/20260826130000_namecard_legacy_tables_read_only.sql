-- ims:migration-phase: post-data

-- The legacy anonymous namecard tables (cards, card_emojis) no longer take
-- application writes -- Stage 2 moved every read/write path onto
-- fudaba_cards and namecard_reactions -- but the owner wants the original
-- anonymous submissions and legacy reactions kept as long-term business
-- data rather than dropped. This migration turns both tables into a
-- read-only archive instead of deleting them.
--
-- They stay under their own names in the public schema. Several read paths
-- still join `cards` unqualified by name at request time (claim creation in
-- SqlFudabaRepository.createCardClaimInTransaction, the admin claim-review
-- queue in findAdminCardClaim/listAdminPendingClaims,
-- listLegacyNamecardClaimStatuses), and moving the table into another
-- schema would mean rewriting every one of those call sites and the
-- connection's search_path for no benefit: the goal here is only to stop
-- writes, not relocate data.
--
-- REVOKE is not used either: this project connects as one database role
-- for both migrations and the application, and that role owns both tables
-- (it created them), so PostgreSQL lets a table owner bypass its own
-- REVOKE. A BEFORE trigger is enforced regardless of role or ownership, so
-- it is used here instead.
--
-- Guard: every legacy row must already be represented in fudaba_cards
-- before writes are locked out, matching what
-- `pnpm run migration:namecard-reconcile` reports clean.

DO $$
DECLARE
    legacy_total BIGINT;
    represented_total BIGINT;
BEGIN
    SELECT count(*) INTO legacy_total FROM public.cards;
    SELECT count(*) INTO represented_total
    FROM public.cards legacy
    WHERE EXISTS (
        SELECT 1 FROM public.fudaba_cards unified
        WHERE unified.card_number = legacy.id
    );
    IF legacy_total <> represented_total THEN
        RAISE EXCEPTION
            'namecard archive: % legacy card(s) but only % represented in fudaba_cards; run migration:namecard-reconcile before retiring the legacy tables',
            legacy_total, represented_total;
    END IF;
END
$$;

CREATE FUNCTION public.reject_legacy_namecard_write() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION
        USING
            MESSAGE = format(
                '%I is a read-only archive; write through fudaba_cards / namecard_reactions instead',
                TG_TABLE_NAME
            ),
            ERRCODE = 'read_only_sql_transaction';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cards_read_only
    BEFORE INSERT OR UPDATE OR DELETE ON public.cards
    FOR EACH ROW EXECUTE FUNCTION public.reject_legacy_namecard_write();
CREATE TRIGGER cards_read_only_truncate
    BEFORE TRUNCATE ON public.cards
    FOR EACH STATEMENT EXECUTE FUNCTION public.reject_legacy_namecard_write();

CREATE TRIGGER card_emojis_read_only
    BEFORE INSERT OR UPDATE OR DELETE ON public.card_emojis
    FOR EACH ROW EXECUTE FUNCTION public.reject_legacy_namecard_write();
CREATE TRIGGER card_emojis_read_only_truncate
    BEFORE TRUNCATE ON public.card_emojis
    FOR EACH STATEMENT EXECUTE FUNCTION public.reject_legacy_namecard_write();

COMMENT ON TABLE public.cards IS
    'Read-only archive of anonymous namecard submissions, superseded by fudaba_cards. Writes are rejected by the cards_read_only trigger.';
COMMENT ON TABLE public.card_emojis IS
    'Read-only archive of legacy namecard reactions, superseded by namecard_reactions. Writes are rejected by the card_emojis_read_only trigger.';
