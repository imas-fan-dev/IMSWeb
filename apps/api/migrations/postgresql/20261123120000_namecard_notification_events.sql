-- ims:migration-phase: post-data
-- PostgreSQL delivers this hint only at commit and folds duplicate hints for
-- the same recipient within a transaction, including bulk station messages.
CREATE FUNCTION public.notify_namecard_notification_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM pg_notify('ims_namecard_inbox_changed', OLD.recipient_account_id);
    ELSE
        PERFORM pg_notify('ims_namecard_inbox_changed', NEW.recipient_account_id);
        IF TG_OP = 'UPDATE' AND OLD.recipient_account_id IS DISTINCT FROM NEW.recipient_account_id THEN
            PERFORM pg_notify('ims_namecard_inbox_changed', OLD.recipient_account_id);
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER namecard_notification_change
AFTER INSERT OR UPDATE OR DELETE ON public.namecard_notifications
FOR EACH ROW EXECUTE FUNCTION public.notify_namecard_notification_change();
