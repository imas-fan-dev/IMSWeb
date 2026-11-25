import type { Context } from 'hono';
import type { AdminFudabaGuestSubmissionSettingsRequest } from '@imsweb/contracts/fudaba';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import type { FudabaGuestSubmissionSettingsResponse } from '@/domains/community/namecards/moderation/guest-submission-response';
import { fudabaRepository } from '@/middleware/hono-context';

type SettingsContext = Context<AppEnvironment, string, { out: { json: AdminFudabaGuestSubmissionSettingsRequest } }>;

export async function handleGetGuestSubmissionSettings(c: Context<AppEnvironment>): Promise<Response> {
    c.header('Cache-Control', 'private, no-store');
    const enabled = await fudabaRepository(c).getGuestSubmissionEnabled();
    return c.json({ success: true, enabled } satisfies FudabaGuestSubmissionSettingsResponse);
}

export async function handleUpdateGuestSubmissionSettings(c: SettingsContext): Promise<Response> {
    const enabled = await fudabaRepository(c).setGuestSubmissionEnabled(c.req.valid('json').enabled);
    await writeAudit(c, enabled ? '开启匿名名片投稿' : '关闭匿名名片投稿', 'namecard_guest_submission');
    return c.json({ success: true, enabled } satisfies FudabaGuestSubmissionSettingsResponse);
}
