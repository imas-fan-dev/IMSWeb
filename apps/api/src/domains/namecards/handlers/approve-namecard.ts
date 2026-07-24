import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import { namecardRepository } from '@/middleware/hono-context';
import { positiveInteger } from '@/utils/validation/number';

export async function handleApproveNamecard(c: Context<AppEnvironment>): Promise<Response> {
    const id = positiveInteger(c.req.param('id')) || 0;
    try {
        await namecardRepository(c).approveCard(id);
        await writeAudit(c, '审核图片通过', `card_id=${id}`);
        return c.json({ success: true });
    } catch {
        return c.json({ success: false });
    }
}
