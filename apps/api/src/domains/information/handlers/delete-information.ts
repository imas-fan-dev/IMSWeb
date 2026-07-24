import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import { updateInformationIndex } from '@/domains/information/content-store';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { services } from '@/middleware/hono-context';

export async function handleDeleteInformation(c: Context<AppEnvironment>): Promise<Response> {
    const runtime = services(c);
    if (!runtime.storage) throw new Error('Object storage unavailable');
    const id = c.req.param('id') || '';
    let title = id;
    try {
        await updateInformationIndex(runtime.storage, (index) => {
            const card = index.cards.find((candidate) => candidate.id === id);
            if (!card) throw Object.assign(new Error('活动内容不存在'), { status: 404 });
            title = card.title;
            return { ...index, cards: index.cards.filter((candidate) => candidate.id !== id) };
        });
        await writeAudit(c, '删除活动内容', title);
        return c.json({ success: true });
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to delete information card', error);
        return c.json({
            error: status >= 500 ? '活动内容删除失败' : messageFromError(error)
        }, status as 404 | 409 | 500);
    }
}
