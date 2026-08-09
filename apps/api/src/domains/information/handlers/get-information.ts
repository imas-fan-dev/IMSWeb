import { readInformationIndex } from '@/domains/information/content-store';
import type { InformationCardRequestContext } from '@/domains/information/request';
import type {
    InformationErrorResponse,
    PublicInformationDetailResponse
} from '@/domains/information/response';
import { publicInformationCard } from '@/domains/information/public-response';
import { services } from '@/middleware/hono-context';

export async function handleGetInformation(c: InformationCardRequestContext): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const { index } = await readInformationIndex(storage);
    const { id } = c.req.valid('param');
    const card = index.cards.find((candidate) => candidate.id === id);
    if (!card || card.contentType !== 'html' || !card.html) {
        return c.json({ error: '活动内容不存在' } satisfies InformationErrorResponse, 404);
    }
    c.header('Cache-Control', 'no-cache');
    return c.json({
        card: await publicInformationCard(storage, card)
    } satisfies PublicInformationDetailResponse);
}
